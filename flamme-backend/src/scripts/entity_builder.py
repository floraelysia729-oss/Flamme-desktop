"""
Entity Builder — jieba 地基 + LLM 知识编译 + jieba 校验

三阶段管道：
  1. jieba 预处理：grep 源文件 → TextRank 评分 → 定义候选 → 共现分析
  2. LLM 知识编译：基于事实基础编写摘要、要点、矛盾标注
  3. jieba 后校验：验证 LLM 输出与源段落对齐度

用法:
  python scripts/entity_builder.py <path> [--dry-run] [--interval 2.0]

示例:
  python scripts/entity_builder.py "pro/人工智能导论" --dry-run
  python scripts/entity_builder.py "pro/人工智能导论/.flamme/converted/2.无信息搜索.md"
"""

import argparse
import json
import logging
import os
import re
import sys
import time
from collections import Counter
from datetime import date
from pathlib import Path

logger = logging.getLogger(__name__)

try:
    sys.stdout.reconfigure(encoding="utf-8", line_buffering=True)
except (OSError, AttributeError, ValueError):
    pass

from src.scripts import (
    VAULT, all_entity_files, all_flamme_dirs,
    entities_dir, converted_dir, source_dir_for_path,
)
from src.scripts.llm_utils import get_client, call_llm, strip_frontmatter, extract_title

# ── 常量 ─────────────────────────────────────────────────────────────

_ILLEGAL_FILENAME_CHARS = re.compile(r'[<>:"/\\|?*]')

def _safe_filename(name: str) -> str:
    """清洗文件名：去除 Windows 不允许的字符"""
    return _ILLEGAL_FILENAME_CHARS.sub('_', name)

# 结构性噪声：PPT 页脚、OCR 残留、格式标记
_NOISE_WORDS = frozenset({
    'OCR', 'Page', 'page', '提纲', '目录',  # 转换残留
    'vs', 'VS',                               # 通用连接词
    'Video', 'Demo', 'Next', 'Back',          # PPT UI 元素
})

def _is_noise(term: str) -> bool:
    """基于结构特征判断噪声词"""
    # 1. 纯英文大写且长度>5 → 多数是机构名/logo（NANJING, UNIVERSITY, BEIJING）
    #    但保留常见缩写（BFS, DFS, UCS, AI, ML）
    if term.isalpha() and term.isupper() and len(term) > 5:
        return True
    # 2. 常见英文停用词
    if term.lower() in {'the', 'of', 'in', 'on', 'at', 'to', 'for', 'and', 'or', 'is', 'are'}:
        return True
    # 3. 已知噪声词
    if term in _NOISE_WORDS or term.upper() in _NOISE_WORDS:
        return True
    # 4. 中文机构名模式（XX大学、XX学院）
    if re.match(r'^.{1,4}(大学|学院|研究院)$', term):
        return True
    return False

MAX_CONTENT_CHARS = 6000       # LLM 术语识别的截断限制
MAX_SENTENCES_PER_SOURCE = 5   # 每个来源的关键句子数
MAX_SENTENCES_TOTAL = 30       # 跨所有来源
MAX_ENTITY_CHARS = 3000        # 最大实体页面长度
MIN_PARAGRAPH_LEN = 15         # 过滤 PPT 标题噪声

COMPILE_SYSTEM_PROMPT = """你是知识管理助手。基于提供的源文件摘录，编译一个知识实体。

规则：
1. 输出严格 JSON，不包含 markdown 标记
2. 格式:
{
  "summary": "...",
  "key_points": [...],
  "contradictions": [...],
  "prerequisites": [...],
  "coordinate": [...],
  "related": [...],
  "tags": [...]
}
3. summary: 一段话概括，必须基于摘录内容，不要编造摘录中没有的信息
4. key_points: 3-7 个要点，格式"要点名: 简要说明"
5. contradictions: 如果已有实体内容与新信息矛盾，列出矛盾点；如无矛盾输出空数组
6. 关系分类（**仅概念名**，禁止「概念名: 说明」格式；不含方括号；互不重复；同一概念只出现在一个列表）：
   - prerequisites: 先修/上位概念（学本概念前应先掌握），0-3 个。例：有信息搜索的先修可含「无信息搜索」「搜索问题形式化」
   - coordinate: 并列/对比概念（同层级可选方案），0-3 个。例：有信息搜索的并列可含「无信息搜索」
   - related: 弱相关/跨域引用（非先修非并列），0-4 个。只写摘录中明确提到的具体算法/方法名
   禁止把课程大纲里的宽泛章节（机器学习、深度学习、强化学习、逻辑推理、大语言模型、人工智能、算法）塞进 related，
   除非摘录正文明确讨论该概念与当前实体的关系。
   共现概念仅供参考，不要照搬。
7. tags: 2-4 个**细粒度**标签，描述本概念所属子领域（如「启发式搜索」「A*算法」）。
   禁止：课程名、学科大类（人工智能、算法、搜索、信息）、与实体标题重复的词、纯英文碎片。
8. 如果已有实体存在，你的任务是更新而非重写——保留仍然有效的内容，补充新信息
9. 不要在 summary 中重复标题"""

