"""实体维护 — 修剪失效 sources、删除孤儿实体、清理 entity_state（零 LLM）"""

from __future__ import annotations

import json
import logging
from pathlib import Path

from src.scripts.entity_builder import _parse_source_names
from src.scripts.llm_utils import read_frontmatter, strip_frontmatter
from src.vault.entity_health import scan_entity_health
from src.vault.index_state import load_entity_state

logger = logging.getLogger(__name__)

def _wiki_dir(vault_path: str) -> Path:
    return Path(vault_path) / ".wiki"


def cleanup_entity_state(vault_path: str, removed_keys: list[str]) -> list[str]:
    """从 entity_state.json 移除已删源路径 key。"""
    if not removed_keys:
        return []
    p = _wiki_dir(vault_path) / "entity_state.json"
    if not p.exists():
        return []
    try:
        state = load_entity_state(vault_path)
    except Exception:
        return []
    cleaned: list[str] = []
    for key in removed_keys:
        norm = key.replace("\\", "/")
        if norm in state:
            del state[norm]
            cleaned.append(norm)
    if cleaned:
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    return cleaned


def _format_frontmatter_value(key: str, val) -> list[str]:
    if key == "sources":
        names = _parse_source_names({key: val}) if val else []
        if not names:
            return ["sources: []"]
        lines = ["sources:"]
        for name in names:
            lines.append(f'  - "[[{name}]]"')
        return lines
    if isinstance(val, list):
        lines = [f"{key}:"]
        for item in val:
            lines.append(f'  - "{item}"')
        return lines
    if isinstance(val, str) and (" " in val or ":" in val):
        return [f'{key}: "{val}"']
    return [f"{key}: {val}"]


def _render_frontmatter(fm: dict) -> str:
    lines: list[str] = []
    for key, val in fm.items():
        lines.extend(_format_frontmatter_value(key, val))
    return "---\n" + "\n".join(lines) + "\n---\n"


def _remove_sources_from_frontmatter(raw: str, dead_sources: set[str]) -> str:
    if not raw.startswith("---"):
        return raw
    end = raw.find("---", 3)
    if end < 0:
        return raw
    fm = read_frontmatter(raw) or {}
    body = strip_frontmatter(raw)
    sources = _parse_source_names(fm)
    kept = [s for s in sources if s not in dead_sources]
    if kept:
        fm["sources"] = [f"[[{s}]]" for s in kept]
    else:
        fm["sources"] = []
    return _render_frontmatter(fm) + body


def prune_stale_sources(vault_path: str, stale_items: list[dict]) -> dict:
    vault = Path(vault_path)
    pruned: list[str] = []
    newly_orphaned: list[dict] = []
    errors: list[dict] = []

    for item in stale_items:
        rel = item.get("entity_path", "")
        fp = vault / rel.replace("/", "\\") if "\\" in rel else vault / rel
        if not fp.is_file():
            continue
        dead = set(item.get("dead_sources") or [])
        try:
            raw = fp.read_text(encoding="utf-8")
            new_raw = _remove_sources_from_frontmatter(raw, dead)
            fm = read_frontmatter(new_raw) or {}
            remaining = _parse_source_names(fm)
            fp.write_text(new_raw, encoding="utf-8")
            pruned.append(rel)
            if not remaining:
                newly_orphaned.append({
                    "entity_path": rel,
                    "title": item.get("title") or fp.stem,
                    "dead_sources": list(dead),
                    "reason": "sources_pruned_empty",
                })
        except OSError as e:
            errors.append({"entity_path": rel, "error": str(e)})

    return {"pruned": pruned, "newly_orphaned": newly_orphaned, "errors": errors}


def delete_orphan_entities(vault_path: str, orphans: list[dict]) -> dict:
    vault = Path(vault_path)
    deleted: list[str] = []
    errors: list[dict] = []

    for item in orphans:
        rel = item.get("entity_path", "")
        fp = vault / rel.replace("/", "\\") if "\\" in rel else vault / rel
        if not fp.is_file():
            continue
        try:
            fp.unlink()
            deleted.append(rel)
            logger.info("entity_maintain: deleted orphan %s", rel)
        except OSError as e:
            errors.append({"entity_path": rel, "error": str(e)})

    return {"deleted": deleted, "errors": errors}


def run_entity_maintain(vault_path: str, db, scan: dict | None = None) -> dict:
    """修剪失效 sources + 删除孤儿实体 + 清理 entity_state。"""
    if scan is None:
        scan = scan_entity_health(vault_path, db)

    state_keys = list(scan.get("entity_state_orphan_keys") or [])
    cleaned_state = cleanup_entity_state(vault_path, state_keys)

    prune_result = prune_stale_sources(vault_path, scan.get("entity_stale_sources") or [])
    orphans = list(scan.get("orphan_entities") or [])
    orphans.extend(prune_result.get("newly_orphaned") or [])

    delete_result = delete_orphan_entities(vault_path, orphans)

    return {
        "state_cleaned": cleaned_state,
        "pruned_entities": prune_result.get("pruned", []),
        "deleted_entities": delete_result.get("deleted", []),
        "errors": prune_result.get("errors", []) + delete_result.get("errors", []),
    }
