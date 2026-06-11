"""LearnMind 生成 — 记录学习对话过程，增量更新理解程度"""

from __future__ import annotations

import json
import re
import uuid
from datetime import datetime
from typing import Any

from src.agent.context_types import empty_learn_mind

MAX_NEW_CONCEPTS_PER_ROUND = 3
MAX_CONCEPTS = 40

LEARN_MIND_PROMPT = """你是学习过程记录员。思维图反映「这场对话中学到了什么、理解到什么程度」，不是知识库目录或教材大纲。

## 核心规则
1. 概念只能来自对话中实际出现或讨论的术语、问题、论点；禁止凭学科常识添加未在对话出现的章节/分类
2. 增量合并旧思维图：必须保留已有概念的 id；每轮最多新增 3 个概念
3. status 根据对话信号判断（不是默认 new）：
   - new: 本轮刚引入、尚未展开
   - exploring: 正在讨论、用户还在追问
   - understood: 用户明确表示懂了，或能正确复述要点
   - gap: 用户表示不懂/困惑，或助手指出需补强的点
4. note 写用户在本轮形成的理解（一句话），禁止套话（如「核心研究范畴之一」「重要概念」）
5. topic 反映当前学习主线（用户关注点），不要写成宽泛学科名
6. openQuestions: 用户未解决的困惑；keyTakeaways: 对话中确认的理解
7. parentId 表示层级（先修/从属）；links.relation 仅用：对比、因果、前提、相关（不要重复 parent-child）
8. sourcePaths 仅标注本轮检索引用路径（可选），不是概念来源

只输出合法 JSON，不要 markdown 代码块。格式：
{
  "topic": "主题",
  "concepts": [{"id":"c1","label":"概念","note":"一句话","parentId":null,"status":"exploring","sourcePaths":[]}],
  "links": [{"from":"c1","to":"c2","relation":"对比"}],
  "openQuestions": ["问题1"],
  "keyTakeaways": ["收获1"]
}"""

# 无实质学习的短回复
_LOW_SIGNAL_USER = re.compile(
    r"^[\s\u3000]*("
    r"好的?|好|嗯+|哦+|行|可以|继续|谢谢|感谢|ok|okay|yes|no|"
    r"明白了?|懂了|知道了|收到|然后呢|还有吗"
    r")[\s\u3000。!！?？~～…]*$",
    re.IGNORECASE,
)

# 理解/困惑信号
_UNDERSTOOD_SIGNAL = re.compile(
    r"懂了|明白了|理解了|清楚了|会了|get\s*it|明白了",
    re.IGNORECASE,
)
_GAP_SIGNAL = re.compile(
    r"不懂|不明白|没懂|困惑|糊涂|看不懂|不理解|还是不懂|不太懂",
    re.IGNORECASE,
)
_QUESTION_SIGNAL = re.compile(r"[?？]|什么|为什么|怎么|如何|能否|是不是|吗")


def _new_id() -> str:
    return f"c_{uuid.uuid4().hex[:8]}"


def _norm_label(label: str) -> str:
    return re.sub(r"\s+", "", (label or "").strip().lower())


def has_learning_signal(user_msg: str, assistant_msg: str) -> bool:
    """本轮是否有值得写入思维图的学习信号"""
    user = (user_msg or "").strip()
    assistant = (assistant_msg or "").strip()

    if not user and not assistant:
        return False

    if user and _LOW_SIGNAL_USER.match(user) and len(assistant) < 80:
        return False

    if _GAP_SIGNAL.search(user) or _UNDERSTOOD_SIGNAL.search(user):
        return True
    if _QUESTION_SIGNAL.search(user):
        return True
    if len(user) >= 8:
        return True
    if len(assistant) >= 60:
        return True
    return False


def _format_evidence_block(evidence: list[dict] | None) -> str:
    if not evidence:
        return "无"
    lines = []
    for item in evidence[:4]:
        path = item.get("path") or item.get("title") or "?"
        excerpt = (item.get("excerpt") or "").strip()
        if excerpt:
            excerpt = excerpt[:400] + ("…" if len(excerpt) > 400 else "")
            lines.append(f"- {path}: {excerpt}")
        else:
            lines.append(f"- {path}")
    return "\n".join(lines) if lines else "无"


