"""Topic Builder — Leiden 社区 → vault/topics/*.md + .wiki/topic_map.json

每个 community_id 对应一篇 topic hub 页；支持小社区合并、领域级命名与跨主题链接解析。
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
from collections import defaultdict
from datetime import date
from pathlib import Path

import yaml

from src.tools.paths import topics_dir
from src.vault.index_state import load_topic_state, save_topic_state
from src.scripts.llm_utils import get_client, call_llm, strip_frontmatter, read_frontmatter

logger = logging.getLogger(__name__)

_ILLEGAL_FILENAME_CHARS = re.compile(r'[<>:"/\\|?*]')
_TOP_K_NEIGHBORS = 5
_TOP_ENTITIES_IN_BODY = 12
_TOP_ENTITIES_FOR_LLM = 25
_DEFAULT_MIN_COMMUNITY_SIZE = 3

TOPIC_SYSTEM_PROMPT = """你是知识管理助手。基于社区实体摘要与跨社区桥接事实，编写**领域级**主题综述（不是单个实体词条）。

规则：
1. 输出严格 JSON，不含 markdown 代码块
2. 格式:
{
  "title": "...",
  "summary": "...",
  "key_themes": ["...", "..."],
  "entity_groups": [{"label": "子主题名", "entities": ["实体名1", "实体名2"]}],
  "related_topics": [{"community_id": 数字, "insight": "一句话说明两领域如何关联"}]
}
3. title: 4-12 字的**领域名**（如「机器学习基础」「线性代数」），禁止直接使用单个实体名作为标题
4. summary: 2-4 句，说明该领域在知识库中的范围与核心问题；必须基于提供的实体摘要与桥接事实，禁止编造
5. key_themes: 3-6 个子主题短语
6. entity_groups: 2-4 组，将给定实体名（必须来自成员列表）按子主题归类；每组 2-8 个实体
7. related_topics: 仅针对用户消息里列出的「邻社区」；community_id 必须与列表一致；insight 必填（说明跨领域联系）；不要编造 bridge_entities
8. 若信息不足，summary 仍要基于实体列表做保守归纳"""


def _safe_filename(name: str) -> str:
    return _ILLEGAL_FILENAME_CHARS.sub("_", name).strip() or "topic"


def _topic_map_path(vault_path: Path) -> Path:
    return vault_path / ".wiki" / "topic_map.json"


def _load_topic_map(vault_path: Path) -> dict[str, str]:
    p = _topic_map_path(vault_path)
    if not p.exists():
        return {}
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
        return {str(k): v for k, v in data.items() if not str(k).startswith("_")}
    except (json.JSONDecodeError, OSError):
        return {}


def _save_topic_map(vault_path: Path, mapping: dict[str, str], orphaned: list[str] | None = None) -> None:
    p = _topic_map_path(vault_path)
    p.parent.mkdir(parents=True, exist_ok=True)
    out = dict(mapping)
    if orphaned:
        out["_orphaned"] = orphaned
    p.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")


def _read_topic_title(vault: Path, rel_path: str) -> str:
    fp = vault / rel_path.replace("\\", "/")
    if not fp.exists():
        return ""
    try:
        raw = fp.read_text(encoding="utf-8")
        fm = read_frontmatter(raw) or {}
        title = fm.get("title") or fp.stem
        return str(title).strip('"').strip("'").strip()
    except OSError:
        return ""


def _build_cid_title_cache(vault: Path, cid_to_path: dict[str, str]) -> dict[str, str]:
    cache: dict[str, str] = {}
    for cid, path in cid_to_path.items():
        title = _read_topic_title(vault, path)
        if title:
            cache[cid] = title
    return cache


def _entity_summary(vault_path: Path, entity: dict) -> str:
    """优先 entity frontmatter summary/key_points，再回退正文首段"""
    wiki_path = entity.get("entity_file") or entity.get("wiki_path") or ""
    if not wiki_path:
        name = entity.get("name", "")
        wiki_path = f"entities/{name}.md"
    fp = vault_path / wiki_path.replace("\\", "/")
    if not fp.exists():
        name = entity.get("name", "")
        for p in vault_path.rglob(f"{name}.md"):
            if "entities" in p.parts:
                fp = p
                break
    if fp.exists():
        try:
            raw = fp.read_text(encoding="utf-8")
            fm = read_frontmatter(raw) or {}
            if fm.get("summary"):
                return str(fm["summary"])[:300]
            kps = fm.get("key_points") or []
            if kps:
                parts = [str(k)[:80] for k in kps[:3]]
                return "; ".join(parts)[:300]
            body = strip_frontmatter(raw)
            for line in body.splitlines():
                line = line.strip()
                if line and not line.startswith("#"):
                    return line[:300]
        except OSError:
            pass
    return ""


def _entity_degree(conn, entity_id: int) -> int:
    row = conn.execute(
        """
        SELECT COUNT(*) AS c FROM relations r
        WHERE r.source_entity = ? OR r.target_entity = ?
        """,
        (entity_id, entity_id),
    ).fetchone()
    return row["c"] if row else 0


def _hub_entity(conn, community_id: int) -> str | None:
    row = conn.execute(
        """
        SELECT e.name,
               (SELECT COUNT(*) FROM relations r
                WHERE r.source_entity = e.id OR r.target_entity = e.id) AS degree
        FROM entities e
        WHERE e.community = ? AND e.type IN ('entity', 'concept')
        ORDER BY degree DESC
        LIMIT 1
        """,
        (community_id,),
    ).fetchone()
    return row["name"] if row else None


def _community_members(conn, community_id: int) -> list[dict]:
    rows = conn.execute(
        """
        SELECT id, name, type, wiki_path, entity_file
        FROM entities
        WHERE community = ? AND type IN ('entity', 'concept')
        ORDER BY name
        """,
        (community_id,),
    ).fetchall()
    members = [dict(r) for r in rows]
    members.sort(key=lambda m: _entity_degree(conn, m["id"]), reverse=True)
    return members


def bridge_analysis(
    conn,
    community_id: int,
    member_names: set[str] | None = None,
) -> list[dict]:
    """跨社区边 → top-K 邻社区 + 桥接实体（供 topic_builder 与 activity API 复用）"""
    if member_names is None:
        rows = conn.execute(
            "SELECT name FROM entities WHERE community = ? AND type IN ('entity', 'concept')",
            (community_id,),
        ).fetchall()
        member_names = {r["name"] for r in rows}
    if not member_names:
        return []

    rows = conn.execute(
        """
        SELECT e1.community AS c1, e2.community AS c2, e1.name AS n1, e2.name AS n2
        FROM relations r
        JOIN entities e1 ON r.source_entity = e1.id
        JOIN entities e2 ON r.target_entity = e2.id
        WHERE (e1.community = ? OR e2.community = ?)
          AND e1.community != e2.community
          AND e1.community >= 0 AND e2.community >= 0
        """,
        (community_id, community_id),
    ).fetchall()

    agg: dict[int, dict] = defaultdict(lambda: {"weight": 0, "bridges": set()})
    for r in rows:
        c1, c2 = r["c1"], r["c2"]
        if c1 == community_id:
            other, local, remote = c2, r["n1"], r["n2"]
        elif c2 == community_id:
            other, local, remote = c1, r["n2"], r["n1"]
        else:
            continue
        agg[other]["weight"] += 1
        if local in member_names:
            agg[other]["bridges"].add(local)
        if remote in member_names:
            agg[other]["bridges"].add(remote)

    ranked = sorted(agg.items(), key=lambda x: x[1]["weight"], reverse=True)[:_TOP_K_NEIGHBORS]
    result = []
    for other_cid, info in ranked:
        result.append({
            "community_id": other_cid,
            "topic_hint": _hub_entity(conn, other_cid) or f"社区 {other_cid}",
            "weight": info["weight"],
            "bridge_entities": sorted(info["bridges"])[:8],
        })
    return result


def _merge_small_communities(conn, min_size: int = _DEFAULT_MIN_COMMUNITY_SIZE) -> list[int]:
    """将过小社区并入桥接权重最大的邻社区；返回被吸收的 community_id 列表"""
    merged_away: list[int] = []
    while True:
        rows = conn.execute(
            """
            SELECT community, COUNT(*) AS size
            FROM entities
            WHERE community >= 0 AND type IN ('entity', 'concept')
            GROUP BY community
            """
        ).fetchall()
        sizes = {r["community"]: r["size"] for r in rows}
        small = [c for c, s in sizes.items() if s < min_size]
        if not small:
            break

        cid = min(small, key=lambda c: sizes[c])
        names = {
            r["name"]
            for r in conn.execute(
                "SELECT name FROM entities WHERE community = ? AND type IN ('entity', 'concept')",
                (cid,),
            ).fetchall()
        }
        bridges = bridge_analysis(conn, cid, names)
        target = None
        for b in bridges:
            other = b["community_id"]
            if other != cid and sizes.get(other, 0) >= min_size:
                target = other
                break
        if target is None and bridges:
            target = bridges[0]["community_id"]
        if target is None:
            others = [c for c in sizes if c != cid]
            target = max(others, key=lambda c: sizes[c]) if others else None
        if target is None or target == cid:
            break

        conn.execute(
            "UPDATE entities SET community = ? WHERE community = ?",
            (target, cid),
        )
        merged_away.append(cid)
        logger.info("topic_builder: merged community %s -> %s", cid, target)

    return merged_away


def _resolve_neighbor_title(
    other_cid: int,
    bridge: dict,
    cid_to_path: dict[str, str],
    cid_to_title: dict[str, str],
    vault: Path,
) -> tuple[str, str | None]:
    key = str(other_cid)
    title = cid_to_title.get(key)
    path = cid_to_path.get(key)
    if not title and path:
        title = _read_topic_title(vault, path)
    if not title:
        title = bridge.get("topic_hint") or f"社区 {other_cid}"
    return title, path


def _enrich_related(
    bridges: list[dict],
    llm_related: list[dict],
    cid_to_path: dict[str, str],
    cid_to_title: dict[str, str],
    vault: Path,
) -> list[dict]:
    llm_by_cid: dict[int, dict] = {}
    for r in llm_related:
        if not isinstance(r, dict):
            continue
        cid_val = r.get("community_id")
        if cid_val is not None:
            try:
                llm_by_cid[int(cid_val)] = r
            except (TypeError, ValueError):
                pass

    enriched = []
    for b in bridges:
        other = int(b["community_id"])
        title, path = _resolve_neighbor_title(other, b, cid_to_path, cid_to_title, vault)
        llm_r = llm_by_cid.get(other, {})
        insight = str(llm_r.get("insight") or "").strip()
        if not insight:
            for r in llm_related:
                if not isinstance(r, dict):
                    continue
                hint = r.get("topic_hint") or r.get("title") or ""
                if hint == title or hint == b.get("topic_hint"):
                    insight = str(r.get("insight") or "").strip()
                    break
        if not insight and b.get("bridge_entities"):
            ents = ", ".join(b["bridge_entities"][:3])
            insight = f"通过 {ents} 等实体与「{title}」相连（{b.get('weight', 0)} 条跨社区关系）"

        enriched.append({
            "community_id": other,
            "title": title,
            "topic_path": path,
            "bridge_entities": b.get("bridge_entities") or [],
            "weight": b.get("weight", 0),
            "insight": insight,
        })
    return enriched


def _fallback_domain_title(hub: str, member_names: list[str], key_themes: list) -> str:
    if key_themes and isinstance(key_themes, list) and key_themes:
        first = str(key_themes[0]).strip()
        if first and first != hub and len(first) <= 12:
            return first
    if len(member_names) >= 2:
        return f"{member_names[0]}与{member_names[1]}"
    return f"{hub}及相关"


def _llm_compile(
    members: list[dict],
    summaries: dict[str, str],
    bridges: list[dict],
    hub_name: str,
    cid_to_title: dict[str, str],
    llm_model: str | None = None,
) -> dict | None:
    try:
        client = get_client()
    except SystemExit:
        return None
    except Exception as e:
        logger.warning("topic_builder: LLM client unavailable: %s", e)
        return None

    entity_lines = []
    for m in members[:_TOP_ENTITIES_FOR_LLM]:
        name = m["name"]
        s = summaries.get(name, "")
        entity_lines.append(f"- {name}: {s[:120]}" if s else f"- {name}")

    bridge_lines = []
    for b in bridges:
        other = b["community_id"]
        neighbor_title = cid_to_title.get(str(other)) or b.get("topic_hint") or f"社区 {other}"
        bridge_lines.append(
            f"- 邻社区 community_id={other}（领域「{neighbor_title}」）: "
            f"桥接实体 {', '.join((b.get('bridge_entities') or [])[:5])}, 边数 {b.get('weight', 0)}"
        )

    user_msg = (
        f"Hub 实体（勿直接用作 title）: {hub_name}\n\n"
        f"社区成员 ({len(members)} 个，按重要度排序):\n"
        + "\n".join(entity_lines)
        + "\n\n跨社区桥接事实:\n"
        + ("\n".join(bridge_lines) if bridge_lines else "（无跨社区边）")
    )

    try:
        raw = call_llm(
            client,
            [
                {"role": "system", "content": TOPIC_SYSTEM_PROMPT},
                {"role": "user", "content": user_msg},
            ],
            temperature=0.3,
            max_tokens=2048,
            model=llm_model,
        )
        text = raw.strip()
        if text.startswith("```"):
            text = re.sub(r"^```(?:json)?\s*", "", text)
            text = re.sub(r"\s*```$", "", text)
        return json.loads(text)
    except Exception as e:
        logger.warning("topic_builder LLM failed: %s", e)
        return None


def _wikilink(name: str) -> str:
    return f"[[{name}]]"


def _normalize_entity_groups(
    groups: list | None,
    member_names: list[str],
    hub: str,
) -> list[dict]:
    valid = set(member_names)
    out: list[dict] = []
    used: set[str] = set()
    if isinstance(groups, list):
        for g in groups:
            if not isinstance(g, dict):
                continue
            label = str(g.get("label") or "子主题").strip() or "子主题"
            ents = [str(e).strip() for e in (g.get("entities") or []) if str(e).strip() in valid]
            ents = [e for e in ents if e not in used]
            if ents:
                used.update(ents)
                out.append({"label": label, "entities": ents})
    remaining = [n for n in member_names if n not in used]
    if remaining:
        core = remaining[: max(1, len(remaining) // 2)]
        rest = [n for n in remaining if n not in core]
        if core:
            out.insert(0, {"label": "核心", "entities": core})
        if rest:
            out.append({"label": "相关", "entities": rest})
    if not out:
        out = [{"label": "核心", "entities": member_names[:8]}]
    return out


def _build_topic_md(
    title: str,
    community_id: int,
    hub_entity: str,
    members: list[str],
    summary: str,
    key_themes: list[str],
    entity_groups: list[dict],
    related: list[dict],
) -> str:
    today = date.today().isoformat()
    top_body = members[:_TOP_ENTITIES_IN_BODY]
    related_titles = [r["title"] for r in related if r.get("title")]
    related_cids = [r["community_id"] for r in related if r.get("community_id") is not None]
    related_paths = [r["topic_path"] for r in related if r.get("topic_path")]

    fm = {
        "title": title,
        "type": "topic",
        "community_id": community_id,
        "hub_entity": hub_entity,
        "entities": [_wikilink(n) for n in members],
        "related_topics": [_wikilink(t) for t in related_titles],
        "related_community_ids": related_cids,
        "tags": key_themes[:6] if isinstance(key_themes, list) else [],
        "status": "stable",
        "updated": today,
    }
    if related_paths:
        fm["related_paths"] = related_paths

    lines = ["---", yaml.dump(fm, allow_unicode=True, default_flow_style=False).strip(), "---", ""]
    lines.append(f"# {title}")
    lines.append("")
    lines.append("## 概述")
    lines.append("")
    lines.append(summary or f"本主题包含 {len(members)} 个核心实体。")
    lines.append("")

    if key_themes and isinstance(key_themes, list):
        lines.append("## 子主题")
        lines.append("")
        for theme in key_themes[:6]:
            lines.append(f"- {theme}")
        lines.append("")

    if entity_groups:
        lines.append("## 实体分组")
        lines.append("")
        for g in entity_groups:
            label = g.get("label") or "子主题"
            lines.append(f"### {label}")
            for n in g.get("entities") or []:
                lines.append(f"- {_wikilink(n)}")
            lines.append("")

    lines.append("## 核心实体")
    lines.append("")
    for n in top_body:
        lines.append(f"- {_wikilink(n)}")
    if len(members) > len(top_body):
        lines.append("")
        lines.append(f"*共 {len(members)} 个实体，完整列表见文首 frontmatter。*")
    lines.append("")

    if related:
        lines.append("## 关联主题")
        lines.append("")
        for r in related:
            t = r.get("title") or "相关主题"
            bridges = r.get("bridge_entities") or []
            insight = r.get("insight") or ""
            lines.append(f"### {_wikilink(t)}")
            if bridges:
                lines.append(f"- 桥接实体: {', '.join(_wikilink(b) for b in bridges)}")
            if insight:
                lines.append(f"- {insight}")
            lines.append("")

    return "\n".join(lines)


def _community_fingerprint(
    conn,
    vault: Path,
    community_id: int,
    member_names: list[str],
    bridges: list[dict],
    cid_to_path: dict[str, str],
    cid_to_title: dict[str, str],
) -> str:
    parts = [str(community_id)]
    for name in sorted(member_names):
        parts.append(name)
        row = conn.execute(
            "SELECT entity_file, wiki_path, content_hash FROM entities WHERE name = ?",
            (name,),
        ).fetchone()
        if row and row["content_hash"]:
            parts.append(row["content_hash"])
        else:
            fp = vault / "entities" / f"{name}.md"
            if not fp.exists():
                for p in vault.rglob(f"{name}.md"):
                    if "entities" in p.parts:
                        fp = p
                        break
            if fp.exists():
                try:
                    parts.append(hashlib.sha256(fp.read_bytes()).hexdigest()[:16])
                except OSError:
                    parts.append("0")
            else:
                parts.append("0")
    for b in sorted(bridges, key=lambda x: x.get("community_id", 0)):
        other = str(b.get("community_id"))
        parts.append(other)
        parts.append(cid_to_title.get(other) or b.get("topic_hint") or "")
        parts.append(",".join(sorted(b.get("bridge_entities") or [])))
        parts.append(str(b.get("weight", 0)))
    return hashlib.sha256("\n".join(parts).encode()).hexdigest()[:24]


def build_topics(
    vault_path: str,
    db,
    *,
    communities: dict | None = None,
    llm_model: str | None = None,
    incremental: bool = True,
    force: bool = False,
    min_community_size: int = _DEFAULT_MIN_COMMUNITY_SIZE,
    merge_small: bool = True,
) -> dict:
    """构建/更新 topic 页；incremental=True 时跳过指纹未变的社区"""
    vault = Path(vault_path)
    logger.info(
        "[TOPIC] build_topics vault=%s incremental=%s force=%s",
        vault_path,
        incremental,
        force,
    )
    conn = db._conn
    tdir = topics_dir(vault)
    topic_map = _load_topic_map(vault)
    cid_to_path: dict[str, str] = dict(topic_map)
    prev_state = load_topic_state(vault_path)
    new_state: dict[str, dict] = {}

    merged_cids: list[int] = []
    if merge_small and min_community_size > 1:
        merged_cids = _merge_small_communities(conn, min_community_size)
        if merged_cids:
            for mc in merged_cids:
                cid_to_path.pop(str(mc), None)
            conn.commit()

    cid_to_title = _build_cid_title_cache(vault, cid_to_path)

    if communities:
        cids = [int(k) for k in communities.keys()]
    else:
        rows = conn.execute(
            "SELECT DISTINCT community FROM entities WHERE community >= 0 ORDER BY community"
        ).fetchall()
        cids = [r["community"] for r in rows]

    built, skipped, errors = [], [], []
    active_cids: set[str] = set()

    for cid in cids:
        members = _community_members(conn, cid)
        if not members:
            skipped.append({"community_id": cid, "reason": "no_entities"})
            continue

        active_cids.add(str(cid))
        member_names = [m["name"] for m in members]
        hub = _hub_entity(conn, cid) or member_names[0]
        member_name_set = set(member_names)
        bridges = bridge_analysis(conn, cid, member_name_set)
        fp = _community_fingerprint(
            conn, vault, cid, member_names, bridges, cid_to_path, cid_to_title,
        )

        rel_path = cid_to_path.get(str(cid))
        topic_exists = bool(rel_path and (vault / rel_path.replace("\\", "/")).exists())

        if (
            incremental
            and not force
            and topic_exists
            and prev_state.get(str(cid), {}).get("fingerprint") == fp
        ):
            skipped.append({"community_id": cid, "reason": "unchanged", "path": rel_path})
            new_state[str(cid)] = {"fingerprint": fp, "path": rel_path}
            if rel_path:
                t = _read_topic_title(vault, rel_path)
                if t:
                    cid_to_title[str(cid)] = t
            continue

        summaries = {m["name"]: _entity_summary(vault, m) for m in members}

        compiled = _llm_compile(
            members, summaries, bridges, hub, cid_to_title, llm_model=llm_model,
        )
        if compiled and compiled.get("title"):
            title = str(compiled["title"]).strip()
            if title == hub and member_names:
                title = _fallback_domain_title(hub, member_names, compiled.get("key_themes") or [])
            summary = str(compiled.get("summary", "")).strip()
            key_themes = compiled.get("key_themes") or []
            entity_groups = _normalize_entity_groups(
                compiled.get("entity_groups"), member_names, hub,
            )
            related_llm = compiled.get("related_topics") or []
        else:
            key_themes = member_names[:5]
            title = _fallback_domain_title(hub, member_names, key_themes)
            summary = (
                f"本领域以 {_wikilink(hub)} 为核心，涵盖 {len(member_names)} 个相关实体，"
                "用于串联该社区内的概念与笔记。"
            )
            entity_groups = _normalize_entity_groups(None, member_names, hub)
            related_llm = []

        related = _enrich_related(bridges, related_llm, cid_to_path, cid_to_title, vault)

        rel_path = cid_to_path.get(str(cid))
        if rel_path and (vault / rel_path.replace("\\", "/")).exists():
            out_path = vault / rel_path.replace("\\", "/")
        else:
            out_path = tdir / f"{_safe_filename(title)}.md"
            n = 1
            while out_path.exists():
                out_path = tdir / f"{_safe_filename(title)}_{n}.md"
                n += 1
            rel_path = str(out_path.relative_to(vault)).replace("\\", "/")
            cid_to_path[str(cid)] = rel_path

        md = _build_topic_md(
            title=title,
            community_id=cid,
            hub_entity=hub,
            members=member_names,
            summary=summary,
            key_themes=key_themes if isinstance(key_themes, list) else [],
            entity_groups=entity_groups,
            related=related,
        )

        try:
            out_path.parent.mkdir(parents=True, exist_ok=True)
            out_path.write_text(md, encoding="utf-8")
            built.append({"community_id": cid, "path": rel_path, "title": title})
            new_state[str(cid)] = {"fingerprint": fp, "path": rel_path}
            cid_to_title[str(cid)] = title
        except OSError as e:
            errors.append({"community_id": cid, "error": str(e)})

    for cid, info in prev_state.items():
        if cid in new_state or cid not in active_cids:
            continue
        if isinstance(info, dict) and info.get("fingerprint"):
            new_state[cid] = info

    orphaned = [p for cid, p in topic_map.items() if cid not in active_cids]
    if merged_cids:
        orphaned.extend(
            p for cid, p in topic_map.items() if int(cid) in merged_cids and p not in orphaned
        )
    _save_topic_map(vault, {k: v for k, v in cid_to_path.items() if k in active_cids}, orphaned=orphaned or None)
    save_topic_state(vault_path, new_state)

    unchanged = sum(1 for s in skipped if s.get("reason") == "unchanged")
    return {
        "built": len(built),
        "skipped": len(skipped),
        "unchanged": unchanged,
        "errors": errors,
        "topics": built,
        "orphaned": orphaned,
        "merged_communities": merged_cids,
    }