# 课程大纲级宽泛词 — 不宜作为实体 tags 或泛 related
_BROAD_COURSE_TERMS = frozenset({
    "人工智能", "机器学习", "深度学习", "强化学习", "逻辑推理", "大语言模型",
    "多模态大模型", "算法", "搜索", "信息", "Informed", "informed",
})

MAX_ENRICH_PER_FILE = 6  # 单文件增量补充已有实体的上限（控制 LLM 调用）


def _concept_name_only(raw: str) -> str:
    """关系字段只保留概念名，剥离 key_points 风格的「名: 说明」后缀。"""
    s = str(raw).strip().strip("[]").strip().strip('"')
    for sep in (":", "："):
        if sep in s:
            s = s.split(sep, 1)[0].strip()
    return s


def _norm_name_list(items, term: str) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    title_lower = term.strip().lower()
    for raw in items or []:
        s = _concept_name_only(raw)
        if not s or len(s) < 2:
            continue
        key = s.lower()
        if key in seen or key == title_lower:
            continue
        if _is_noise(s):
            continue
        seen.add(key)
        out.append(s)
    return out


def _parse_source_names(existing_fm: dict | None) -> list[str]:
    if not existing_fm:
        return []
    raw = existing_fm.get("sources", [])
    if isinstance(raw, str):
        raw = [raw]
    out: list[str] = []
    for item in raw or []:
        s = str(item).strip().strip('"').strip()
        m = re.match(r"^\[\[(.+?)\]\]$", s)
        if m:
            s = m.group(1).strip()
        else:
            s = s.strip("[]").strip()
        if s:
            out.append(s)
    return out


def _merge_source_names(existing_fm: dict | None, new_names: list[str]) -> list[str]:
    """更新实体时累加 sources，不丢历史来源。"""
    merged: list[str] = []
    seen: set[str] = set()
    for name in _parse_source_names(existing_fm) + list(new_names):
        if name and name not in seen:
            seen.add(name)
            merged.append(name)
    return merged


def _merge_entity_relations(entity_json: dict, existing_fm: dict | None, term: str) -> dict:
    """更新实体时合并 frontmatter 关系（新结果优先，保留旧链接）。"""
    if not existing_fm:
        return entity_json
    caps = {"prerequisites": 3, "coordinate": 3, "related": 4, "tags": 4}
    for field, cap in caps.items():
        old = _norm_name_list(existing_fm.get(field, []), term)
        new = _norm_name_list(entity_json.get(field, []), term)
        if field == "tags" and isinstance(existing_fm.get("tags"), str):
            old = _norm_name_list(
                [t.strip() for t in existing_fm["tags"].split(",") if t.strip()], term
            )
        merged: list[str] = []
        seen: set[str] = set()
        for name in new + old:
            key = name.lower()
            if key not in seen:
                seen.add(key)
                merged.append(name)
        entity_json[field] = merged[:cap]
    return entity_json


def find_enrichment_terms(body: str, existing_entities: set[str],
                          skip_terms: set[str]) -> list[str]:
    """新笔记正文提及的已有实体 → 增量编译候选（不经过 identify_terms）。"""
    candidates: list[str] = []
    body_lower = body.lower()
    for name in sorted(existing_entities):
        if not name or len(name) < 2 or name in skip_terms:
            continue
        if name not in body and name.lower() not in body_lower:
            continue
        paragraphs = [
            p for p in body.split("\n\n")
            if (name in p or name.lower() in p.lower())
            and len(p.strip()) >= MIN_PARAGRAPH_LEN
        ]
        if paragraphs:
            candidates.append(name)
        if len(candidates) >= MAX_ENRICH_PER_FILE:
            break
    return candidates


