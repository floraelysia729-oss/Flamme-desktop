"""POST /api/chat — SSE 流式输出（通过 Orchestrator）"""

import json
import uuid
import threading
import queue as queue_mod
import logging
from typing import Any, Generator

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from src.api.deps import get_request_config, build_llm_from_config, build_brain_llm_from_config, get_request_config_or_default
from src.config import Config


router = APIRouter()
logger = logging.getLogger(__name__)


class ChatRequest(BaseModel):
    message: str
    session_id: str | None = None
    mode: str = "search"
    selected_files: list[str] | None = None
    learn_mind: dict | None = None
    learn_note: dict | None = None


class SessionPatchRequest(BaseModel):
    archived_note_path: str | None = None
    last_archived_at: str | None = None
    last_archived_message_idx: int | None = None
    title: str | None = None


def _build_thread_orchestrator(cfg: Config):
    """在 producer 线程中构建独立的 Orchestrator（每个线程独立 SQLite 连接）"""
    from src.api.runtime import build_runtime

    runtime = build_runtime(cfg)
    return runtime["orchestrator"], runtime["db"]


def _emit_sse_event(token: Any) -> str | None:
    """将 orchestrator yield 转为 SSE data 行"""
    if isinstance(token, dict):
        t = token.get("__type__")
        if t == "suggested_questions":
            return f"data: {json.dumps({'type': 'suggested_questions', 'questions': token['questions']}, ensure_ascii=False)}\n\n"
        if t == "tool_status":
            payload = {k: v for k, v in token.items() if k != "__type__"}
            payload["type"] = "tool_status"
            return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"
        if t == "file_write":
            payload = {k: v for k, v in token.items() if k != "__type__"}
            payload["type"] = "file_write"
            return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"
        if t == "learn_note":
            return f"data: {json.dumps({'type': 'learn_note', 'note': token.get('note'), 'drift': token.get('drift')}, ensure_ascii=False)}\n\n"
        if t == "learn_mind":
            return f"data: {json.dumps({'type': 'learn_mind', 'mind': token.get('mind')}, ensure_ascii=False)}\n\n"
        if t == "context_pressure":
            return f"data: {json.dumps({'type': 'context_pressure', 'level': token.get('level')}, ensure_ascii=False)}\n\n"
        if t == "evidence_pack":
            return f"data: {json.dumps({'type': 'evidence_pack', 'items': token.get('items', [])}, ensure_ascii=False)}\n\n"
        return None
    if isinstance(token, str) and token.startswith("__ERROR__"):
        return f"data: {json.dumps({'type': 'error', 'content': token[9:]}, ensure_ascii=False)}\n\n"
    if isinstance(token, str) and token.startswith("\n> 🔧"):
        return f"data: {json.dumps({'type': 'tool_call', 'content': token.strip()}, ensure_ascii=False)}\n\n"
    if isinstance(token, str):
        return f"data: {json.dumps({'type': 'token', 'content': token}, ensure_ascii=False)}\n\n"
    return None


def _sse_stream(question: str, session_id: str, cfg: Config,
                mode: str = "search",
                selected_files: list[str] | None = None,
                learn_mind: dict | None = None,
                learn_note: dict | None = None) -> Generator[str, None, None]:
    """生成 SSE 事件流 — producer 线程独立连接"""
    llm = build_llm_from_config(cfg)
    brain_llm = build_brain_llm_from_config(cfg)
    if not (brain_llm or llm):
        yield f"data: {json.dumps({'type': 'error', 'content': 'LLM 未配置。请在插件设置中填写 API Key。'}, ensure_ascii=False)}\n\n"
        return
    if not brain_llm:
        yield f"data: {json.dumps({'type': 'error', 'content': 'Orchestrator 需要 Brain API Key。请在插件设置中配置 LLM API Key。'}, ensure_ascii=False)}\n\n"
        return

    token_queue = queue_mod.Queue()

    def producer():
        db = None
        try:
            orchestrator, db = _build_thread_orchestrator(cfg)
            for token in orchestrator.chat(
                session_id, question, mode=mode,
                selected_files=selected_files,
                learn_mind=learn_mind,
                learn_note=learn_note,
            ):
                token_queue.put(token)
        except Exception as e:
            import traceback
            tb = traceback.format_exc()
            logger.exception("SSE producer failed: %s", e)
            token_queue.put(f"__ERROR__{type(e).__name__}: {e}\n{tb}")
        finally:
            if db is not None:
                db.close()
            token_queue.put(None)

    thread = threading.Thread(target=producer, daemon=True)
    thread.start()

    try:
        while True:
            try:
                token = token_queue.get(timeout=1)
            except queue_mod.Empty:
                yield f"data: {json.dumps({'type': 'heartbeat'}, ensure_ascii=False)}\n\n"
                continue
            if token is None:
                break
            line = _emit_sse_event(token)
            if line:
                if line.startswith('data: {"type": "error"'):
                    yield line
                    break
                yield line
        yield f"data: {json.dumps({'type': 'done'})}\n\n"
    except Exception as e:
        logger.exception("SSE stream failed: %s", e)
        yield f"data: {json.dumps({'type': 'error', 'content': str(e)}, ensure_ascii=False)}\n\n"


@router.post("/chat")
async def chat(req: ChatRequest, request: Request):
    cfg = get_request_config(request)
    session_id = req.session_id or str(uuid.uuid4())
    return StreamingResponse(
        _sse_stream(
            req.message, session_id, cfg,
            mode=req.mode,
            selected_files=req.selected_files,
            learn_mind=req.learn_mind,
            learn_note=req.learn_note or req.learn_mind,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@router.delete("/chat/{session_id}")
async def clear_session(session_id: str, request: Request):
    """清空会话历史"""
    from src.db.conversation import ConversationStore
    cfg = get_request_config_or_default(request)
    conv_store = ConversationStore(cfg.conversations_db)
    conv_store.clear_session(session_id)
    conv_store.close()
    return {"ok": True}


@router.get("/chat/sessions")
async def list_sessions(request: Request, mode: str | None = None):
    """返回会话列表，可选 mode=learn|search 过滤"""
    from src.db.conversation import ConversationStore
    cfg = get_request_config_or_default(request)
    conv_store = ConversationStore(cfg.conversations_db)
    sessions = conv_store.list_sessions(mode=mode)
    conv_store.close()
    return {"sessions": sessions}


@router.get("/chat/sessions/{session_id}")
async def get_session(session_id: str, request: Request):
    """获取单个会话详情（消息 + 元数据）"""
    from src.db.conversation import ConversationStore
    cfg = get_request_config_or_default(request)
    conv_store = ConversationStore(cfg.conversations_db)
    detail = conv_store.get_session_detail(session_id)
    conv_store.close()
    return detail


@router.patch("/chat/sessions/{session_id}")
async def patch_session(session_id: str, req: SessionPatchRequest, request: Request):
    """更新会话归档等元数据"""
    from src.db.conversation import ConversationStore
    cfg = get_request_config_or_default(request)
    conv_store = ConversationStore(cfg.conversations_db)
    fields = req.model_dump(exclude_none=True)
    if fields:
        conv_store.upsert_meta(session_id, **fields)
    conv_store.close()
    return {"ok": True, "session_id": session_id}
