"""掌握测验 — LLM 出题 / 判分（卡片互动，非对话被动出题）"""

from __future__ import annotations

import json
import re
import uuid
from typing import Any

from src.agent.learn_note import mark_node_learned, normalize_learn_note

QUIZ_GENERATE_PROMPT = """你是学习测验出题官。根据学习笔记为指定知识点出 2-5 道题（简单知识点 2 道，复杂 4-5 道）。

要求：
- 题目紧扣 target_label，难度递进（先概念后应用）
- 每题为开放式简答题，≤80 字
- 只能依据提供的笔记内容，禁止编造未学材料

只输出 JSON：
{"count": 3, "questions": [{"id": "q1", "prompt": "问题文本"}]}"""

EVALUATE_PROMPT = """你是学习测验阅卷官。按语义判断学生是否答对。

规则：
1. 核心概念正确即判对，不要求与参考答案逐字相同，也不要求必须附带例子或括号说明
2. 判断题/是否题：「是/否/对/错」等简短回答，语义正确必须判 correct=true
3. 学生明确表示不会（如「不知道」「不会」）时，correct 必须为 false
4. 答错或不会时，explanation 必须以「参考答案：」开头，给出完整正确答案（2-4 句），帮助学生学会
5. 答对时 explanation 一句简短肯定即可

只输出 JSON：
{"correct": true, "explanation": "..."}"""

_GIVE_UP_RE = re.compile(
    r"^(不会|不知道|不懂|不清楚|没学过|忘了|不会做|不会答|不了解|没思路|不会写|不太懂|没记住)[。.!！?？…~\s]*$",
    re.IGNORECASE,
)

_SHORT_VALID = frozenset({
    "是", "否", "对", "错", "能", "不能", "有", "无", "会", "不会",
    "yes", "no", "true", "false", "y", "n",
})


def _strip_json(text: str) -> str:
    t = (text or "").strip()
    t = re.sub(r"^```(?:json)?\s*", "", t)
    t = re.sub(r"\s*```$", "", t)
    return t


def _section_text(learn_note: dict, sid: str) -> str:
    for s in learn_note.get("sections") or []:
        if isinstance(s, dict) and s.get("id") == sid:
            return str(s.get("content") or "")
    return ""


def _note_context_block(learn_note: dict, target_label: str, chat_snippet: str = "") -> str:
    parts = [
        f"测验目标: {target_label}",
        f"根主题: {learn_note.get('rootTopic', '')}",
        f"知识树:\n{_section_text(learn_note, 'knowledge_tree')[:2000]}",
        f"问答纪要:\n{_section_text(learn_note, 'qa_summaries')[:1500]}",
        f"题型与结论:\n{_section_text(learn_note, 'types_and_conclusions')[:1000]}",
    ]
    if chat_snippet.strip():
        parts.append(f"近期对话摘要:\n{chat_snippet[:1200]}")
    return "\n\n".join(parts)


def _is_give_up(answer: str) -> bool:
    return bool(_GIVE_UP_RE.match(answer.strip()))


def _is_short_valid(answer: str) -> bool:
    t = answer.strip().lower()
    return t in _SHORT_VALID or len(answer.strip()) >= 2


def _explain_give_up(
    llm,
    target_label: str,
    question: str,
    learn_note: dict,
) -> dict[str, Any]:
    """学生表示不会时，仍给出参考答案。"""
    if not llm:
        return {
            "correct": False,
            "explanation": (
                f"参考答案：请结合笔记「{target_label}」中关于本题的内容复习。"
                "可在主对话中继续追问以获取详细讲解。"
            ),
        }
    user_content = (
        f"学生对本题回答「不会/不知道」。请直接给出教学用的参考答案。\n\n"
        f"知识点: {target_label}\n"
        f"题目: {question}\n\n"
        f"参考笔记:\n{_note_context_block(learn_note, target_label)[:2500]}\n\n"
        f"只输出 JSON：{{\"correct\": false, \"explanation\": \"参考答案：...\"}}"
    )
    try:
        resp = llm.complete(
            messages=[
                {"role": "system", "content": "你只输出 JSON。explanation 必须以「参考答案：」开头。"},
                {"role": "user", "content": user_content},
            ],
            temperature=0.2,
            max_tokens=600,
        )
        parsed = json.loads(_strip_json(resp))
        if isinstance(parsed, dict):
            expl = str(parsed.get("explanation") or "").strip()
            if expl and not expl.startswith("参考答案"):
                expl = f"参考答案：{expl}"
            return {
                "correct": False,
                "explanation": (expl or f"参考答案：请复习「{target_label}」相关笔记。")[:500],
            }
    except Exception:
        pass
    return {
        "correct": False,
        "explanation": f"参考答案：请结合笔记「{target_label}」复习本题要点。",
    }


def upsert_wrong_log(log: list, entry: dict) -> None:
    """同一知识点+题目只保留一条错题记录（更新为最新作答）。"""
    key = (entry.get("targetLabel"), entry.get("question"))
    for i, e in enumerate(log):
        if isinstance(e, dict) and (e.get("targetLabel"), e.get("question")) == key:
            log[i] = entry
            return
    log.append(entry)


