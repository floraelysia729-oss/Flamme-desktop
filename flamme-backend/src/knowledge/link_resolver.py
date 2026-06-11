"""Wikilink target → vault document path (aligned with flamme-4 resolveVaultLink.ts)."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

_WIKI_DIRS = ("entities", "topics", "comparisons", "explorations")


def parse_wikilink_target(raw: str) -> str:
    pipe = raw.find("|")
    link = raw[:pipe] if pipe >= 0 else raw
    return link.replace("\\", "/").lstrip("./").strip()


def _stem(name: str) -> str:
    base = name.split("/")[-1]
    i = base.rfind(".")
    return base[:i] if i > 0 else base


class LinkResolver:
    def __init__(self, db, vault_path: str):
        self._db = db
        self._vault = Path(vault_path)

    def resolve(self, target: str) -> dict[str, Any] | None:
        t = parse_wikilink_target(target)
        if not t:
            return None

        docs = self._db.list_documents()
        by_path = {d["path"].replace("\\", "/"): d for d in docs}

        for cand in (t, t if t.endswith(".md") else f"{t}.md"):
            if cand in by_path:
                return self._hit(by_path[cand], "path_exact")

        stem = _stem(t)
        static = [f"{stem}.md", *[f"{d}/{stem}.md" for d in _WIKI_DIRS]]
        hits = [by_path[p] for p in static if p in by_path]
        if len(hits) == 1:
            return self._hit(hits[0], "path_candidate")
        if len(hits) > 1:
            best = self._score_paths([h["path"] for h in hits], stem)
            return self._hit(by_path[best], "path_scored")

        lower = stem.lower()
        exact = [d for d in docs if d["title"].lower() == lower]
        if len(exact) == 1:
            return self._hit(exact[0], "title_exact")
        if len(exact) > 1:
            return self._hit(exact[0], "title_ambiguous")

        for d in docs:
            p = d["path"].replace("\\", "/")
            if lower in d["title"].lower() or lower in p.lower():
                return self._hit(d, "fuzzy")
        return None

    def _hit(self, doc: dict, kind: str) -> dict:
        path = doc["path"].replace("\\", "/")
        return {
            "path": path,
            "title": doc["title"],
            "entity_name": _stem(path),
            "match_kind": kind,
        }

    def _score_paths(self, paths: list[str], title: str) -> str:
        src_like = bool(re.match(r"^\d+[\.\、\s]", title.strip()))

        def score(p: str) -> float:
            n = p.replace("\\", "/")
            s = 0.0
            if src_like:
                s += 120 if "entities/" not in n else -40
            else:
                s += 100 if "entities/" in n or n.startswith("entities/") else 0
            if "topics/" in n:
                s += 50
            return s - len(n) * 0.01

        return max(paths, key=score)