def _sanitize_entity_relations(entity_json: dict, term: str) -> dict:
    """后处理：去噪、去重、限制数量；不合并 jieba 共现。"""
    prereq = [r for r in _norm_name_list(entity_json.get("prerequisites", []), term)
              if r not in _BROAD_COURSE_TERMS][:3]
    coord = [r for r in _norm_name_list(entity_json.get("coordinate", []), term)
             if r not in _BROAD_COURSE_TERMS][:3]
    related = _norm_name_list(entity_json.get("related", []), term)
    related = [r for r in related if r not in prereq and r not in coord
               and r not in _BROAD_COURSE_TERMS][:4]

    tags = _norm_name_list(entity_json.get("tags", []), term)
    tags = [t for t in tags if t not in _BROAD_COURSE_TERMS and t.lower() != term.lower()][:4]

    entity_json["prerequisites"] = prereq
    entity_json["coordinate"] = coord
    entity_json["related"] = related
    entity_json["tags"] = tags
    return entity_json

IDENTIFY_SYSTEM_PROMPT = """你是知识管理助手。从给定笔记中识别值得建立独立概念页的技术术语。

规则：
1. 输出严格 JSON 数组，如 ["术语1", "术语2", "术语3"]
2. 提供 2-5 个术语
3. 只选值得拥有独立页面的核心概念（算法、定理、模型、方法）
4. 不要选已有实体
5. 不要选通用词（如"问题""方法""概念"）"""


# ── 实体定位 ──────────────────────────────────────────────────────────

def _clean_text_for_extraction(text: str) -> str:
    """清理文本用于 jieba 关键词提取：去 markdown 标记和噪声"""
    # 去掉 markdown 标题标记
    text = re.sub(r'^#{1,6}\s*', '', text, flags=re.MULTILINE)
    # 去掉 markdown 列表标记
    text = re.sub(r'^[\s]*[-*•]\s*', '', text, flags=re.MULTILINE)
    # 去掉 markdown 粗体/斜体标记
    text = re.sub(r'\*{1,2}([^*]+)\*{1,2}', r'\1', text)
    # 去掉短行（<10 字符，通常是 PPT 幻灯片标题/编号）
    lines = [l for l in text.split("\n") if len(l.strip()) >= 10]
    return "\n".join(lines)


def _filter_terms(terms: list[str]) -> list[str]:
    """过滤 jieba 提取的术语：保留中文核心术语"""
    filtered = []
    for t in terms:
        t = t.strip()
        if len(t) < 2:
            continue
        # 必须包含至少一个中文字符
        if not re.search(r'[\u4e00-\u9fff]', t):
            continue
        # 排除 markdown 残留
        if re.match(r'^[#\-*>]', t):
            continue
        filtered.append(t)
    return filtered[:5]

def find_entity_path(term: str, vault_path: Path | None = None) -> Path | None:
    """在 vault/entities/ 中查找已有实体文件"""
    vp = vault_path or VAULT
    candidate = entities_dir(vp) / f"{_safe_filename(term)}.md"
    if candidate.exists():
        return candidate
    # fallback: 旧路径 .flamme/entities/（兼容迁移前数据）
    for fd in all_flamme_dirs(vp):
        legacy = fd / "entities" / f"{_safe_filename(term)}.md"
        if legacy.exists():
            return legacy
    return None


def collect_all_sources(vault_path: Path | None = None) -> list[Path]:
    """收集全 vault 摄入源：converted .md + 用户源 .md（Obsidian 笔记）"""
    from src.tools.sync import scan_all_md, is_source_doc

    vp = vault_path or VAULT
    seen: set[str] = set()
    sources: list[Path] = []

    def add(path: Path) -> None:
        try:
            key = str(path.resolve())
        except OSError:
            key = str(path)
        if key in seen or not path.is_file():
            return
        if path.name.endswith(".excalidraw.md") or path.name.startswith("~$"):
            return
        seen.add(key)
        sources.append(path)

    for fd in all_flamme_dirs(vp):
        conv = fd / "converted"
        if conv.exists():
            for f in conv.glob("*.md"):
                add(f)

    vault_str = str(vp)
    for relpath in scan_all_md(vault_str):
        if not is_source_doc(relpath):
            continue
        add(vp / relpath.replace("/", os.sep))

    return sorted(sources)


# ── 阶段 1: jieba 预处理 ────────────────────────────────────────────

