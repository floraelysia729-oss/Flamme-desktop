"""POST /api/learn/mastery/* — 掌握测验卡片互动"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from src.agent.context_types import SessionContext
from src.agent.learn_note import normalize_learn_note
from src.agent.mastery_quiz import (
    complete_mastery,
    evaluate_answer,
    generate_quiz,
    new_wrong_entry,
    upsert_wrong_log,
)
from src.api.deps import build_brain_llm_from_config, get_request_config_or_default
from src.db.conversation import ConversationStore

router = APIRouter(prefix="/learn", tags=["learn"])
logger = logging.getLogger(__name__)


class MasteryStartRequest(BaseModel):
    session_id: str
    target_label: str
    learn_note: dict | None = None


class MasteryEvaluateRequest(BaseModel):
    session_id: str
    target_label: str
    question_id: str
    question: str
    user_answer: str
    learn_note: dict | None = None


class MasteryCompleteRequest(BaseModel):
    session_id: str
    target_label: str
    learn_note: dict | None = None


def _load_ctx(conv: ConversationStore, session_id: str) -> tuple[dict | None, SessionContext]:
    meta = conv.get_meta(session_id) or {}
    raw = meta.get("session_context")
    ctx = SessionContext.from_dict(raw if isinstance(raw, dict) else None)
    return meta, ctx


def _save_ctx(conv: ConversationStore, session_id: str, ctx: SessionContext, learn_note: dict | None):
    fields: dict[str, Any] = {"session_context": ctx.to_dict()}
    if learn_note is not None:
        fields["learn_mind"] = learn_note
    conv.upsert_meta(session_id, **fields)


def _chat_snippet(conv: ConversationStore, session_id: str, n: int = 6) -> str:
    msgs = conv.get_recent(session_id, n=n)
    lines = []
    for m in msgs:
        role = m.get("role", "")
        content = (m.get("content") or "").strip()
        if role in ("user", "assistant") and content:
            lines.append(f"{role}: {content[:300]}")
    return "\n".join(lines)


def _ensure_mastery_bucket(ctx: SessionContext) -> dict:
    if not ctx.mastery_quiz or not isinstance(ctx.mastery_quiz, dict):
        ctx.mastery_quiz = {"wrong_log": [], "mastered_labels": []}
    ctx.mastery_quiz.setdefault("wrong_log", [])
    ctx.mastery_quiz.setdefault("mastered_labels", [])
    return ctx.mastery_quiz


@router.post("/mastery/start")
async def mastery_start(req: MasteryStartRequest, request: Request):
    cfg = get_request_config_or_default(request)
    llm = build_brain_llm_from_config(cfg)
    conv = ConversationStore(cfg.conversations_db)
    try:
        _, ctx = _load_ctx(conv, req.session_id)
        note = normalize_learn_note(req.learn_note or ctx.learn_note)
        snippet = _chat_snippet(conv, req.session_id)
        quiz = generate_quiz(llm, note, req.target_label, snippet)

        bucket = _ensure_mastery_bucket(ctx)
        bucket["active"] = {
            "target_label": quiz["target_label"],
            "questions": quiz["questions"],
            "index": 0,
            "passed_ids": [],
        }
        ctx.learn_note = note
        ctx.learn_mind = note
        _save_ctx(conv, req.session_id, ctx, note)

        return {
            "target_label": quiz["target_label"],
            "questions": quiz["questions"],
            "count": quiz.get("count", len(quiz["questions"])),
        }
    finally:
        conv.close()


@router.post("/mastery/evaluate")
async def mastery_evaluate(req: MasteryEvaluateRequest, request: Request):
    cfg = get_request_config_or_default(request)
    llm = build_brain_llm_from_config(cfg)
    conv = ConversationStore(cfg.conversations_db)
    try:
        _, ctx = _load_ctx(conv, req.session_id)
        note = normalize_learn_note(req.learn_note or ctx.learn_note)
        result = evaluate_answer(
            llm,
            req.target_label,
            req.question,
            req.user_answer,
            note,
        )

        bucket = _ensure_mastery_bucket(ctx)
        wrong_entry = None
        if not result["correct"]:
            entry = new_wrong_entry(
                req.target_label,
                req.question,
                req.user_answer,
                result["explanation"],
            )
            upsert_wrong_log(bucket["wrong_log"], entry)
            wrong_entry = entry

        active = bucket.get("active")
        if isinstance(active, dict) and active.get("target_label") == req.target_label:
            if result["correct"]:
                passed = list(active.get("passed_ids") or [])
                if req.question_id not in passed:
                    passed.append(req.question_id)
                active["passed_ids"] = passed
            bucket["active"] = active

        ctx.learn_note = note
        _save_ctx(conv, req.session_id, ctx, note)

        return {
            "correct": result["correct"],
            "explanation": result["explanation"],
            "wrong_entry": wrong_entry,
        }
    finally:
        conv.close()


@router.post("/mastery/complete")
async def mastery_complete(req: MasteryCompleteRequest, request: Request):
    cfg = get_request_config_or_default(request)
    conv = ConversationStore(cfg.conversations_db)
    try:
        _, ctx = _load_ctx(conv, req.session_id)
        note = normalize_learn_note(req.learn_note or ctx.learn_note)
        updated = complete_mastery(note, req.target_label)

        bucket = _ensure_mastery_bucket(ctx)
        labels = list(bucket.get("mastered_labels") or [])
        if req.target_label not in labels:
            labels.append(req.target_label)
        bucket["mastered_labels"] = labels
        bucket["active"] = None

        ctx.learn_note = updated
        ctx.learn_mind = updated
        _save_ctx(conv, req.session_id, ctx, updated)

        return {"learn_note": updated, "target_label": req.target_label}
    finally:
        conv.close()
