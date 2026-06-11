"""LearnNote 生成 — 四区块 Markdown 学习状态机"""

from __future__ import annotations

import json
import re
from datetime import datetime
from typing import Any

from src.agent.learn_mind import has_learning_signal

SECTION_IDS = (
    "knowledge_tree",
    "qa_summaries",
    "types_and_conclusions",
    "learning_progress",
)

LEARN_NOTE_PROMPT = """你是学习过程记录员。维护四区块学习笔记（对话驱动，不是教材目录）。

## 四区块职责
1. knowledge_tree: 目录树文本，用 ├─ └─ │ 缩进；节点前加 ✓(已学) →(当前) □(未学) ○(漂移分支)
2. qa_summaries: 不要输出整块，只输出本轮 qa_entry（极简）
3. types_and_conclusions: ## 题型 + ## 结论；题型用 T001 编号+步骤
4. learning_progress: ## 当前主题 / ## 待解决 / ## 下一步

## 规则
- 概念只能来自本轮对话，禁止凭常识扩目录
- 增量合并旧笔记，禁止整树重写
- 同一主题在树中只出现一次：用户跟进漂移分支时，把 ○ 节点改为 →，禁止再追加同名节点
- 漂移时 drift_branch 填新主题名；若树中尚无该节点才在 knowledge_tree 追加 └─○
- qa_entry.question：≤30 字，只写核心问点，禁止复述用户原话
- qa_entry.principle：≤60 字，一句结论，禁止抄助手长段
- qa_entry.misconception：仅在有错误/困惑/被纠正时出现；写清「错在哪→应对」，≤50 字；否则 null
- 每轮最多新增 1 个题型

只输出 JSON：
{
  "rootTopic": "主题",
  "knowledge_tree": "树文本",
  "qa_entry": {"question": "...", "principle": "...", "misconception": null},
  "types_and_conclusions": "markdown",
  "learning_progress": "markdown",
  "drift_branch": null
}"""

_LOW_SIGNAL = re.compile(
    r"^[\s\u3000]*(好的?|好|嗯+|谢谢|ok|继续)[\s\u3000。!！?？]*$",
    re.IGNORECASE,
)

_GAP_SIGNAL = re.compile(r"不懂|不明白|没懂|困惑|糊涂|看不懂|不理解|搞不清", re.IGNORECASE)
_WRONG_ASSUME = re.compile(r"是不是|对吗|难道|岂不是|所以.*就是|应该.*吧|是不是说|我理解成")
_CORRECTION = re.compile(r"其实|并不是|不对|误区|容易错|注意|澄清|更准确|应该说|关键在于|别混淆")

_MAX_Q_LEN = 48
_MAX_P_LEN = 96
_MAX_M_LEN = 80


def _norm_label(label: str) -> str:
    return re.sub(r"\s+", "", (label or "").lower())


def _tree_line_parts(line: str) -> tuple[str | None, str]:
    s = line.strip()
    m = re.search(r"(✓|→|□|○)\s+(.+?)\s*$", s)
    if m:
        return m.group(1), m.group(2).strip()
    plain = re.sub(r"^[├└│\s─]+", "", s).strip()
    return None, plain


def _similar_label(a: str, b: str) -> bool:
    na, nb = _norm_label(a), _norm_label(b)
    if not na or not nb:
        return False
    return na == nb or na in nb or nb in na


def _label_in_tree(content: str, name: str) -> bool:
    for line in (content or "").split("\n"):
        _, label = _tree_line_parts(line)
        if label and _similar_label(label, name):
            return True
    return False


def _dedupe_knowledge_tree(content: str) -> str:
    """同标签只保留一行，状态优先级 ✓ > → > ○ > □。"""
    prio = {"✓": 4, "→": 3, "○": 2, "□": 1}
    lines = (content or "").split("\n")
    best: dict[str, tuple[int, int, str]] = {}
    for i, line in enumerate(lines):
        if not line.strip():
            continue
        st, label = _tree_line_parts(line)
        if not label:
            continue
        norm = _norm_label(label)
        p = prio.get(st or "□", 1)
        if norm not in best or p > best[norm][0]:
            best[norm] = (p, i, line)
    if not best:
        return content
    keep = {v[1] for v in best.values()}
    return "\n".join(lines[i] for i in sorted(keep))