def find_relevant_paragraphs(term: str, all_sources: list[Path]) -> dict[str, list[str]]:
    """grep 所有源文件中包含 term 的段落"""
    result = {}
    term_lower = term.lower()
    for src in all_sources:
        try:
            text = src.read_text(encoding="utf-8")
        except Exception:
            continue
        body = strip_frontmatter(text)
        paragraphs = [p.strip() for p in body.split("\n\n") if p.strip()]
        matching = [
            p for p in paragraphs
            if (term in p or term_lower in p.lower()) and len(p) >= MIN_PARAGRAPH_LEN
        ]
        if matching:
            result[src.stem] = matching
    return result


def _split_sentences(text: str) -> list[str]:
    """按中文标点分句"""
    # 先把换行替换为空格，避免跨行句子被切断
    text = text.replace("\n", " ")
    sents = re.split(r"[。！？；]", text)
    return [s.strip() for s in sents if len(s.strip()) > 5]


def _score_sentences(sentences: list[str], term: str, full_text: str) -> list[tuple[str, float]]:
    """用 jieba TextRank 为句子评分"""
    import jieba.analyse

    # 对全文提取 TextRank 关键词权重
    word_weights = dict(jieba.analyse.textrank(full_text, topK=50, withWeight=True))
    # TextRank 可能返回空（短文本），fallback 到 TF-IDF
    if not word_weights:
        word_weights = dict(jieba.analyse.extract_tags(full_text, topK=50, withWeight=True))

    scored = []
    for sent in sentences:
        words = list(jieba.cut(sent))
        # 句子分 = 句中词权重之和 / 词数 + term 出现奖励
        base_score = sum(word_weights.get(w, 0) for w in words) / max(len(words), 1)
        bonus = 0.5 if term in sent else 0
        scored.append((sent, base_score + bonus))

    scored.sort(key=lambda x: -x[1])
    return scored


def extract_key_sentences(term: str, paragraphs_by_source: dict[str, list[str]],
                          top_k: int = MAX_SENTENCES_PER_SOURCE) -> dict[str, list[str]]:
    """每源提取 top-k 关键句子"""
    result = {}
    for source_name, paragraphs in paragraphs_by_source.items():
        full_text = "\n".join(paragraphs)
        # 只保留包含 term 的句子
        all_sents = []
        for p in paragraphs:
            for s in _split_sentences(p):
                if term in s:
                    all_sents.append(s)
        if not all_sents:
            continue
        scored = _score_sentences(all_sents, term, full_text)
        result[source_name] = [s for s, _ in scored[:top_k]]
    return result


DEFINITION_PATTERNS = [
    re.compile(r"(.{0,20}%s[是为]指?(.{10,200}?)[。；])" % r"(.+?)"),
    re.compile(r"所谓(.{0,10}%s[，,]是指?(.{10,200}?)[。；])" % r"(.+?)"),
    re.compile(r"(.{0,20}%s的定义[是为](.{10,200}?)[。；])" % r"(.+?)"),
    re.compile(r"(.{0,50})称为(%s)[。；]" % r"(.+?)"),
    re.compile(r"(%s[：:](.{10,200}?))" % r"(.+?)"),
]


def extract_definition_candidates(term: str, sentences: list[str]) -> list[str]:
    """正则匹配中文定义句"""
    candidates = []
    escaped = re.escape(term)
    patterns = [
        re.compile(rf".{{0,20}}{escaped}[是为]指?.{{10,200}}?[。；]"),
        re.compile(rf"所谓{escaped}[，,]是指?.{{10,200}}?[。；]"),
        re.compile(rf".{{0,20}}{escaped}的定义[是为].{{10,200}}?[。；]"),
        re.compile(rf".{{0,30}}称为{escaped}[。；]"),
        re.compile(rf"{escaped}[：:].{{10,200}}?"),
    ]
    for sent in sentences:
        for pat in patterns:
            m = pat.search(sent)
            if m:
                candidates.append(m.group(0).strip())
                break  # 每句只取第一个匹配
    return candidates[:5]


def find_related_terms(term: str, all_sources: list[Path],
                       top_k: int = 10) -> list[tuple[str, int, str]]:
    """共现分析：与 term 出现在同一段落中的高频词"""
    import jieba.analyse

    cooccur = Counter()
    first_source = {}
    for src in all_sources:
        try:
            text = src.read_text(encoding="utf-8")
        except Exception:
            continue
        body = strip_frontmatter(text)
        paragraphs = [p.strip() for p in body.split("\n\n") if p.strip()]
        for p in paragraphs:
            if term in p and len(p) >= MIN_PARAGRAPH_LEN:
                tags = jieba.analyse.extract_tags(p, topK=8)
                for t in tags:
                    if t != term and len(t) >= 2 and not _is_noise(t):
                        cooccur[t] += 1
                        first_source.setdefault(t, src.stem)

    result = [(t, c, first_source[t]) for t, c in cooccur.most_common(top_k)]
    return result


