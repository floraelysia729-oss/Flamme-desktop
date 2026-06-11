"""摄入路由 — 单文件 + 全量扫描 + 同步索引"""

import json
import logging

from fastapi import APIRouter, Request
from pydantic import BaseModel

from src.api.deps import get_request_config_or_default
from src.api.runtime import build_coordinator, build_db, build_tools
from src.infra.log_config import log_file_path
from src.tools.sync import run_vault_sync, is_source_doc

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ingest")


class IngestRequest(BaseModel):
    path: str
    wait: bool = False


class SyncRequest(BaseModel):
    embed: bool = False
    graph: bool = False
    topics: bool = False
    entities: bool = False
    entity_paths: list[str] | None = None


def _format_task_response(task: dict | None) -> dict:
    """将 task_queue 行格式化为前端可轮询的响应"""
    if not task:
        return {"status": "error", "error": "任务不存在"}
    status = task.get("status", "pending")
    payload = task.get("payload") or {}
    if not isinstance(payload, dict):
        try:
            payload = json.loads(payload) if payload else {}
        except (TypeError, json.JSONDecodeError):
            payload = {}

    if status == "done":
        result = payload.get("result", payload)
        if isinstance(result, dict):
            return {
                "status": "ok",
                "message": result.get("message"),
                "stages": result.get("stages", []),
                "result": result,
            }
        return {"status": "ok", "result": result, "message": str(result)}

    if status == "failed":
        progress = payload.get("progress") or {}
        return {
            "status": "error",
            "error": payload.get("_error", "任务失败"),
            "stages": progress.get("stages", []),
            "message": progress.get("message"),
        }

    progress = payload.get("progress") or {}
    queue_status = "running" if status == "claimed" else "pending"
    return {
        "status": queue_status,
        "stages": progress.get("stages", []),
        "message": progress.get("message"),
        "path": payload.get("path"),
    }


@router.post("")
def ingest_file(req: IngestRequest, request: Request):
    relpath = req.path.replace("\\", "/")
    if not is_source_doc(relpath):
        return {
            "status": "error",
            "error": "实体/主题等系统 wiki 页不能摄入，请对源资料（课程笔记、PDF 等）执行摄入",
            "result": {"message": f"不可摄入: {relpath}", "stages": []},
        }
    cfg = get_request_config_or_default(request)
    logger.info(
        "[INGEST] POST /ingest path=%s vault=%s mineru=%s llm=%s wait=%s log=%s",
        relpath,
        cfg.vault_path,
        "yes" if cfg.mineru_api_token else "NO",
        "yes" if cfg.llm_api_key else "NO",
        req.wait,
        log_file_path(),
    )
    runtime = build_coordinator(cfg)
    db = runtime["db"]
    coordinator = runtime["coordinator"]
    try:
        task_id = coordinator.dispatch("ingest", {"path": req.path})
        if not req.wait:
            logger.info("[INGEST] task_id=%s 已派发（异步）", task_id)
            return {"status": "running", "task_id": task_id}

        logger.info("[INGEST] task_id=%s 等待完成 (最长 900s) …", task_id)
        result = coordinator.wait_for(task_id, timeout=900)
        if isinstance(result, dict) and result.get("error"):
            msg = str(result["error"])
            logger.error("[INGEST] 失败 task_id=%s: %s", task_id, msg)
            return {
                "status": "error",
                "error": msg,
                "task_id": task_id,
                "result": {"message": msg, "stages": [], "error": msg},
            }
        logger.info("[INGEST] 成功 task_id=%s: %s", task_id, str(result)[:200])
        if isinstance(result, dict):
            return {"status": "ok", "task_id": task_id, "result": result}
        return {"status": "ok", "task_id": task_id, "result": {"message": str(result), "stages": []}}
    finally:
        db.close()


@router.get("/tasks/{task_id}")
def get_ingest_task(task_id: int, request: Request):
    """轮询单文件摄入任务进度"""
    cfg = get_request_config_or_default(request)
    db = build_db(cfg)
    try:
        task = db.get_task(task_id)
        if not task or task.get("type") != "ingest":
            return {"status": "error", "error": f"任务不存在: {task_id}"}
        body = _format_task_response(task)
        body["task_id"] = task_id
        return body
    finally:
        db.close()


@router.post("/vault")
def ingest_vault(request: Request):
    cfg = get_request_config_or_default(request)
    db = build_db(cfg)
    try:
        data = run_vault_sync(db, cfg.vault_path)
        if data.get("error"):
            return {"status": "error", "error": data["error"]}
        return {"status": "ok", **data}
    finally:
        db.close()


@router.post("/sync")
def sync_vault(req: SyncRequest, request: Request):
    """同步 vault 文件到 SQLite 索引"""
    cfg = get_request_config_or_default(request)
    logger.info(
        "[SYNC] embed=%s graph=%s topics=%s entities=%s vault=%s log=%s",
        req.embed,
        req.graph,
        req.topics,
        req.entities,
        cfg.vault_path,
        log_file_path(),
    )
    runtime = build_tools(cfg)
    db = runtime["db"]
    registry = runtime["registry"]
    try:
        data = run_vault_sync(
            db, cfg.vault_path, registry,
            llm=runtime.get("llm"),
            embed=req.embed,
            graph=req.graph,
            topics=req.topics,
            entities=req.entities,
            entity_paths=req.entity_paths,
        )
        if data.get("error"):
            logger.error("[SYNC] 错误: %s", data["error"])
            return {"status": "error", "error": data["error"]}
        if data.get("topics_error"):
            logger.warning("[TOPIC] 失败: %s", data["topics_error"])
        elif data.get("topics_result"):
            tr = data["topics_result"]
            logger.info("[TOPIC] 结果: %s", tr if isinstance(tr, str) else tr)
        gr = data.get("graph_result")
        if isinstance(gr, dict):
            logger.info("[GRAPH] status=%s", gr.get("status"))
        elif gr and not data.get("graph_skipped"):
            logger.warning("[GRAPH] %s", gr)
        return {"status": "ok", **data}
    finally:
        db.close()