def _promote_branch_to_current(content: str, topic: str) -> str:
    """用户跟进漂移主题时：○ 同名节点升为 →，去掉重复。"""
    out: list[str] = []
    for line in (content or "").split("\n"):
        st, label = _tree_line_parts(line)
        if label and _similar_label(label, topic):
            m = re.match(r"^([├└│\s]*)", line)
            indent = m.group(1) if m else ""
            out.append(f"{indent}→ {label}")
        else:
            out.append(line)
    return _dedupe_knowledge_tree("\n".join(out))


def _compress_text(text: str, max_len: int) -> str:
    s = re.sub(r"\s+", " ", (text or "").strip())
    if len(s) <= max_len:
        return s
    cut = s[:max_len]
    for sep in "。；;!?？":
        idx = cut.rfind(sep)
        if idx >= max_len // 3:
            return cut[: idx + 1]
    return cut.rstrip("，,、") + "…"


def _summarize_question(user_msg: str) -> str:
    msg = (user_msg or "").strip()
    msg = re.sub(
        r"^(请问|我想问|帮我|能不能|这里详细讲解|详细讲讲|麻烦|说一下)",
        "",
        msg,
    ).strip()
    return _compress_text(msg, _MAX_Q_LEN)


def _summarize_principle(assistant_msg: str) -> str:
    for line in (assistant_msg or "").split("\n"):
        line = line.strip()
        if not line or line.startswith("|") or line.startswith("#"):
            continue
        if line.startswith("来源") or line.startswith("__SUGGESTIONS__"):
            continue
        line = re.sub(r"^[-*•]\s*", "", line)
        line = re.sub(r"\*\*([^*]+)\*\*", r"\1", line)
        if len(line) >= 8:
            return _compress_text(line, _MAX_P_LEN)
    first = (assistant_msg or "").split("\n")[0].strip()
    return _compress_text(first, _MAX_P_LEN)


def _infer_misconception(user_msg: str, assistant_msg: str) -> str | None:
    user = (user_msg or "").strip()
    assistant = assistant_msg or ""

    if _GAP_SIGNAL.search(user):
        return _compress_text(f"曾困惑：{_summarize_question(user)}", _MAX_M_LEN)

    if _WRONG_ASSUME.search(user):
        for line in assistant.split("\n"):
            if _CORRECTION.search(line):
                cleaned = re.sub(r"^[-*•]\s*", "", line.strip())
                return _compress_text(f"易误解→{cleaned}", _MAX_M_LEN)

    for pat in (
        r"误区[：:]\s*(.+)",
        r"容易错[：:]\s*(.+)",
        r"注意[：:]\s*(.+)",
        r"并不是(.+)",
    ):
        m = re.search(pat, assistant)
        if m:
            return _compress_text(m.group(1).strip(), _MAX_M_LEN)

    return None


def _normalize_qa_entry(entry: dict, user_msg: str, assistant_msg: str) -> dict:
    out = dict(entry or {})
    q = (out.get("question") or "").strip()
    p = (out.get("principle") or "").strip()
    m = out.get("misconception")

    out["question"] = _compress_text(q or _summarize_question(user_msg), _MAX_Q_LEN)
    out["principle"] = _compress_text(p or _summarize_principle(assistant_msg), _MAX_P_LEN)

    if m and str(m).strip():
        out["misconception"] = _compress_text(str(m).strip(), _MAX_M_LEN)
    else:
        inferred = _infer_misconception(user_msg, assistant_msg)
        out["misconception"] = inferred

    if not out["misconception"]:
        out["misconception"] = None
    return out


def empty_learn_note(root_topic: str = "未命名学习") -> dict:
    topic = root_topic or "未命名学习"
    return {
        "rootTopic": topic,
        "sections": [
            {"id": "knowledge_tree", "content": f"□ {topic}", "locked": False},
            {
                "id": "qa_summaries",
                "content": "（对话后将在此记录每轮问答摘要）",
                "locked": False,
            },
            {
                "id": "types_and_conclusions",
                "content": "## 题型\n\n（待沉淀）\n\n## 结论\n\n（待确认）",
                "locked": False,
            },
            {
                "id": "learning_progress",
                "content": f"## 当前主题\n{topic}\n\n## 待解决\n\n## 下一步\n→ 开始第一个问题",
                "locked": False,
            },
        ],
        "qaRound": 0,
        "version": 0,
        "updatedAt": datetime.now().isoformat(),
        "schema": "learn_note_v1",
    }


