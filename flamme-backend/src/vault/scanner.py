"""Vault 磁盘扫描 — 对比 SQLite，分类待处理文件

文件系统是真相来源；DB 是索引。扫描结果供 planner / runner 使用。
"""

import hashlib
import os
from pathlib import Path

from src.tools.sync import SKIP_DIRS, scan_all_md, content_hash, is_source_doc
from src.tools.paths import converted_dir, source_dir_for_path
from src.vault.binary_paths import dedupe_binary_queue, find_sibling_pdf, is_ppt_path


BINARY_EXTS = (".pdf", ".pptx", ".ppt", ".doc", ".docx")
SOURCE_EXTS = BINARY_EXTS + (".excalidraw",)


def _should_skip(path: Path) -> bool:
    return any(part in SKIP_DIRS for part in path.parts)


def _to_relpath(vault: Path, abs_path: Path) -> str:
    return str(abs_path.relative_to(vault)).replace("\\", "/")


def scan_binary_files(vault_path: str) -> list[str]:
    """扫描待摄入的二进制源文件（相对路径）"""
    vault = Path(vault_path)
    files: list[str] = []
    for root, dirs, filenames in os.walk(vault):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS and not d.startswith(".")]
        for name in filenames:
            lower = name.lower()
            if not lower.endswith(BINARY_EXTS):
                continue
            abs_path = Path(root) / name
            if _should_skip(abs_path):
                continue
            files.append(_to_relpath(vault, abs_path))
    return sorted(files)


def needs_binary_ingest(vault: Path, relpath: str, db_paths: set[str]) -> bool:
    """二进制文件是否尚未完成摄入（无 converted 或 DB 无记录）"""
    abs_path = vault / relpath.replace("/", os.sep)
    if not abs_path.is_file():
        return False

    # PPT 已转为 PDF 时由 PDF 路径继续后续摄入，避免重复 PPT→PDF
    if is_ppt_path(relpath) and find_sibling_pdf(abs_path) is not None:
        return False

    source_dir = source_dir_for_path(vault, abs_path)
    conv = converted_dir(source_dir) / f"{abs_path.stem}.md"
    try:
        has_converted = conv.is_file() and conv.stat().st_size >= 32
    except OSError:
        has_converted = False
    # 须同时有 DB 记录与非空 converted.md，才算摄入完成（避免半成品被跳过）
    if relpath in db_paths and has_converted:
        return False
    return True


def scan_md_vs_db(vault_path: str, db) -> dict:
    """对比磁盘 .md 与 DB 记录"""
    vault = Path(vault_path)
    disk_files = scan_all_md(vault_path)
    db_docs = db.list_documents()
    db_map = {doc["path"]: doc for doc in db_docs}
    disk_set = set(disk_files)

    md_new: list[str] = []
    md_updated: list[str] = []

    for relpath in disk_files:
        if not is_source_doc(relpath):
            continue
        abs_path = vault / relpath.replace("/", os.sep)
        try:
            raw = abs_path.read_text(encoding="utf-8")
        except OSError:
            continue
        h = content_hash(raw)
        doc = db_map.get(relpath)
        if doc is None:
            md_new.append(relpath)
        elif doc.get("content_hash") != h:
            md_updated.append(relpath)

    md_removed = [
        doc["path"] for doc in db_docs
        if doc["path"] not in disk_set
        and not os.path.isfile(os.path.join(vault_path, doc["path"]))
    ]

    return {
        "md_new": md_new,
        "md_updated": md_updated,
        "md_removed": md_removed,
    }


def scan_vault(vault_path: str, db) -> dict:
    """完整扫描：md 索引差异 + 未处理二进制 + 缺失 embedding"""
    db_docs = db.list_documents()
    db_paths = {doc["path"] for doc in db_docs}
    vault = Path(vault_path)

    md_diff = scan_md_vs_db(vault_path, db)
    binary_all = scan_binary_files(vault_path)
    binary_unprocessed = dedupe_binary_queue(
        vault,
        [p for p in binary_all if needs_binary_ingest(vault, p, db_paths)],
    )

    unembedded = db.get_unembedded_docs()
    missing_embed = [d["path"] for d in unembedded if is_source_doc(d["path"])]

    from src.vault.entity_health import scan_entity_health

    entity_health = scan_entity_health(vault_path, db)

    return {
        **md_diff,
        "binary_unprocessed": binary_unprocessed,
        "binary_total": len(binary_all),
        "missing_embed": missing_embed,
        "total_disk_md": len(scan_all_md(vault_path)),
        "total_db": len(db_docs),
        **entity_health,
    }


INGEST_PARALLEL = 3


def estimate_seconds(plan: dict) -> int:
    """粗估耗时（秒）"""
    import math
    sec = 0
    bin_count = len(plan.get("binary_unprocessed", []))
    if bin_count:
        sec += math.ceil(bin_count / INGEST_PARALLEL) * 50
    sec += len(plan.get("md_new", [])) * 2
    sec += len(plan.get("md_updated", [])) * 2
    sec += len(plan.get("missing_embed", [])) * 3
    sec += len(plan.get("md_removed", [])) * 1
    ent = plan.get("missing_entity_extract_count", 0)
    if ent:
        sec += math.ceil(ent / 3) * 15
    return max(sec, 5)