# ── 阶段 2: LLM 知识编译 ────────────────────────────────────────────

def _jieba_terms(source_text: str, top_k: int = 10) -> list[str]:
    import jieba.analyse
    clean = _clean_text_for_extraction(source_text)
    raw_terms = jieba.analyse.extract_tags(clean, topK=top_k)
    return _filter_terms(raw_terms)


def identify_terms(source_text: str, existing_entities: set[str], client, model: str | None = None) -> list[str]:
    """LLM 识别值得建 entity 的术语"""
    existing_str = ", ".join(sorted(existing_entities)[:50]) if existing_entities else "无"
    user_msg = f"""## 已有实体（不要重复）
{existing_str}

## 笔记内容
{source_text[:MAX_CONTENT_CHARS]}"""

    messages = [
        {"role": "system", "content": IDENTIFY_SYSTEM_PROMPT},
        {"role": "user", "content": user_msg},
    ]

    try:
        raw = call_llm(client, messages, max_tokens=512, model=model)
    except Exception as e:
        logger.info(f"  [fallback] LLM failed ({e}), using jieba TF-IDF")
        return _jieba_terms(source_text)

    # 解析 JSON 数组
    text = raw.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\n?", "", text)
        text = re.sub(r"\n?```$", "", text)
    try:
        result = json.loads(text)
        if isinstance(result, list):
            return [str(t) for t in result if isinstance(t, str)]
    except json.JSONDecodeError:
        m = re.search(r"\[.*?\]", text, re.DOTALL)
        if m:
            try:
                result = json.loads(m.group())
                return [str(t) for t in result if isinstance(t, str)]
            except json.JSONDecodeError:
                pass

    # Fallback: jieba TF-IDF
    logger.info("  [fallback] jieba TF-IDF term extraction")
    return _jieba_terms(source_text)


def compile_entity(term: str, paragraphs_by_source: dict[str, list[str]],
                   key_sentences: dict[str, list[str]],
                   definition_candidates: list[str],
                   related_terms: list[tuple[str, int, str]],
                   existing_entity_text: str | None,
                   client, model: str | None = None) -> dict:
    """LLM 知识编译：基于事实基础写实体内容"""

    # 构建事实基础文本
    grounding_parts = []
    for src_name, sents in key_sentences.items():
        grounding_parts.append(f"### {src_name}")
        for s in sents:
            grounding_parts.append(f"- {s}")
    grounding_text = "\n".join(grounding_parts)

    def_candidates_str = "\n".join(f"- {d}" for d in definition_candidates) if definition_candidates else "无"

    related_str = ", ".join(f"{t}({c}次)" for t, c, _ in related_terms[:10]) if related_terms else "无"

    existing_section = ""
    if existing_entity_text:
        existing_section = f"""## 已有实体内容（请更新而非重写，保留有效内容，补充新信息，标注矛盾）
{existing_entity_text[:2000]}"""
    else:
        existing_section = "（新建实体）"

    user_msg = f"""## 实体: {term}

## 源文件摘录（事实基础）
{grounding_text}

## 定义候选
{def_candidates_str}

## 共现概念
{related_str}

{existing_section}"""

    messages = [
        {"role": "system", "content": COMPILE_SYSTEM_PROMPT},
        {"role": "user", "content": user_msg},
    ]

    try:
        raw = call_llm(client, messages, max_tokens=2048, model=model)
    except Exception as e:
        logger.info(f"    [error] LLM compilation failed: {e}")
        return None

    # 解析 JSON
    text = raw.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\n?", "", text)
        text = re.sub(r"\n?```$", "", text)
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r"\{[\s\S]*\}", text)
        if m:
            try:
                data = json.loads(m.group())
            except json.JSONDecodeError:
                logger.info(f"  [parse error] failed to parse LLM response for '{term}'")
                return None
        else:
            logger.info(f"  [parse error] no JSON found in response for '{term}'")
            return None

    # 规范化
    for field in ["summary", "key_points", "contradictions",
                  "prerequisites", "coordinate", "related", "tags"]:
        if field not in data:
            data[field] = [] if field != "summary" else ""
    if isinstance(data.get("key_points"), list):
        data["key_points"] = [str(kp) for kp in data["key_points"]]
    if isinstance(data.get("contradictions"), list):
        data["contradictions"] = [str(c) for c in data["contradictions"]]
    return _sanitize_entity_relations(data, term)