def _migrate_from_learn_mind(old: dict) -> dict:
    from src.agent.learn_mind import empty_learn_mind

    mind = old or empty_learn_mind()
    note = empty_learn_note(mind.get("topic") or "未命名学习")
    tree_lines = [f"□ {mind.get('topic', '未命名学习')}"]
    for c in mind.get("concepts") or []:
        st = {"understood": "✓", "exploring": "→", "new": "□", "gap": "□"}.get(
            c.get("status"), "□"
        )
        tree_lines.append(f"├─{st} {c.get('label', '')}")
    note["sections"][0]["content"] = "\n".join(tree_lines)
    kts = mind.get("keyTakeaways") or []
    if kts:
        note["sections"][2]["content"] = (
            "## 题型\n\n（待沉淀）\n\n## 结论\n"
            + "\n".join(f"- {t}" for t in kts)
        )
    oq = mind.get("openQuestions") or []
    note["sections"][3]["content"] = (
        f"## 当前主题\n{mind.get('topic', '')}\n\n## 待解决\n"
        + "\n".join(f"- {q}" for q in oq)
        + "\n\n## 下一步\n→ 继续学习"
    )
    return note


def normalize_learn_note(raw: dict | None) -> dict:
    if not raw:
        return empty_learn_note()
    if raw.get("schema") == "learn_note_v1" and raw.get("sections"):
        return raw
    if "concepts" in raw or ("topic" in raw and "sections" not in raw):
        return _migrate_from_learn_mind(raw)
    return empty_learn_note()


def _section_map(note: dict) -> dict[str, dict]:
    return {s["id"]: s for s in note.get("sections") or [] if isinstance(s, dict)}


def _format_qa_entry(round_n: int, entry: dict) -> str:
    lines = [f"### R{round_n:03d}"]
    q = (entry.get("question") or "").strip()
    p = (entry.get("principle") or "").strip()
    m = entry.get("misconception")
    if q:
        lines.append(f"**问题**：{q}")
    if p:
        lines.append(f"**原理**：{p}")
    if m and str(m).strip():
        lines.append(f"**误区**：{str(m).strip()}")
    return "\n".join(lines)


def _prepend_qa(existing: str, entry_block: str) -> str:
    placeholder = "（对话后将在此记录每轮问答摘要）"
    body = (existing or "").strip()
    if not body or body == placeholder:
        return entry_block
    return f"{entry_block}\n\n{body}"


def _detect_drift_heuristic(user_msg: str, root_topic: str) -> str | None:
    """轻量漂移检测：用户消息含明显不同主题词"""
    if not root_topic or len(root_topic) < 2:
        return None
    msg = user_msg.strip()
    if len(msg) < 6:
        return None
    if root_topic in msg:
        return None
    # 问句中出现与根主题无关的新名词（启发式）
    m = re.search(r"(什么是|介绍|讲讲|解释)(.{2,20})", msg)
    if m:
        candidate = m.group(2).strip("？?。.")
        if candidate and candidate != root_topic and len(candidate) >= 2:
            if not any(c in candidate for c in root_topic):
                return candidate[:30]
    return None


def stabilize_note_merge(old: dict, parsed: dict, qa_round: int) -> tuple[dict, str | None]:
    note = dict(old)
    smap = _section_map(note)
    drift_msg = None

    if parsed.get("rootTopic"):
        note["rootTopic"] = str(parsed["rootTopic"])[:80]

    drift_branch = parsed.get("drift_branch")
    if drift_branch and str(drift_branch).strip():
        drift_msg = f"已自动分支：{str(drift_branch).strip()[:40]}"

    for sid in SECTION_IDS:
        sec = smap.get(sid)
        if not sec or sec.get("locked"):
            continue
        if sid == "qa_summaries":
            entry = parsed.get("qa_entry")
            if isinstance(entry, dict) and entry.get("question"):
                entry = _normalize_qa_entry(
                    entry,
                    parsed.get("_user_msg", ""),
                    parsed.get("_assistant_msg", ""),
                )
                block = _format_qa_entry(qa_round, entry)
                sec["content"] = _prepend_qa(sec.get("content", ""), block)
            continue
        key = sid
        if key in parsed and parsed[key]:
            sec["content"] = str(parsed[key]).strip()[:8000]

    tree_sec = smap.get("knowledge_tree")
    if tree_sec and not tree_sec.get("locked"):
        content = tree_sec.get("content", "")
        if drift_branch and str(drift_branch).strip():
            branch = str(drift_branch).strip()[:40]
            if _label_in_tree(content, branch):
                content = _promote_branch_to_current(content, branch)
            else:
                branch_line = f"└─○ {branch}"
                if branch_line not in content:
                    content = (content.rstrip() + "\n" + branch_line).strip()
        tree_sec["content"] = _dedupe_knowledge_tree(content)

    note["sections"] = [smap[sid] for sid in SECTION_IDS if sid in smap]
    note["qaRound"] = qa_round
    note["version"] = int(note.get("version") or 0) + 1
    note["updatedAt"] = datetime.now().isoformat()
    note["schema"] = "learn_note_v1"
    return note, drift_msg


