"""上下文组装与 token 估算 — 参考 CC 渐进式压缩"""

from __future__ import annotations

import json
import re
from typing import Any

from src.agent.context_types import EvidenceItem, SessionContext, empty_learn_mind

BYTES_PER_TOKEN = 2  # 中文为主
SAFETY_FACTOR = 4 / 3
WARN_THRESHOLD = 80_000
AUTO_COMPACT_THRESHOLD = 120_000


def rough_token_count(text: str) -> int:
    if not text:
        return 0
    return max(1, int(len(text) / BYTES_PER_TOKEN * SAFETY_FACTOR))


def estimate_messages_tokens(messages: list[dict]) -> int:
    total = 0
    for m in messages:
        content = m.get("content") or ""
        if isinstance(content, str):
            total += rough_token_count(content)
        elif isinstance(content, list):
            for block in content:
                if isinstance(block, dict) and block.get("text"):
                    total += rough_token_count(block["text"])
        if m.get("tool_calls"):
            total += rough_token_count(json.dumps(m["tool_calls"], ensure_ascii=False))
    return total


def token_pressure(token_count: int) -> str | None:
    if token_count >= AUTO_COMPACT_THRESHOLD:
        return "critical"
    if token_count >= WARN_THRESHOLD:
        return "warn"
    return None


def extract_excerpt(content: str, max_chars: int = 500) -> str:
    if not content:
        return ""
    text = content.strip()
    if len(text) <= max_chars:
        return text
    # 取首段 + 末句
    parts = re.split(r"\n\s*\n", text, maxsplit=2)
    head = parts[0][: max_chars // 2]
    tail = text[-(max_chars // 2):] if len(text) > max_chars // 2 else ""
    return f"{head}\n…\n{tail}".strip()


def format_evidence_block(pack: list[EvidenceItem]) -> str:
    if not pack:
        return ""
    lines = ["## 已检索证据（回答必须优先引用）"]
    for i, e in enumerate(pack[:12], 1):
        lines.append(f"### 证据 {i}: {e.title} (`{e.path}`)")
        lines.append(e.excerpt or "(无摘录)")
    return "\n".join(lines)


def format_learn_note_block(note: dict | None) -> str:
    if not note:
        return ""
    if note.get("schema") == "learn_note_v1" and note.get("sections"):
        topic = note.get("rootTopic") or "未命名学习"
        titles = {
            "knowledge_tree": "知识树",
            "qa_summaries": "问答纪要",
            "types_and_conclusions": "题型与结论",
            "learning_progress": "学习进度",
        }
        lines = [f"## 学习笔记（外脑/working memory）", f"主题: {topic}"]
        for sec in note.get("sections") or []:
            sid = sec.get("id", "")
            content = (sec.get("content") or "").strip()
            if not content:
                continue
            title = titles.get(sid, sid)
            trimmed = content[:2000] + ("…" if len(content) > 2000 else "")
            lines.append(f"\n### {title}\n{trimmed}")
        return "\n".join(lines)
    return format_learn_mind_block_legacy(note)


def format_learn_mind_block_legacy(mind: dict | None) -> str:
    if not mind:
        return ""
    topic = mind.get("topic") or mind.get("rootTopic") or "未命名学习"
    takeaways = mind.get("keyTakeaways") or []
    questions = mind.get("openQuestions") or []
    concepts = mind.get("concepts") or []
    lines = [f"## 学习思维图（外脑/working memory）", f"主题: {topic}"]
    if takeaways:
        lines.append("核心收获:")
        for t in takeaways[:8]:
            lines.append(f"- {t}")
    if questions:
        lines.append("开放问题:")
        for q in questions[:6]:
            lines.append(f"- {q}")
    if concepts:
        lines.append("概念:")
        for c in concepts[:15]:
            label = c.get("label", "")
            note = c.get("note", "")
            status = c.get("status", "")
            lines.append(f"- [{status}] {label}: {note}")
    return "\n".join(lines)


def format_learn_mind_block(mind: dict | None) -> str:
    return format_learn_note_block(mind)


def trim_history(messages: list[dict], keep: int, mode: str) -> list[dict]:
    n = 8 if mode == "learn" else 10
    if len(messages) <= n:
        return messages
    return messages[-n:]


def microcompact_tool_content(content: str, tool_name: str) -> str:
    """将旧工具结果压缩为一行摘要"""
    if not content or len(content) < 400:
        return content
    try:
        data = json.loads(content)
        if tool_name == "wiki_search" and isinstance(data, dict):
            results = data.get("results") or []
            paths = ", ".join(r.get("path", "") for r in results[:5])
            return json.dumps({"summary": f"wiki_search 返回 {len(results)} 条", "paths": paths}, ensure_ascii=False)
        if tool_name == "wiki_read_page" and isinstance(data, dict):
            path = data.get("path", "")
            title = data.get("title", "")
            return json.dumps({"summary": f"已读 {title}", "path": path}, ensure_ascii=False)
    except (json.JSONDecodeError, TypeError):
        pass
    return content[:200] + "…[已压缩]"


def assemble_system_prompt(
    base: str,
    mode: str,
    ctx: SessionContext,
    selected_files: list[str] | None = None,
    extra: str = "",
) -> str:
    parts = [base]
    if extra:
        parts.append(extra)
    if selected_files and mode == "learn":
        file_list = "\n".join(f"- {f}" for f in sorted(selected_files))
        parts.append(f"\n\n## 学习范围\n{file_list}")
    mind_block = format_learn_mind_block(ctx.learn_mind)
    if mind_block:
        parts.append(f"\n\n{mind_block}")
    ev_block = format_evidence_block(ctx.evidence_pack)
    if ev_block:
        parts.append(f"\n\n{ev_block}")
    if mode == "learn":
        parts.append(
            "\n\n## 作答约束\n"
            "- 涉及知识库内容必须先引用上方证据或标注 `> 来源：[[页面名]]`\n"
            "- 材料未提及的内容标注 `[补充]`\n"
            "- 禁止编造源文档中不存在的定理/数据"
        )
    return "\n".join(parts)


def merge_evidence_pack(existing: list[EvidenceItem], new_items: list[EvidenceItem]) -> list[EvidenceItem]:
    by_path: dict[str, EvidenceItem] = {e.path: e for e in existing}
    for item in new_items:
        if item.path and (item.path not in by_path or len(item.excerpt) > len(by_path[item.path].excerpt)):
            by_path[item.path] = item
    return list(by_path.values())[:20]