# ── 阶段 3: jieba 后校验 ────────────────────────────────────────────

def verify_entity(entity_json: dict, paragraphs_by_source: dict[str, list[str]]) -> dict:
    """检查 LLM 输出与源段落的事实对齐度"""
    import jieba.analyse

    all_text = "\n".join(
        p for paragraphs in paragraphs_by_source.values() for p in paragraphs
    )
    summary = entity_json.get("summary", "")
    if not summary:
        return {"overlap": 0.0, "missing_terms": []}

    summary_terms = jieba.analyse.extract_tags(summary, topK=10)
    if not summary_terms:
        return {"overlap": 1.0, "missing_terms": []}

    missing = [t for t in summary_terms if t not in all_text]
    overlap = 1 - len(missing) / len(summary_terms)
    return {"overlap": overlap, "missing_terms": missing}


def quality_score(has_definition: bool, source_count: int,
                  sentence_count: int, overlap_ratio: float) -> tuple[float, str]:
    """计算实体质量分 (0-1) 和状态"""
    score = (
        (1 if has_definition else 0) * 0.2 +
        min(source_count / 3, 1) * 0.2 +
        min(sentence_count / 10, 1) * 0.2 +
        overlap_ratio * 0.4
    )
    if score >= 0.6:
        return score, "stable"
    elif score >= 0.3:
        return score, "needs_review"
    else:
        return score, "discard"


# ── 实体页模板 ──────────────────────────────────────────────────────

def _looks_like_code(text: str) -> bool:
    """判断来源句是否更像代码片段（需围栏块渲染）"""
    if '```' in text:
        return True
    if text.count('\n') >= 2:
        return True
    keywords = ('class ', 'struct ', 'def ', '#include', 'public:', 'private:', 'namespace ',
                'int ', 'void ', 'return ', '};', 'std::')
    hits = sum(1 for kw in keywords if kw in text)
    if hits >= 2:
        return True
    return '{' in text and '}' in text and len(text) > 80


def _format_source_ref(src_name: str, sentence: str) -> list[str]:
    """来源依据块：wikilink 标题 + 正文；代码型内容用围栏块"""
    header = f"> **[[{src_name}]]**"
    text = sentence.strip()
    if not _looks_like_code(text):
        return [header, f"> {text}"]

    lang = "cpp" if any(k in text for k in ('class ', 'struct ', '#include', 'public:', 'std::')) else ""
    out = [header, ""]
    out.append(f"```{lang}".rstrip())
    for raw in text.splitlines():
        out.append(raw)
    out.append("```")
    return out


def build_entity_page(term: str, entity_json: dict,
                      paragraphs_by_source: dict[str, list[str]],
                      key_sentences: dict[str, list[str]],
                      related_terms: list[tuple[str, int, str]],
                      source_names: list[str], status: str,
                      existing_fm: dict | None = None) -> str:
    """拼装实体页 markdown"""
    today = date.today().isoformat()
    created = existing_fm.get("created", today) if existing_fm else today
    all_sources = _merge_source_names(existing_fm, source_names)
    sources_yaml = "\n".join(f'  - "[[{s}]]"' for s in all_sources)

    tags = entity_json.get("tags", [])
    tags_str = ", ".join(str(t) for t in tags) if tags else ""

    prerequisites = entity_json.get("prerequisites", [])
    coordinate = entity_json.get("coordinate", [])
    related = entity_json.get("related", [])

    def _yaml_links(names: list[str]) -> str:
        return "\n".join(f'  - "[[{n}]]"' for n in names) if names else "  []"

    prereq_yaml = _yaml_links(prerequisites)
    coord_yaml = _yaml_links(coordinate)
    related_yaml = _yaml_links(related)

    summary = entity_json.get("summary", "")
    key_points = entity_json.get("key_points", [])
    contradictions = entity_json.get("contradictions", [])

    # 来源依据：每源取前 2 个句子
    source_ref_lines: list[str] = []
    for src_name, sents in key_sentences.items():
        for s in sents[:2]:
            source_ref_lines.extend(_format_source_ref(src_name, s))

    # 拼装
    lines = [
        f"---",
        f'title: "{term}"',
        f"type: entity",
        f"created: {created}",
        f"updated: {today}",
        f"sources:",
        sources_yaml,
        f"tags: [{tags_str}]",
        f"prerequisites:",
        prereq_yaml,
        f"coordinate:",
        coord_yaml,
        f"related:",
        related_yaml,
        f"status: {status}",
        f"---",
        f"",
        f"# {term}",
        f"",
        f"## 概述",
        f"",
        summary,
        f"",
        f"## 要点",
        f"",
    ]
    for kp in key_points:
        lines.append(f"- {kp}")

    if contradictions:
        lines.append(f"")
        lines.append(f"## 矛盾与差异")
        lines.append(f"")
        for c in contradictions:
            lines.append(f"- {c}")

    if prerequisites:
        lines.append(f"")
        lines.append(f"## 先修概念")
        lines.append(f"")
        lines.append(" ".join(f"[[{r}]]" for r in prerequisites))
    if coordinate:
        lines.append(f"")
        lines.append(f"## 并列/对比")
        lines.append(f"")
        lines.append(" ".join(f"[[{r}]]" for r in coordinate))
    if related:
        lines.append(f"")
        lines.append(f"## 相关概念")
        lines.append(f"")
        lines.append(" ".join(f"[[{r}]]" for r in related))

    if source_ref_lines:
        lines.append(f"")
        lines.append(f"## 来源依据")
        lines.append(f"")
        lines.extend(source_ref_lines)

    page = "\n".join(lines)

    # 篇幅控制
    if len(page) > MAX_ENTITY_CHARS:
        # 砍来源依据的句子：每源只保留 1 句
        lines_trimmed = []
        in_refs = False
        ref_count = 0
        for line in lines:
            if line == "## 来源依据":
                in_refs = True
                ref_count = 0
                lines_trimmed.append(line)
                continue
            if in_refs and line.startswith(">"):
                ref_count += 1
                if ref_count <= len(key_sentences):  # 每源 1 句
                    lines_trimmed.append(line)
                continue
            lines_trimmed.append(line)
        page = "\n".join(lines_trimmed)

    return page


