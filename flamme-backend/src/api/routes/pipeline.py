"""Pipeline 运维 API — 索引流水线（与 vault 文件 CRUD 分离）

  GET  /api/pipeline/status  — git + baseline + DB 概览
  GET  /api/pipeline/plan    — 待处理清单（scope=all|git）
  POST /api/pipeline/run     — 执行预设流水线
  POST /api/pipeline/baseline — 手动更新同步基线（不跑任务）
"""

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from src.api.deps import get_request_config_or_default
from src.api.runtime import build_coordinator, build_db
from src.vault import build_plan, build_git_info, run_vault, load_baseline, save_baseline, PRESETS
from src.infra.git_helper import GitHelper


router = APIRouter(prefix="/pipeline")


class PipelineRunRequest(BaseModel):
    preset: str = "ingest"
    embed: bool = True
    graph: bool = False
    topics: bool = False
    entities: bool = False
    force_entities: bool = False
    entity_limit: int = Field(20, description="backfill-entities 单次最多处理源文件数")
    cleanup: bool = True
    scope: str = Field("all", description="all=全量扫描, git=仅 git 变更相关")


class BaselineRequest(BaseModel):
    preset: str = "manual"


@router.get("/status")
def pipeline_status(request: Request):
    cfg = get_request_config_or_default(request)
    db = build_db(cfg)
    try:
        git_info = build_git_info(cfg.vault_path, cfg.wiki_dir)
        baseline = load_baseline(cfg.wiki_dir)
        stats = db.get_stats()
        import os
        docs = db.list_documents()
        missing_count = sum(
            1 for d in docs
            if not os.path.isfile(os.path.join(cfg.vault_path, d["path"]))
        )
        return {
            "vault_path": cfg.vault_path,
            "git": git_info,
            "baseline": baseline,
            "db": {
                **stats,
                "missing_files": missing_count,
            },
            "presets": sorted(PRESETS),
        }
    finally:
        db.close()


@router.get("/plan")
def pipeline_plan(request: Request, scope: str = "all"):
    cfg = get_request_config_or_default(request)
    db = build_db(cfg)
    try:
        if scope not in ("all", "git"):
            return {"error": "scope 必须是 all 或 git"}
        return build_plan(cfg.vault_path, cfg.wiki_dir, db, scope=scope)
    finally:
        db.close()


@router.post("/run")
def pipeline_run(req: PipelineRunRequest, request: Request):
    cfg = get_request_config_or_default(request)
    runtime = build_coordinator(cfg)
    db = runtime["db"]
    try:
        if req.scope not in ("all", "git"):
            return {"status": "error", "error": "scope 必须是 all 或 git"}
        if req.preset not in PRESETS:
            return {"status": "error", "error": f"未知 preset，可选: {sorted(PRESETS)}"}
        result = run_vault(
            cfg, db, runtime["coordinator"], runtime["registry"],
            preset=req.preset,
            embed=req.embed,
            graph=req.graph,
            topics=req.topics,
            entities=req.entities,
            force_entities=req.force_entities,
            entity_limit=req.entity_limit,
            cleanup=req.cleanup,
            scope=req.scope,
        )
        if result.get("error"):
            return {"status": "error", **result}
        return {"status": "ok", **result}
    finally:
        db.close()


@router.post("/baseline")
def pipeline_baseline(req: BaselineRequest, request: Request):
    """将当前 git HEAD 标记为已同步基线（不执行任务）"""
    cfg = get_request_config_or_default(request)
    git = GitHelper(cfg.vault_path)
    git_commit = None
    if git.is_repo():
        try:
            git_commit = git.get_head_commit()
        except RuntimeError:
            pass
    baseline = save_baseline(
        cfg.wiki_dir,
        git_commit=git_commit,
        preset=req.preset,
        summary={"manual": True},
    )
    return {"status": "ok", "baseline": baseline}
