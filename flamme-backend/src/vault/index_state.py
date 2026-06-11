"""图谱 / Topic 增量状态 — 内容指纹去重，避免无变更时全量重建"""

import hashlib
import json
from datetime import datetime
from pathlib import Path

from src.tools.sync import scan_all_md, content_hash


def _wiki_dir(vault_path: str) -> Path:
    return Path(vault_path) / ".wiki"


def graph_fingerprint(vault_path: str) -> str:
    """对所有参与图谱的 .md 文件（含 entities/topics）计算内容指纹"""
    vault = Path(vault_path)
    parts: list[str] = []
    for relpath in scan_all_md(vault_path):
        if relpath.endswith(".excalidraw.md"):
            continue
        fp = vault / relpath.replace("/", "\\") if "\\" in relpath else vault / relpath
        try:
            raw = fp.read_text(encoding="utf-8")
        except OSError:
            continue
        parts.append(f"{relpath}:{content_hash(raw)}")
    payload = "\n".join(sorted(parts))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def load_graph_state(vault_path: str) -> dict:
    p = _wiki_dir(vault_path) / "graph_state.json"
    if not p.exists():
        return {}
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def save_graph_state(vault_path: str, fingerprint: str) -> None:
    p = _wiki_dir(vault_path) / "graph_state.json"
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(
        json.dumps(
            {"fingerprint": fingerprint, "updated_at": datetime.now().isoformat()},
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )


def load_topic_state(vault_path: str) -> dict:
    p = _wiki_dir(vault_path) / "topic_state.json"
    if not p.exists():
        return {}
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
        return data.get("communities", data) if isinstance(data, dict) else {}
    except (json.JSONDecodeError, OSError):
        return {}


def save_topic_state(vault_path: str, communities: dict) -> None:
    p = _wiki_dir(vault_path) / "topic_state.json"
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(
        json.dumps(
            {"communities": communities, "updated_at": datetime.now().isoformat()},
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )



def needs_graph_rebuild(
    vault_path: str,
    *,
    force: bool = False,
) -> tuple[bool, str, str]:
    """返回 (是否重建, 当前指纹, 原因)"""
    fp = graph_fingerprint(vault_path)
    if force:
        return True, fp, "force"
    prev = load_graph_state(vault_path).get("fingerprint")
    if prev and prev == fp:
        return False, fp, "unchanged"
    if prev:
        return True, fp, "content_changed"
    return True, fp, "initial"


def load_entity_state(vault_path: str) -> dict[str, dict]:
    """源文档路径 → {content_hash, entity_count, updated_at}"""
    p = _wiki_dir(vault_path) / "entity_state.json"
    if not p.exists():
        return {}
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            return {}
        return {str(k): v for k, v in data.items() if not str(k).startswith("_") and isinstance(v, dict)}
    except (json.JSONDecodeError, OSError):
        return {}


def save_entity_state_entry(
    vault_path: str,
    relpath: str,
    content_hash: str,
    entity_count: int,
) -> None:
    p = _wiki_dir(vault_path) / "entity_state.json"
    p.parent.mkdir(parents=True, exist_ok=True)
    state = load_entity_state(vault_path)
    state[relpath.replace("\\", "/")] = {
        "content_hash": content_hash,
        "entity_count": entity_count,
        "updated_at": datetime.now().isoformat(),
    }
    p.write_text(
        json.dumps(state, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def entity_needs_extract(
    vault_path: str,
    relpath: str,
    content_hash: str,
    *,
    force: bool = False,
) -> bool:
    if force or not content_hash:
        return True
    key = relpath.replace("\\", "/")
    prev = load_entity_state(vault_path).get(key, {})
    return prev.get("content_hash") != content_hash
