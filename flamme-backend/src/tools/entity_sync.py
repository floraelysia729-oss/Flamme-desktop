"""源文档实体抽取 — 供 IngestWorker 与 run_vault_sync 共用"""

from __future__ import annotations

import logging
import os
from pathlib import Path

from src.tools.paths import converted_dir, source_dir_for_path
from src.tools.sync import is_source_doc
from src.vault.index_state import entity_needs_extract, save_entity_state_entry
from src.vault.scanner import BINARY_EXTS

logger = logging.getLogger(__name__)


def run_entity_extract(
    vault_path: str,
    file_path: Path,
    client,
    llm_model: str | None,
    *,
    track_relpath: str | None = None,
    content_hash: str = "",
    force: bool = False,
) -> dict:
    """对单个源文件运行 entity_builder；返回 entity_count / error / skipped / reason。"""
    vault = Path(vault_path)
    file_path = Path(file_path)
    rel = (track_relpath or str(file_path.relative_to(vault))).replace("\\", "/")

    if not entity_needs_extract(vault_path, rel, content_hash, force=force):
        logger.info("[ENTITY] 跳过无变更: %s", rel)
        return {"entity_count": 0, "error": None, "skipped": True, "reason": "无变更", "path": rel}

    if client is None:
        return {"entity_count": 0, "error": "未配置 LLM API Key", "skipped": True, "reason": "未配置 LLM", "path": rel}

    try:
        from src.scripts.entity_builder import build_from_file, collect_all_sources

        all_sources = collect_all_sources(vault)
        logger.info(
            "[ENTITY] build_from_file %s sources=%d model=%s",
            file_path.name,
            len(all_sources),
            llm_model or "(default)",
        )
        results = build_from_file(
            file_path,
            all_sources,
            client,
            vault,
            llm_model=llm_model,
        )
        count = len(results) if results else 0
        if content_hash:
            save_entity_state_entry(vault_path, rel, content_hash, count)
        if count:
            logger.info("Entity build: %d entities from %s", count, file_path.name)
            return {"entity_count": count, "error": None, "skipped": False, "path": rel}
        return {
            "entity_count": 0,
            "error": None,
            "skipped": True,
            "reason": "未识别术语",
            "path": rel,
        }
    except Exception as e:
        logger.exception("Entity build failed for %s: %s", file_path, e)
        return {"entity_count": 0, "error": str(e), "skipped": False, "path": rel}


def run_entities_for_paths(
    vault_path: str,
    relpaths: list[str],
    client,
    llm_model: str | None,
    db=None,
    *,
    force: bool = False,
    limit: int | None = None,
) -> dict:
    """批量对源 .md / 已摄入 PDF 运行实体抽取（sync 收尾 / backfill）。"""
    if client is None:
        return {
            "built": 0,
            "skipped": 0,
            "unchanged": 0,
            "errors": [{"error": "未配置 LLM API Key"}],
            "paths": [],
        }

    if limit is not None and limit > 0:
        relpaths = relpaths[:limit]

    vault = Path(vault_path)
    built, skipped, unchanged, errors, paths_out = 0, 0, 0, [], []

    for relpath in relpaths:
        norm = relpath.replace("\\", "/")
        lower = norm.lower()
        abs_path = vault / norm.replace("/", os.sep)
        track_relpath = norm
        extract_path: Path | None = None

        if lower.endswith(".md") and is_source_doc(norm):
            if not abs_path.is_file():
                continue
            extract_path = abs_path
        elif lower.endswith(BINARY_EXTS):
            if not abs_path.is_file():
                continue
            conv = converted_dir(source_dir_for_path(vault, abs_path)) / f"{abs_path.stem}.md"
            if not conv.is_file():
                errors.append({"path": norm, "error": "converted.md 不存在"})
                continue
            extract_path = conv
        else:
            continue

        content_hash = ""
        if db is not None:
            doc = db.get_document(norm)
            if doc:
                content_hash = doc.get("content_hash") or ""

        if not content_hash and extract_path is not None:
            try:
                from src.tools.sync import content_hash as hash_content
                content_hash = hash_content(extract_path.read_text(encoding="utf-8"))
            except OSError:
                errors.append({"path": norm, "error": "无法读取文件"})
                continue

        result = run_entity_extract(
            vault_path,
            extract_path,
            client,
            llm_model,
            track_relpath=track_relpath,
            content_hash=content_hash,
            force=force,
        )
        paths_out.append({"path": norm, **result})
        if result.get("error"):
            errors.append({"path": norm, "error": result["error"]})
        elif result.get("skipped") and result.get("reason") == "无变更":
            unchanged += 1
            skipped += 1
        elif result.get("skipped"):
            skipped += 1
        elif result.get("entity_count", 0) > 0:
            built += 1

    return {
        "built": built,
        "skipped": skipped,
        "unchanged": unchanged,
        "errors": errors,
        "paths": paths_out[:50],
    }


def list_backfill_entity_paths(vault_path: str, db) -> list[str]:
    """按健康扫描结果列出待补跑实体抽取的源路径（md + 已摄入 PDF）。"""
    from src.vault.entity_health import (
        scan_missing_entity_extract_binary,
        scan_missing_entity_extract_md,
    )

    return (
        scan_missing_entity_extract_md(vault_path, db)
        + scan_missing_entity_extract_binary(vault_path, db)
    )


def list_backfill_md_paths(vault_path: str) -> list[str]:
    """全 vault 用户源 .md（遗留兼容）。"""
    from src.tools.sync import scan_all_md

    return sorted(
        p for p in scan_all_md(vault_path)
        if p.lower().endswith(".md") and is_source_doc(p)
    )
