"""活动路由 — 热力图与知识概览（仪表盘只读）"""

import json
import re
from collections import defaultdict
from contextlib import contextmanager
from datetime import date, datetime, timedelta
from pathlib import Path

from fastapi import APIRouter, Query, Request

from src.api.deps import get_vault_context
from src.api.runtime import build_db
from src.db.graph_store import GraphStore
from src.scripts.llm_utils import read_frontmatter, strip_frontmatter
from src.scripts.topic_builder import bridge_analysis, _load_topic_map as _tb_load_topic_map

router = APIRouter(prefix="/activity")


_WIKILINK_RE = re.compile(r"\[\[([^\]|]+?)(?:\|[^\]]+?)?\]\]")


def _strip_wikilink(s: str) -> str:
    m = _WIKILINK_RE.match(s.strip())
    return m.group(1).strip() if m else s.strip().strip('"').strip("'")


@contextmanager
def _db_ctx(request: Request):
    ctx = get_vault_context(request)
    db = build_db(ctx.config)
    try:
        yield db
    finally:
        db.close()


def _parse_day(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).date()
    except ValueError:
        try:
            return date.fromisoformat(value[:10])
        except ValueError:
            return None


def _build_daily_counts(db, since: date) -> dict[str, dict[str, int]]:
    """按日聚合 documents.updated_at 与 conversations.created_at"""
    since_str = since.isoformat()
    daily: dict[str, dict[str, int]] = defaultdict(lambda: {"documents": 0, "chats": 0})

    for row in db._conn.execute(
        "SELECT updated_at FROM documents WHERE updated_at IS NOT NULL"
    ).fetchall():
        d = _parse_day(row["updated_at"])
        if d and d >= since:
            key = d.isoformat()
            daily[key]["documents"] += 1

    for row in db._conn.execute(
        "SELECT created_at FROM conversations WHERE created_at IS NOT NULL"
    ).fetchall():
        d = _parse_day(row["created_at"])
        if d and d >= since:
            key = d.isoformat()
            daily[key]["chats"] += 1

    return daily


def _heatmap_entries(daily: dict[str, dict[str, int]]) -> list[dict]:
    return [
        {
            "date": day,
            "count": v["documents"] + v["chats"],
            "details": {"documents": v["documents"], "chats": v["chats"]},
        }
        for day, v in sorted(daily.items())
    ]


def _streak_and_week(daily: dict[str, dict[str, int]]) -> tuple[int, int]:
    today = date.today()
    streak = 0
    d = today
    while True:
        bucket = daily.get(d.isoformat(), {})
        if bucket.get("documents", 0) + bucket.get("chats", 0) > 0:
            streak += 1
            d -= timedelta(days=1)
        else:
            break

    week_total = 0
    for i in range(7):
        key = (today - timedelta(days=i)).isoformat()
        bucket = daily.get(key, {})
        week_total += bucket.get("documents", 0) + bucket.get("chats", 0)
    return streak, week_total


def _load_topic_map(vault_path: str) -> dict[str, str]:
    return _tb_load_topic_map(Path(vault_path))


def _read_topic_meta(vault_path: str, rel_path: str) -> dict:
    fp = Path(vault_path) / rel_path.replace("/", "\\") if "\\" in rel_path else Path(vault_path) / rel_path
    if not fp.exists():
        return {}
    try:
        raw = fp.read_text(encoding="utf-8")
        fm = read_frontmatter(raw) or {}
        entities = [_strip_wikilink(x) for x in (fm.get("entities") or [])]
        related = [_strip_wikilink(x) for x in (fm.get("related_topics") or [])]
        title = fm.get("title") or fp.stem
        if isinstance(title, str):
            title = title.strip('"').strip("'")
        body = strip_frontmatter(raw)
        summary_snippet = ""
        in_overview = False
        for line in body.splitlines():
            s = line.strip()
            if s == "## 概述":
                in_overview = True
                continue
            if in_overview and s.startswith("##"):
                break
            if in_overview and s and not s.startswith("#"):
                summary_snippet = (summary_snippet + " " + s).strip()
                if len(summary_snippet) >= 120:
                    break
        if len(summary_snippet) > 120:
            summary_snippet = summary_snippet[:117] + "…"
        related_cids = fm.get("related_community_ids") or []
        related_paths = fm.get("related_paths") or []
        return {
            "title": title,
            "hub_entity": fm.get("hub_entity", ""),
            "entities": entities,
            "related_topics": related,
            "summary_snippet": summary_snippet,
            "related_community_ids": related_cids,
            "related_paths": related_paths,
        }
    except OSError:
        return {}