# ── 核心编排 ────────────────────────────────────────────────────────

def build_from_file(filepath: Path, all_sources: list[Path],
                    client, vault_path: Path | None = None,
                    dry_run: bool = False,
                    llm_model: str | None = None) -> list[Path]:
    """处理单个源文件，返回创建/更新的实体路径列表"""
    vp = vault_path or VAULT
    filepath = Path(filepath)
    logger.info("[ENTITY] build_from_file %s (sources=%d)", filepath.name, len(all_sources))
    text = filepath.read_text(encoding="utf-8")
    body = strip_frontmatter(text)

    if not body.strip():
        logger.warning("[ENTITY] 跳过空内容: %s", filepath.name)
        return []

    source_dir = source_dir_for_path(vp, filepath)
    existing = all_entity_files(vp)

    def _compile_terms(terms_list: list[str]) -> list[Path]:
        written: list[Path] = []
        for raw_term in terms_list:
            term = raw_term.strip()
            if not term or len(term) < 2:
                continue

            paragraphs = find_relevant_paragraphs(term, all_sources)
            if not paragraphs:
                logger.info(f"    [skip] {term}: no source paragraphs found")
                continue

            key_sents = extract_key_sentences(term, paragraphs)
            total_sents = sum(len(v) for v in key_sents.values())
            if total_sents == 0:
                logger.info(f"    [skip] {term}: no key sentences extracted")
                continue

            all_sents_flat = [s for sents in key_sents.values() for s in sents]
            def_candidates = extract_definition_candidates(term, all_sents_flat)
            related = find_related_terms(term, all_sources)
            source_names = sorted(key_sents.keys())

            existing_path = find_entity_path(term, vp)
            existing_entity_text = None
            existing_fm = None

            if existing_path:
                try:
                    old_text = existing_path.read_text(encoding="utf-8")
                    from src.scripts.llm_utils import read_frontmatter
                    existing_fm = read_frontmatter(old_text)
                    existing_entity_text = strip_frontmatter(old_text)
                    write_path = existing_path
                except Exception:
                    write_path = entities_dir(vp) / f"{_safe_filename(term)}.md"
            else:
                write_path = entities_dir(vp) / f"{_safe_filename(term)}.md"

            if dry_run:
                logger.info(f"    [dry-run] {term}: {len(source_names)} sources, {total_sents} sentences, "
                      f"{'UPDATE' if existing_path else 'NEW'}")
                written.append(write_path)
                continue

            logger.info(f"    [compile] {term} ({len(source_names)} sources, {total_sents} sentences)...")
            entity_json = compile_entity(
                term, paragraphs, key_sents, def_candidates,
                related, existing_entity_text, client, model=llm_model,
            )
            if not entity_json:
                logger.info(f"    [skip] {term}: LLM compilation failed")
                continue

            if existing_fm:
                entity_json = _merge_entity_relations(entity_json, existing_fm, term)

            verification = verify_entity(entity_json, paragraphs)
            has_def = bool(def_candidates) or bool(entity_json.get("summary"))
            score, status = quality_score(
                has_def, len(source_names), total_sents, verification["overlap"]
            )

            if status == "discard":
                logger.info(f"    [discard] {term}: score={score:.2f}, overlap={verification['overlap']:.2f}")
                continue

            if verification["missing_terms"]:
                logger.info(f"    [verify] {term}: missing terms = {verification['missing_terms'][:3]}")

            page = build_entity_page(
                term, entity_json, paragraphs, key_sents,
                related, source_names, status, existing_fm
            )

            write_path.parent.mkdir(parents=True, exist_ok=True)
            write_path.write_text(page, encoding="utf-8")
            action = "updated" if existing_path else "created"
            logger.info(f"    [{action}] {term}: score={score:.2f}, status={status} → {write_path.relative_to(vp)}")
            written.append(write_path)
        return written

    # Step 1: 识别术语
    clean_body = _clean_text_for_extraction(body)
    if dry_run:
        terms = _jieba_terms(body)
        logger.info(f"  [dry-run] terms (jieba fallback): {terms}")
    else:
        terms = identify_terms(body, existing, client, model=llm_model)

    if not terms:
        logger.info(f"  [skip] no terms identified: {filepath.name}")
        return []

    logger.info(f"  [terms] {filepath.name}: {terms}")
    results = _compile_terms(terms)

    skip = {t.strip() for t in terms if t.strip()}
    enrich = find_enrichment_terms(body, existing, skip)
    if enrich:
        logger.info(f"  [enrich] {filepath.name}: {enrich}")
        results.extend(_compile_terms(enrich))

    if not results and not dry_run:
        tried = {t.strip() for t in terms}
        jieba_extra = [t for t in _jieba_terms(body) if t.strip() not in tried]
        if jieba_extra:
            logger.info(f"  [fallback] LLM terms yielded 0 entities, retry jieba: {jieba_extra[:8]}")
            results = _compile_terms(jieba_extra)

    return results