def merge_note_heuristic(
    old: dict,
    user_msg: str,
    assistant_msg: str,
    qa_round: int,
) -> tuple[dict, str | None]:
    note = dict(old)
    smap = _section_map(note)
    drift = _detect_drift_heuristic(user_msg, note.get("rootTopic", ""))

    qa_sec = smap.get("qa_summaries")
    if qa_sec and not qa_sec.get("locked"):
        entry = _normalize_qa_entry({}, user_msg, assistant_msg)
        block = _format_qa_entry(qa_round, entry)
        qa_sec["content"] = _prepend_qa(qa_sec.get("content", ""), block)

    tree_sec = smap.get("knowledge_tree")
    if tree_sec and not tree_sec.get("locked"):
        content = tree_sec.get("content", "")
        if drift:
            if _label_in_tree(content, drift):
                content = _promote_branch_to_current(content, drift)
            else:
                branch_line = f"└─○ {drift}"
                if branch_line not in content:
                    content = (content.rstrip() + "\n" + branch_line).strip()
        tree_sec["content"] = _dedupe_knowledge_tree(content)

    note["sections"] = [smap[sid] for sid in SECTION_IDS if sid in smap]
    note["qaRound"] = qa_round
    note["version"] = int(note.get("version") or 0) + 1
    note["updatedAt"] = datetime.now().isoformat()
    drift_msg = f"已自动分支：{drift}" if drift else None
    return note, drift_msg


def generate_learn_note(
    llm,
    old_note: dict | None,
    user_msg: str,
    assistant_msg: str,
    evidence: list[dict] | None = None,
) -> tuple[dict, bool, str | None]:
    """返回 (note, updated, drift_message)"""
    clean_assistant = re.sub(
        r"__SUGGESTIONS__\s*:\s*\[.*\]", "", assistant_msg, flags=re.DOTALL,
    ).strip()
    base = normalize_learn_note(old_note)

    if not has_learning_signal(user_msg, clean_assistant):
        return base, False, None

    qa_round = int(base.get("qaRound") or 0) + 1
    locked = {s["id"] for s in base.get("sections", []) if s.get("locked")}

    if not llm:
        note, drift = merge_note_heuristic(base, user_msg, clean_assistant, qa_round)
        return note, True, drift

    sections_text = {}
    for s in base.get("sections") or []:
        if s.get("id") and not s.get("locked"):
            sections_text[s["id"]] = s.get("content", "")

    ev_lines = []
    for item in (evidence or [])[:3]:
        ev_lines.append(item.get("path") or item.get("title") or "?")
    ev_block = ", ".join(ev_lines) or "无"

    user_content = (
        f"{LEARN_NOTE_PROMPT}\n\n"
        f"旧笔记（未锁定区块）:\n{json.dumps(sections_text, ensure_ascii=False)}\n\n"
        f"根主题: {base.get('rootTopic')}\n"
        f"本轮序号: R{qa_round:03d}\n\n"
        f"本轮用户: {user_msg}\n\n"
        f"本轮助手: {clean_assistant[:3000]}\n\n"
        f"引用源: {ev_block}"
    )
    try:
        resp = llm.complete(
            messages=[
                {"role": "system", "content": "你只输出 JSON。"},
                {"role": "user", "content": user_content},
            ],
            temperature=0.3,
            max_tokens=3000,
        )
        text = (resp or "").strip()
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            parsed["_user_msg"] = user_msg
            parsed["_assistant_msg"] = clean_assistant
            note, drift = stabilize_note_merge(base, parsed, qa_round)
            return note, True, drift
    except Exception:
        pass

    note, drift = merge_note_heuristic(base, user_msg, clean_assistant, qa_round)
    return note, True, drift