def _top_entities_by_degree(conn, community_id: int, limit: int = 6) -> list[str]:
    rows = conn.execute(
        """
        SELECT e.name,
               (SELECT COUNT(*) FROM relations r
                WHERE r.source_entity = e.id OR r.target_entity = e.id) AS degree
        FROM entities e
        WHERE e.community = ? AND e.type IN ('entity', 'concept')
        ORDER BY degree DESC
        LIMIT ?
        """,
        (community_id, limit),
    ).fetchall()
    return [r["name"] for r in rows]


def _resolve_domain_title(
    cid: int,
    topic_map: dict[str, str],
    vault_path: str,
    meta: dict,
    conn,
) -> str:
    if meta.get("title"):
        return meta["title"]
    path = topic_map.get(str(cid))
    if path:
        row_title = _read_topic_meta(vault_path, path).get("title")
        if row_title:
            return row_title
    row = conn.execute(
        """
        SELECT e.name,
               (SELECT COUNT(*) FROM relations r
                WHERE r.source_entity = e.id OR r.target_entity = e.id) AS degree
        FROM entities e
        WHERE e.community = ?
        ORDER BY degree DESC
        LIMIT 1
        """,
        (cid,),
    ).fetchone()
    return row["name"] if row else f"社区 {cid}"


def _related_domains_for_community(
    conn,
    vault_path: str,
    community_id: int,
    topic_map: dict[str, str],
    title_cache: dict[str, str],
) -> list[dict]:
    names = {
        r["name"]
        for r in conn.execute(
            "SELECT name FROM entities WHERE community = ? AND type IN ('entity', 'concept')",
            (community_id,),
        ).fetchall()
    }
    bridges = bridge_analysis(conn, community_id, names)
    out = []
    for b in bridges[:5]:
        other = int(b["community_id"])
        key = str(other)
        title = title_cache.get(key)
        path = topic_map.get(key)
        if not title:
            if path:
                title = _read_topic_meta(vault_path, path).get("title") or ""
            if title:
                title_cache[key] = title
        if not title:
            title = b.get("topic_hint") or f"社区 {other}"
        insight = ""
        if b.get("bridge_entities"):
            ents = ", ".join(b["bridge_entities"][:3])
            insight = f"通过 {ents} 等与「{title}」相连"
        out.append({
            "community_id": other,
            "name": title,
            "topic_path": path,
            "bridge_entities": b.get("bridge_entities") or [],
            "weight": b.get("weight", 0),
            "insight": insight,
        })
    return out


def _collect_domain_links(conn, vault_path: str, communities: list[dict]) -> list[dict]:
    topic_map = _load_topic_map(vault_path)
    title_cache: dict[str, str] = {}
    for cid_str, path in topic_map.items():
        t = _read_topic_meta(vault_path, path).get("title")
        if t:
            title_cache[cid_str] = t

    topic_cids = {cid for cid, _ in _iter_topic_communities(vault_path, topic_map)}

    seen: set[tuple[int, int]] = set()
    links: list[dict] = []
    for cid in sorted(topic_cids):
        for rd in _related_domains_for_community(conn, vault_path, cid, topic_map, title_cache):
            other = rd["community_id"]
            if other not in topic_cids:
                continue
            pair = (min(cid, other), max(cid, other))
            if pair in seen:
                continue
            seen.add(pair)
            links.append({
                "source_cid": cid,
                "source_name": title_cache.get(str(cid)) or _resolve_domain_title(
                    cid, topic_map, vault_path, {}, conn,
                ),
                "target_cid": other,
                "target_name": rd["name"],
                "source_topic_path": topic_map.get(str(cid)),
                "target_topic_path": rd.get("topic_path"),
                "weight": rd.get("weight", 0),
                "bridge_entities": rd.get("bridge_entities") or [],
                "insight": rd.get("insight"),
            })
    links.sort(key=lambda x: x.get("weight", 0), reverse=True)
    return links[:15]


def _bridge_count(conn, community_id: int) -> int:
    row = conn.execute(
        """
        SELECT COUNT(*) AS c FROM relations r
        JOIN entities e1 ON r.source_entity = e1.id
        JOIN entities e2 ON r.target_entity = e2.id
        WHERE (e1.community = ? OR e2.community = ?)
          AND e1.community != e2.community
          AND e1.community >= 0 AND e2.community >= 0
        """,
        (community_id, community_id),
    ).fetchone()
    return row["c"] if row else 0


