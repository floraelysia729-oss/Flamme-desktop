"""Vault 运维执行 — 确定性流水线，不经过 Orchestrator"""

import logging

from src.tools.sync import run_vault_sync, format_sync_summary
from src.vault.baseline import save_baseline
from src.vault.planner import build_plan
from src.infra.git_helper import GitHelper

logger = logging.getLogger(__name__)

PRESETS = frozenset({"index", "ingest", "full", "cleanup", "backfill-entities", "entity-maintain"})


def run_vault(
    cfg,
    db,
    coordinator,
    registry,
    *,
    preset: str = "ingest",
    embed: bool = True,
    graph: bool = False,
    topics: bool = False,
    entities: bool = False,
    force_entities: bool = False,
    entity_limit: int = 20,
    cleanup: bool = True,
    scope: str = "all",
    ingest_timeout: float = 3600,
) -> dict:
    """执行 vault 运维预设，返回结果摘要并更新 sync baseline"""
    if preset not in PRESETS:
        return {"error": f"未知 preset: {preset}，可选: {sorted(PRESETS)}"}

    llm = getattr(coordinator, "_llm", None)

    if preset == "entity-maintain":
        from src.vault.entity_health import scan_entity_health
        from src.vault.entity_maintain import run_entity_maintain

        scan = scan_entity_health(cfg.vault_path, db)
        mr = run_entity_maintain(cfg.vault_path, db, scan)
        results: dict = {
            "preset": preset,
            "scope": scope,
            "steps": [{"step": "entity_maintain", **mr}],
        }
        results["plan_after"] = build_plan(cfg.vault_path, cfg.wiki_dir, db, scope=scope)
        _finalize_baseline(cfg, preset, results)
        return results

    if preset == "backfill-entities":
        from src.tools.entity_sync import list_backfill_entity_paths, run_entities_for_paths

        paths = list_backfill_entity_paths(cfg.vault_path, db)
        if entity_limit and entity_limit > 0:
            paths = paths[:entity_limit]
        client = getattr(llm, "_client", None) if llm else None
        llm_model = getattr(llm, "_model", None) if llm else None
        er = run_entities_for_paths(
            cfg.vault_path,
            paths,
            client,
            llm_model,
            db=db,
            force=force_entities,
        )
        results = {
            "preset": preset,
            "scope": scope,
            "entity_limit": entity_limit,
            "paths_queued": len(paths),
            "steps": [{"step": "entities", **er}],
        }
        results["plan_after"] = build_plan(cfg.vault_path, cfg.wiki_dir, db, scope=scope)
        _finalize_baseline(cfg, preset, results)
        return results

    plan = build_plan(cfg.vault_path, cfg.wiki_dir, db, scope=scope)
    scan = plan["scan"]
    results = {"preset": preset, "scope": scope, "steps": []}

    if preset == "cleanup":
        deleted = db.purge_missing()
        results["steps"].append({"step": "cleanup", "deleted": len(deleted), "paths": deleted[:50]})
        _finalize_baseline(cfg, preset, results)
        return results

    # ── 1. 清理 DB 中已删除文件的记录 + entity_state ──
    if cleanup and scan.get("md_removed"):
        from src.vault.entity_maintain import cleanup_entity_state

        removed = scan["md_removed"]
        state_cleaned = cleanup_entity_state(cfg.vault_path, removed)
        orphan_keys = scan.get("entity_state_orphan_keys") or []
        state_cleaned.extend(cleanup_entity_state(cfg.vault_path, orphan_keys))
        deleted = db.purge_missing()
        results["steps"].append({
            "step": "cleanup",
            "deleted": len(deleted),
            "entity_state_cleaned": len(set(state_cleaned)),
        })

    # ── 2. 批量摄入二进制 ──
    binaries = scan.get("binary_unprocessed", [])
    if preset in ("ingest", "full") and binaries:
        payloads = []
        for relpath in binaries:
            payloads.append({"path": relpath})
        task_ids = coordinator.dispatch_batch("ingest", payloads)
        timeout = min(ingest_timeout, max(120.0, len(task_ids) * 120.0))
        batch_results = coordinator.wait_for_batch(task_ids, timeout=timeout)
        ok = sum(1 for r in batch_results if isinstance(r, dict) and "error" not in r)
        failed = len(batch_results) - ok
        results["steps"].append({
            "step": "ingest",
            "total": len(binaries),
            "ok": ok,
            "failed": failed,
            "details": batch_results[:20],
        })

    # ── 3. 同步 .md 索引 ──
    if preset in ("index", "ingest", "full"):
        do_embed = embed and preset != "cleanup"
        do_graph = graph or topics
        do_entities = entities
        sync_data = run_vault_sync(
            db, cfg.vault_path, registry,
            llm=llm,
            embed=do_embed,
            graph=do_graph,
            topics=topics,
            entities=do_entities,
            force_entities=force_entities,
        )
        if sync_data.get("error"):
            results["error"] = sync_data["error"]
            return results
        results["steps"].append({
            "step": "sync",
            "summary": format_sync_summary(sync_data),
            "added": len(sync_data.get("added", [])),
            "updated": len(sync_data.get("updated", [])),
            "removed": len(sync_data.get("removed", [])),
        })
        if sync_data.get("embed_result"):
            results["steps"].append({"step": "embed", "result": sync_data["embed_result"]})
        if sync_data.get("graph_result") is not None:
            results["steps"].append({"step": "graph", "result": sync_data["graph_result"]})
        if sync_data.get("topics_result"):
            results["steps"].append({"step": "topics", "result": sync_data["topics_result"]})
        if sync_data.get("topics_error"):
            results["steps"].append({"step": "topics", "result": {"error": sync_data["topics_error"], "built": 0}})
        if sync_data.get("entities_result"):
            results["steps"].append({"step": "entities", "result": sync_data["entities_result"]})
        if sync_data.get("entities_error"):
            results["steps"].append({"step": "entities", "result": {"error": sync_data["entities_error"], "built": 0}})

    results["plan_after"] = build_plan(cfg.vault_path, cfg.wiki_dir, db, scope=scope)
    _finalize_baseline(cfg, preset, results)
    return results


def _finalize_baseline(cfg, preset: str, results: dict) -> None:
    git_commit = None
    git = GitHelper(cfg.vault_path)
    if git.is_repo():
        try:
            git_commit = git.get_head_commit()
        except RuntimeError:
            pass
    summary = {
        "steps": [s.get("step") for s in results.get("steps", [])],
        "pending_after": results.get("plan_after", {}).get("pending_count"),
    }
    baseline = save_baseline(cfg.wiki_dir, git_commit=git_commit, preset=preset, summary=summary)
    results["baseline"] = baseline
