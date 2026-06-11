"""实体健康扫描 — 零 LLM：缺抽取、失效 sources、孤儿实体"""

from __future__ import annotations

import os
import re
from pathlib import Path

from src.knowledge.link_resolver import LinkResolver
from src.scripts.entity_builder import _parse_source_names
from src.scripts.llm_utils import read_frontmatter
from src.tools.paths import all_flamme_dirs, converted_dir, entities_dir, source_dir_for_path
from src.tools.sync import is_source_doc, scan_all_md
from src.vault.index_state import entity_needs_extract, load_entity_state
from src.vault.scanner import BINARY_EXTS

_MANUAL_KEEP_STATUSES = frozenset({"stable", "needs_review", "manual"})


def _stem(name: str) -> str:
    base = name.split("/")[-1]
    i = base.rfind(".")
    return base[:i] if i > 0 else base


def _vault_file_exists(vault: Path, relpath: str) -> bool:
    p = vault / relpath.replace("/", os.sep)
    try:
        return p.is_file()
    except OSError:
        return False


def _find_binary_by_stem(vault: Path, stem: str) -> bool:
    stem_lower = stem.lower()
    for root, dirs, files in os.walk(vault):
        dirs[:] = [d for d in dirs if d not in {".wiki", ".obsidian", ".git", "node_modules", ".trash"}]
        for name in files:
            lower = name.lower()
            if not lower.endswith(BINARY_EXTS):
                continue
            if Path(name).stem.lower() == stem_lower:
                return True
    return False


def _find_converted_by_stem(vault: Path, stem: str) -> bool:
    stem_lower = stem.lower()
    for fd in all_flamme_dirs(vault):
        conv = fd / "converted"
        if not conv.is_dir():
            continue
        for f in conv.glob("*.md"):
            if f.stem.lower() == stem_lower:
                return True
    return False


def _find_source_md_by_stem(vault: Path, stem: str) -> str | None:
    stem_lower = stem.lower()
    for relpath in scan_all_md(str(vault)):
        if not relpath.lower().endswith(".md") or not is_source_doc(relpath):
            continue
        if _stem(relpath).lower() == stem_lower:
            return relpath
    return None


def resolve_source_alive(vault_path: str, db, source_name: str) -> tuple[bool, str]:
    """判定 sources 中的 stem/标题是否仍对应现存源。返回 (alive, reason)。"""
    vault = Path(vault_path)
    name = source_name.strip()
    if not name:
        return False, "empty"

    resolver = LinkResolver(db, vault_path)
    hit = resolver.resolve(name)
    if hit and _vault_file_exists(vault, hit["path"]):
        return True, f"resolved:{hit['path']}"

    stem = _stem(name)
    if _find_binary_by_stem(vault, stem):
        return True, "binary_stem"
    if _find_converted_by_stem(vault, stem):
        return True, "converted_stem"
    md_path = _find_source_md_by_stem(vault, stem)
    if md_path and _vault_file_exists(vault, md_path):
        return True, f"md_stem:{md_path}"

    return False, "not_found"


def scan_missing_entity_extract_md(vault_path: str, db) -> list[str]:
    vault = Path(vault_path)
    out: list[str] = []
    for relpath in scan_all_md(vault_path):
        if not relpath.lower().endswith(".md") or not is_source_doc(relpath):
            continue
        if not _vault_file_exists(vault, relpath):
            continue
        doc = db.get_document(relpath)
        if not doc:
            continue
        h = doc.get("content_hash") or ""
        if entity_needs_extract(vault_path, relpath, h):
            out.append(relpath)
    return sorted(out)


def scan_missing_entity_extract_binary(vault_path: str, db) -> list[str]:
    vault = Path(vault_path)
    out: list[str] = []
    for doc in db.list_documents():
        path = doc["path"].replace("\\", "/")
        lower = path.lower()
        if not lower.endswith(BINARY_EXTS):
            continue
        if not _vault_file_exists(vault, path):
            continue
        abs_path = vault / path.replace("/", os.sep)
        conv = converted_dir(source_dir_for_path(vault, abs_path)) / f"{abs_path.stem}.md"
        try:
            if not conv.is_file() or conv.stat().st_size < 32:
                continue
        except OSError:
            continue
        h = doc.get("content_hash") or ""
        if entity_needs_extract(vault_path, path, h):
            out.append(path)
    return sorted(out)


def scan_entity_state_orphan_keys(vault_path: str) -> list[str]:
    vault = Path(vault_path)
    stale: list[str] = []
    for key in load_entity_state(vault_path):
        if not _vault_file_exists(vault, key):
            stale.append(key)
    return sorted(stale)


def _read_entity_frontmatter(entity_path: Path) -> dict:
    try:
        raw = entity_path.read_text(encoding="utf-8")
        return read_frontmatter(raw) or {}
    except OSError:
        return {}


def scan_entity_source_health(vault_path: str, db) -> tuple[list[dict], list[dict]]:
    """返回 (entity_stale_sources, orphan_entities)。"""
    vault = Path(vault_path)
    ed = entities_dir(vault)
    stale_sources: list[dict] = []
    orphans: list[dict] = []

    if not ed.is_dir():
        return stale_sources, orphans

    for fp in sorted(ed.glob("*.md")):
        rel_entity = str(fp.relative_to(vault)).replace("\\", "/")
        fm = _read_entity_frontmatter(fp)
        status = str(fm.get("status") or "").strip().lower()
        sources = _parse_source_names(fm)
        title = str(fm.get("title") or fp.stem).strip('"').strip("'")

        if not sources:
            if status in _MANUAL_KEEP_STATUSES:
                continue
            orphans.append({
                "entity_path": rel_entity,
                "title": title,
                "dead_sources": [],
                "reason": "empty_sources",
            })
            continue

        live: list[dict] = []
        dead: list[str] = []
        for src in sources:
            alive, reason = resolve_source_alive(vault_path, db, src)
            if alive:
                live.append({"name": src, "reason": reason})
            else:
                dead.append(src)

        if not live:
            orphans.append({
                "entity_path": rel_entity,
                "title": title,
                "dead_sources": dead,
                "reason": "all_sources_dead",
            })
        elif dead:
            stale_sources.append({
                "entity_path": rel_entity,
                "title": title,
                "dead_sources": dead,
                "live_sources": [x["name"] for x in live],
            })

    return stale_sources, orphans


def scan_entity_health(vault_path: str, db) -> dict:
    """完整实体健康扫描（零 LLM）。"""
    missing_md = scan_missing_entity_extract_md(vault_path, db)
    missing_bin = scan_missing_entity_extract_binary(vault_path, db)
    stale_sources, orphans = scan_entity_source_health(vault_path, db)
    state_orphans = scan_entity_state_orphan_keys(vault_path)

    return {
        "missing_entity_extract_md": missing_md,
        "missing_entity_extract_binary": missing_bin,
        "missing_entity_extract_count": len(missing_md) + len(missing_bin),
        "entity_stale_sources": stale_sources,
        "entity_stale_sources_count": len(stale_sources),
        "orphan_entities": orphans,
        "orphan_entities_count": len(orphans),
        "entity_state_orphan_keys": state_orphans,
    }