def _iter_topic_communities(
    vault_path: str,
    topic_map: dict[str, str],
) -> list[tuple[int, str]]:
    """仅返回已生成 topic 页且文件存在的社区（标题/路径列表不算 topic）。"""
    out: list[tuple[int, str]] = []
    root = Path(vault_path)
    for cid_str, rel_path in topic_map.items():
        if cid_str.startswith("_") or not rel_path:
            continue
        try:
            cid = int(cid_str)
        except ValueError:
            continue
        fp = root / rel_path.replace("\\", "/")
        if fp.is_file():
            out.append((cid, rel_path))
    return out


def _domains(graph: GraphStore, vault_path: str) -> list[dict]:
    topic_map = _load_topic_map(vault_path)
    title_cache: dict[str, str] = {}
    for cid_str, path in topic_map.items():
        t = _read_topic_meta(vault_path, path).get("title")
        if t:
            title_cache[cid_str] = t

    domains = []
    conn = graph._conn
    for cid, topic_path in _iter_topic_communities(vault_path, topic_map):
        meta = _read_topic_meta(vault_path, topic_path)
        name = meta.get("title") or title_cache.get(str(cid)) or ""
        if not name:
            continue
        title_cache[str(cid)] = name

        entities = meta.get("entities") or []
        if entities:
            entity_count = len(entities)
            display_entities = entities[:8]
        else:
            size_row = conn.execute(
                "SELECT COUNT(*) AS c FROM entities WHERE community = ?",
                (cid,),
            ).fetchone()
            entity_count = size_row["c"] if size_row else 0
            display_entities = _top_entities_by_degree(conn, cid, 6)

        domains.append({
            "name": name,
            "entity_count": entity_count,
            "community_id": cid,
            "topic_path": topic_path,
            "hub_entity": meta.get("hub_entity") or None,
            "entities": display_entities,
            "related_topics": (meta.get("related_topics") or [])[:6],
            "summary_snippet": meta.get("summary_snippet") or "",
            "related_domains": _related_domains_for_community(
                conn, vault_path, cid, topic_map, title_cache,
            ),
            "bridge_count": _bridge_count(conn, cid),
        })
    domains.sort(key=lambda x: x["entity_count"], reverse=True)
    return domains


def _top_tags(conn) -> list[dict]:
    rows = conn.execute(
        """
        SELECT t.name, COUNT(*) AS c
        FROM tags t
        JOIN document_tags dt ON t.id = dt.tag_id
        GROUP BY t.id
        ORDER BY c DESC
        LIMIT 10
        """
    ).fetchall()
    return [{"name": r["name"], "count": r["c"]} for r in rows]


def _folders(conn) -> list[dict]:
    counts: dict[str, int] = defaultdict(int)
    for row in conn.execute("SELECT path FROM documents").fetchall():
        path = (row["path"] or "").replace("\\", "/")
        parts = path.split("/")
        if len(parts) > 1:
            counts[parts[0]] += 1
    items = [{"name": k, "count": v} for k, v in counts.items()]
    items.sort(key=lambda x: x["count"], reverse=True)
    return items


@router.get("/heatmap")
def get_heatmap(request: Request, days: int = Query(365, ge=1, le=730)):
    since = date.today() - timedelta(days=days - 1)
    with _db_ctx(request) as db:
        daily = _build_daily_counts(db, since)
        return _heatmap_entries(daily)


@router.get("/domain-links")
def get_domain_links(request: Request):
    ctx = get_vault_context(request)
    with _db_ctx(request) as db:
        graph = GraphStore(db._conn)
        overview = graph.get_community()
        communities = overview.get("communities", [])
        links = _collect_domain_links(db._conn, ctx.config.vault_path, communities)
        return {"links": links}


@router.get("/overview")
def get_overview(request: Request):
    ctx = get_vault_context(request)
    with _db_ctx(request) as db:
        since = date.today() - timedelta(days=365)
        daily = _build_daily_counts(db, since)
        streak, week_activity = _streak_and_week(daily)

        graph = GraphStore(db._conn)
        entity_count = db._conn.execute("SELECT COUNT(*) AS c FROM entities").fetchone()["c"]
        relation_count = db._conn.execute("SELECT COUNT(*) AS c FROM relations").fetchone()["c"]
        doc_count = db._conn.execute("SELECT COUNT(*) AS c FROM documents").fetchone()["c"]

        return {
            "domains": _domains(graph, ctx.config.vault_path),
            "top_tags": _top_tags(db._conn),
            "folders": _folders(db._conn),
            "total_docs": doc_count,
            "total_entities": entity_count,
            "total_relations": relation_count,
            "streak": streak,
            "week_activity": week_activity,
        }