def _fallback_questions(target_label: str) -> list[dict]:
    templates = [
        f"用一句话说明「{target_label}」的核心含义。",
        f"「{target_label}」最容易与什么概念混淆？如何区分？",
        f"请举一个体现「{target_label}」的简单例子。",
        f"如果要用「{target_label}」解决实际问题，第一步是什么？",
    ]
    return [{"id": f"q{i + 1}", "prompt": t} for i, t in enumerate(templates[:3])]


def generate_quiz(
    llm,
    learn_note: dict | None,
    target_label: str,
    chat_snippet: str = "",
) -> dict[str, Any]:
    """返回 { target_label, questions: [{id, prompt}] }"""
    note = normalize_learn_note(learn_note)
    label = (target_label or "").strip()
    if not label:
        raise ValueError("target_label 不能为空")

    if not llm:
        qs = _fallback_questions(label)
        return {"target_label": label, "questions": qs, "count": len(qs)}

    user_content = (
        f"{QUIZ_GENERATE_PROMPT}\n\n"
        f"{_note_context_block(note, label, chat_snippet)}"
    )
    try:
        resp = llm.complete(
            messages=[
                {"role": "system", "content": "你只输出 JSON。"},
                {"role": "user", "content": user_content},
            ],
            temperature=0.4,
            max_tokens=1500,
        )
        parsed = json.loads(_strip_json(resp))
        if isinstance(parsed, dict) and isinstance(parsed.get("questions"), list):
            questions = []
            for i, q in enumerate(parsed["questions"][:5]):
                if not isinstance(q, dict):
                    continue
                prompt = str(q.get("prompt") or "").strip()
                if not prompt:
                    continue
                qid = str(q.get("id") or f"q{i + 1}")
                questions.append({"id": qid, "prompt": prompt[:120]})
            if len(questions) >= 2:
                return {
                    "target_label": label,
                    "questions": questions,
                    "count": len(questions),
                }
    except Exception:
        pass

    qs = _fallback_questions(label)
    return {"target_label": label, "questions": qs, "count": len(qs)}


def evaluate_answer(
    llm,
    target_label: str,
    question: str,
    user_answer: str,
    learn_note: dict | None,
) -> dict[str, Any]:
    """返回 { correct: bool, explanation: str }"""
    note = normalize_learn_note(learn_note)
    answer = (user_answer or "").strip()
    if not answer:
        return {"correct": False, "explanation": "请先作答。"}

    if _is_give_up(answer):
        return _explain_give_up(llm, target_label, question, note)

    if not _is_short_valid(answer):
        return {"correct": False, "explanation": "请先作答。"}

    if not llm:
        short_ok = answer.strip().lower() in _SHORT_VALID
        ok = short_ok or len(answer) >= 8
        if ok:
            return {"correct": True, "explanation": "回答正确，继续保持。"}
        return {
            "correct": False,
            "explanation": (
                f"参考答案：请结合笔记「{target_label}」说明本题要点。"
            ),
        }

    user_content = (
        f"{EVALUATE_PROMPT}\n\n"
        f"知识点: {target_label}\n"
        f"题目: {question}\n"
        f"学生答案: {answer}\n\n"
        f"参考笔记:\n{_note_context_block(note, target_label)[:2500]}"
    )
    try:
        resp = llm.complete(
            messages=[
                {"role": "system", "content": "你只输出 JSON。"},
                {"role": "user", "content": user_content},
            ],
            temperature=0.2,
            max_tokens=600,
        )
        parsed = json.loads(_strip_json(resp))
        if isinstance(parsed, dict) and "correct" in parsed:
            correct = bool(parsed.get("correct"))
            expl = str(parsed.get("explanation") or "").strip()[:500]
            if not correct and expl and not expl.startswith("参考答案"):
                expl = f"参考答案：{expl}"
            return {
                "correct": correct,
                "explanation": expl
                or ("正确！" if correct else f"参考答案：请复习「{target_label}」相关要点。"),
            }
    except Exception:
        pass

    ok = answer.strip().lower() in _SHORT_VALID or len(answer) >= 8
    return {
        "correct": ok,
        "explanation": "回答正确。" if ok else f"参考答案：请结合笔记复习「{target_label}」。",
    }


def complete_mastery(note: dict, target_label: str) -> dict:
    """标记节点已掌握，返回更新后的 learn_note。"""
    return mark_node_learned(normalize_learn_note(note), target_label)


def new_wrong_entry(
    target_label: str,
    question: str,
    user_answer: str,
    explanation: str,
) -> dict:
    return {
        "id": uuid.uuid4().hex[:10],
        "targetLabel": target_label,
        "question": question[:200],
        "userAnswer": user_answer[:500],
        "explanation": explanation[:500],
        "at": __import__("datetime").datetime.now().isoformat(),
    }
