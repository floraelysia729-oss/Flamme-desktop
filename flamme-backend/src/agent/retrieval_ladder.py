"""四层检索 ladder：L1 直读 → L2 搜索 → EvidencePack"""

from __future__ import annotations

import json
import re
from typing import Any

from pathlib import Path

from src.agent.context_manager import extract_excerpt, merge_evidence_pack
from src.agent.context_types import EvidenceItem
from src.tools.paths import converted_relpath_for_binary

_BINARY_SUFFIXES = (".pdf", ".doc", ".docx", ".ppt", ".pptx")


def resolve_mentioned_paths(
    user_input: str,
    vault_paths: list[str],
    selected: list[str] | None,
) -> list[str]:
    """从用户消息与选中文件解析直属路径"""
    found: list[str] = []
    norm_input = user_input.replace("\\", "/").lower()
    for p in vault_paths:
        norm = p.replace("\\", "/")
        base = norm.split("/")[-1].lower()
        if base and base in norm_input:
            found.append(norm)
        elif norm.lower() in norm_input:
            found.append(norm)
    if selected:
        for s in selected:
            n = s.replace("\\", "/")
            if n not in found:
                found.append(n)
    return found[:8]


def _is_unconverted_placeholder(content: str) -> bool:
    return content.startswith("[文件") and "尚无 converted" in content


def _read_page_tool(tool_registry, path: str, vault_path: str = "") -> dict | None:
    tool = tool_registry.get("wiki_read_page") if tool_registry else None
    if not tool:
        return None
    from src.tools.interfaces import ToolResult

    candidates = [path]
    if vault_path and path.lower().endswith(_BINARY_SUFFIXES):
        conv = converted_relpath_for_binary(Path(vault_path), path)
        if conv and conv not in candidates:
            candidates.insert(0, conv)

    for read_path in candidates:
        result = tool.execute({"path": read_path})
        if not isinstance(result, ToolResult):
            if isinstance(result, dict):
                return result
            continue
        if result.is_error:
            continue
        data = result.data if isinstance(result.data, dict) else None
        if not data:
            continue
        content = data.get("content", "") or ""
        if _is_unconverted_placeholder(content):
            continue
        if read_path != path:
            data = {**data, "path": path, "converted_path": read_path}
        return data
    return None


def _search_tool(tool_registry, query: str, scope: set[str] | None, mode: str) -> list[dict]:
    tool = tool_registry.get("wiki_search") if tool_registry else None
    if not tool:
        return []
    from src.tools.interfaces import ToolResult
    result = tool.execute({"query": query, "top_k": 5})
    if isinstance(result, ToolResult):
        if result.is_error:
            return []
        data = result.data if isinstance(result.data, dict) else {}
    else:
        data = result if isinstance(result, dict) else {}
    entries = data.get("results") or []
    if scope and mode == "learn":
        filtered = [e for e in entries if e.get("path", "") in scope]
        return filtered  # learn 不回退全量
    return entries


def evidence_from_read(data: dict, turn_id: int = 0) -> EvidenceItem | None:
    path = data.get("path", "")
    if not path:
        return None
    content = data.get("content", "") or ""
    return EvidenceItem(
        path=path,
        title=data.get("title", path),
        excerpt=extract_excerpt(content),
        content_hash="",
        tool="wiki_read_page",
        turn_id=turn_id,
    )


def run_prefetch(
    paths: list[str],
    tool_registry,
    turn_id: int = 0,
    vault_path: str = "",
) -> list[EvidenceItem]:
    items: list[EvidenceItem] = []
    seen: set[str] = set()
    for path in paths:
        norm = path.replace("\\", "/")
        if norm.lower().endswith(_BINARY_SUFFIXES) and vault_path:
            conv = converted_relpath_for_binary(Path(vault_path), norm)
            if conv and conv in seen:
                continue
        if norm in seen:
            continue
        seen.add(norm)
        data = _read_page_tool(tool_registry, path, vault_path)
        if data:
            content = data.get("content", "") or ""
            if _is_unconverted_placeholder(content):
                continue
            ev = evidence_from_read(data, turn_id)
            if ev:
                items.append(ev)
    return items


def run_scoped_search(
    query: str,
    scope: set[str] | None,
    mode: str,
    tool_registry,
    turn_id: int = 0,
    vault_path: str = "",
) -> list[EvidenceItem]:
    entries = _search_tool(tool_registry, query, scope, mode)
    items: list[EvidenceItem] = []
    for e in entries[:3]:
        path = e.get("path", "")
        if not path:
            continue
        data = _read_page_tool(tool_registry, path, vault_path)
        if data:
            content = data.get("content", "") or ""
            if _is_unconverted_placeholder(content):
                continue
            ev = evidence_from_read(data, turn_id)
            if ev:
                items.append(ev)
        else:
            items.append(EvidenceItem(
                path=path,
                title=e.get("title", path),
                excerpt=f"检索命中 score={e.get('score', '')}",
                tool="wiki_search",
                turn_id=turn_id,
            ))
    return items


def run_ladder(
    user_input: str,
    mode: str,
    selected_files: list[str] | None,
    vault_file_list: list[str],
    tool_registry,
    existing_pack: list[EvidenceItem],
    turn_id: int = 0,
    vault_path: str = "",
) -> tuple[list[EvidenceItem], str]:
    """
    执行 L1→L2，返回合并后的 EvidencePack 与 coverage 标记。
    """
    scope: set[str] | None = None
    if selected_files and mode == "learn":
        scope = set()
        for f in selected_files:
            f_norm = f.replace("\\", "/")
            scope.add(f_norm)
            parts = f_norm.rsplit("/", 1)
            if len(parts) == 2:
                dir_part, file_part = parts
                stem = file_part.rsplit(".", 1)[0] if "." in file_part else file_part
                scope.add(f"{dir_part}/.flamme/converted/{stem}.md")

    paths = resolve_mentioned_paths(user_input, vault_file_list, selected_files)
    if vault_path:
        vault_p = Path(vault_path)
        expanded: list[str] = []
        for p in paths:
            norm = p.replace("\\", "/")
            if norm not in expanded:
                expanded.append(norm)
            conv = converted_relpath_for_binary(vault_p, norm)
            if conv and conv not in expanded:
                expanded.append(conv)
        paths = expanded
    l1 = run_prefetch(paths, tool_registry, turn_id, vault_path)
    pack = merge_evidence_pack(existing_pack, l1)

    coverage = "sufficient" if pack else "unknown"
    if len(pack) < 2 and user_input.strip():
        l2 = run_scoped_search(user_input[:200], scope, mode, tool_registry, turn_id, vault_path)
        pack = merge_evidence_pack(pack, l2)
    if not pack:
        coverage = "insufficient"
    elif len(pack) < 2:
        coverage = "partial"

    return pack, coverage