def _infer_status_from_user(user_msg: str) -> str | None:
    if _UNDERSTOOD_SIGNAL.search(user_msg):
        return "understood"
    if _GAP_SIGNAL.search(user_msg):
        return "gap"
    return None


def _find_concept_by_label(concepts: list[dict], label: str) -> dict | None:
    norm = _norm_label(label)
    if not norm:
        return None
    for c in concepts:
        if _norm_label(c.get("label", "")) == norm:
            return c
    return None


def stabilize_mind_merge(old: dict | None, parsed: dict) -> dict:
    """将 LLM 输出与旧图增量合并：不删旧概念、限新增、保留 id"""
    base = dict(old or empty_learn_mind())
    concepts: list[dict] = [dict(c) for c in (base.get("concepts") or [])]
    by_id = {c.get("id"): c for c in concepts if c.get("id")}

    new_added = 0
    for raw in parsed.get("concepts") or []:
        if not isinstance(raw, dict):
            continue
        label = (raw.get("label") or "").strip()
        if not label or len(label) > 80:
            continue

        cid = raw.get("id")
        target = by_id.get(cid) if cid else None
        if not target:
            target = _find_concept_by_label(concepts, label)

        if target:
            if raw.get("note"):
                target["note"] = str(raw["note"])[:200]
            if raw.get("status") in ("new", "exploring", "understood", "gap"):
                target["status"] = raw["status"]
            if "parentId" in raw:
                target["parentId"] = raw["parentId"]
            if raw.get("sourcePaths"):
                old_paths = set(target.get("sourcePaths") or [])
                target["sourcePaths"] = list(old_paths | set(raw["sourcePaths"]))[:5]
        else:
            if new_added >= MAX_NEW_CONCEPTS_PER_ROUND:
                continue
            if len(concepts) >= MAX_CONCEPTS:
                continue
            nid = cid if cid and cid not in by_id else _new_id()
            concepts.append({
                "id": nid,
                "label": label,
                "note": str(raw.get("note") or "")[:200],
                "parentId": raw.get("parentId"),
                "status": raw.get("status") if raw.get("status") in ("new", "exploring", "understood", "gap") else "new",
                "sourcePaths": list(raw.get("sourcePaths") or [])[:5],
            })
            by_id[nid] = concepts[-1]
            new_added += 1

    # 合并 links，去掉与 parentId 重复的父子 link
    parent_pairs = {
        (c.get("parentId"), c.get("id"))
        for c in concepts
        if c.get("parentId")
    }
    links = list(base.get("links") or [])
    seen_links = {(l.get("from"), l.get("to"), l.get("relation")) for l in links if isinstance(l, dict)}
    for raw in parsed.get("links") or []:
        if not isinstance(raw, dict):
            continue
        fr, to = raw.get("from"), raw.get("to")
        if not fr or not to or (fr, to) in parent_pairs:
            continue
        key = (fr, to, raw.get("relation"))
        if key not in seen_links:
            links.append({"from": fr, "to": to, "relation": raw.get("relation") or "关联"})
            seen_links.add(key)
    links = links[:30]

    topic = (parsed.get("topic") or "").strip() or base.get("topic") or "未命名学习"

    def _merge_str_list(old_list: list, new_list: list, cap: int) -> list:
        out = list(old_list or [])
        for item in new_list or []:
            s = str(item).strip()
            if s and s not in out:
                out.append(s)
        return out[:cap]

    return {
        "topic": topic,
        "concepts": concepts,
        "links": links,
        "openQuestions": _merge_str_list(base.get("openQuestions"), parsed.get("openQuestions"), 10),
        "keyTakeaways": _merge_str_list(base.get("keyTakeaways"), parsed.get("keyTakeaways"), 8),
        "version": int(base.get("version") or 0) + 1,
        "updatedAt": datetime.now().isoformat(),
    }