def build_from_directory(dirpath: Path, client, vault_path: Path | None = None,
                         dry_run: bool = False, interval: float = 2.0) -> list[Path]:
    """处理目录下所有 converted .md 文件"""
    vp = vault_path or VAULT
    dirpath = Path(dirpath)
    if not dirpath.is_absolute():
        dirpath = vp / dirpath

    # 收集当前目录的 converted 文件
    source_dir = dirpath
    conv = converted_dir(source_dir)
    files = sorted(
        f for f in conv.glob("*.md")
        if not f.name.endswith(".excalidraw.md") and not f.name.startswith("~$")
    )
    if not files:
        logger.info(f"No converted .md files found in {source_dir}")
        return []

    # 收集全 vault 源文件（跨目录搜索用）
    all_sources = collect_all_sources(vp)
    logger.info(f"Found {len(files)} file(s) to process, {len(all_sources)} total source files\n")

    results = []
    for i, f in enumerate(files):
        logger.info(f"[*] {f.name}")
        created = build_from_file(f, all_sources, client, vp, dry_run)
        results.extend(created)
        if not dry_run and i < len(files) - 1:
            time.sleep(interval)

    return results


# ── Main ─────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Entity Builder — jieba 地基 + LLM 编译")
    parser.add_argument("path", help="文件或目录路径")
    parser.add_argument("--dry-run", action="store_true", help="只显示不执行")
    parser.add_argument("--interval", type=float, default=2.0, help="API 调用间隔秒数")
    args = parser.parse_args()

    path = Path(args.path)
    if not path.is_absolute():
        path = VAULT / path
    if not path.exists():
        logger.info(f"Error: {path} not found")
        sys.exit(1)

    existing = all_entity_files(VAULT)
    logger.info(f"已有 {len(existing)} 个实体页\n")

    client = None if args.dry_run else get_client()

    if path.is_dir():
        results = build_from_directory(path, client, vault_path=VAULT, dry_run=args.dry_run, interval=args.interval)
    else:
        all_sources = collect_all_sources(VAULT)
        results = build_from_file(path, all_sources, client, vault_path=VAULT, dry_run=args.dry_run)

    logger.info(f"\nDone. {len(results)} entity page(s) created/updated.")


if __name__ == "__main__":
    main()