def merge_mind_heuristic(
    old: dict | None,
    user_msg: str,
    assistant_msg: str,
    evidence: list[dict] | None = None,
) -> dict:
    """无 LLM 时的启发式合并"""
    mind = dict(old or empty_learn_mind())
    concepts = list(mind.get("concepts") or [])
    ev_paths = [e.get("path", "") for e in (evidence or []) if e.get("path")][:3]

    label = user_msg.strip()
    if len(label) > 40:
        # 取问句核心片段
        m = re.search(r"[「『\"](.+?)[」』\"]", label)
        label = m.group(1) if m else label[:40]

    if label and not _LOW_SIGNAL_USER.match(user_msg.strip()):
        existing = _find_concept_by_label(concepts, label)
        status = _infer_status_from_user(user_msg) or "exploring"
        note_src = assistant_msg.split("\n")[0].strip()
        note = (note_src[:120] + "…") if len(note_src) > 120 else note_src

        if existing:
            if note and not existing.get("note"):
                existing["note"] = note
            if status == "understood" or status == "gap":
                existing["status"] = status
            elif existing.get("status") == "new":
                existing["status"] = "exploring"
        elif len(concepts) < MAX_CONCEPTS:
            concepts.append({
                "id": _new_id(),
                "label": label,
                "note": note,
                "parentId": None,
                "status": status,
                "sourcePaths": ev_paths,
            })
        mind["concepts"] = concepts

    match = re.search(r"__SUGGESTIONS__\s*:\s*(\[.*\])", assistant_msg, re.DOTALL)
    if match:
        try:
            qs = json.loads(match.group(1))
            if isinstance(qs, list):
                oq = list(mind.get("openQuestions") or [])
                for q_item in qs:
                    if q_item and str(q_item) not in oq:
                        oq.append(str(q_item))
                mind["openQuestions"] = oq[:10]
        except json.JSONDecodeError:
            pass

    if _UNDERSTOOD_SIGNAL.search(user_msg):
        first_line = assistant_msg.split("\n")[0].strip()[:100]
        if first_line and not first_line.startswith("__SUGGESTIONS__"):
            kt = list(mind.get("keyTakeaways") or [])
            if first_line not in kt:
                kt.insert(0, first_line)
            mind["keyTakeaways"] = kt[:8]

    mind["updatedAt"] = datetime.now().isoformat()
    mind["version"] = int(mind.get("version") or 0) + 1
    return mind


def generate_learn_mind(
    llm,
    old_mind: dict | None,
    user_msg: str,
    assistant_msg: str,
    evidence: list[dict] | None = None,
) -> tuple[dict, bool]:
    """更新思维图。返回 (mind, updated)；无学习信号时返回旧图且 updated=False。"""
    clean_assistant = re.sub(
        r"__SUGGESTIONS__\s*:\s*\[.*\]", "", assistant_msg, flags=re.DOTALL,
    ).strip()
    base = dict(old_mind or empty_learn_mind())

    if not has_learning_signal(user_msg, clean_assistant):
        return base, False

    if not llm:
        return merge_mind_heuristic(base, user_msg, clean_assistant, evidence), True

    old_json = json.dumps(base, ensure_ascii=False)
    ev_block = _format_evidence_block(evidence)
    user_content = (
        f"{LEARN_MIND_PROMPT}\n\n"
        f"旧思维图:\n{old_json}\n\n"
        f"本轮用户: {user_msg}\n\n"
        f"本轮助手: {clean_assistant[:3000]}\n\n"
        f"本轮检索引用（仅供 sourcePaths 标注，不是概念来源）:\n{ev_block}"
    )
    try:
        resp = llm.complete(
            messages=[
                {"role": "system", "content": "你只输出 JSON。"},
                {"role": "user", "content": user_content},
            ],
            temperature=0.3,
            max_tokens=2048,
        )
        text = (resp or "").strip()
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
        parsed = json.loads(text)
        if isinstance(parsed, dict) and "topic" in parsed:
            if "concepts" not in parsed:
                parsed["concepts"] = []
            if "links" not in parsed:
                parsed["links"] = []
            return stabilize_mind_merge(base, parsed), True
    except Exception:
        pass

    return merge_mind_heuristic(base, user_msg, clean_assistant, evidence), True
