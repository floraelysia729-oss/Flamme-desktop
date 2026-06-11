"""实体健康扫描 — 零 LLM"""

import tempfile
from pathlib import Path

from src.vault.entity_health import (
    resolve_source_alive,
    scan_entity_health,
    scan_entity_source_health,
    scan_missing_entity_extract_md,
)
from src.vault.index_state import save_entity_state_entry


class FakeDB:
    def __init__(self, docs: list[dict] | None = None):
        self._docs = {}
        for d in docs or []:
            doc = dict(d)
            doc.setdefault("title", Path(doc["path"]).stem)
            self._docs[doc["path"]] = doc

    def list_documents(self):
        return list(self._docs.values())

    def get_document(self, path: str):
        return self._docs.get(path.replace("\\", "/"))

    def get_unembedded_docs(self):
        return []


def _write(vault: Path, relpath: str, content: str) -> None:
    fp = vault / relpath.replace("/", "\\") if "\\" in str(vault) else vault / relpath
    fp.parent.mkdir(parents=True, exist_ok=True)
    fp.write_text(content, encoding="utf-8")


def test_missing_entity_extract_when_no_state():
    with tempfile.TemporaryDirectory() as tmp:
        vault = Path(tmp)
        rel = "notes/demo.md"
        _write(vault, rel, "---\ntitle: Demo\n---\n# Hello\n")
        db = FakeDB([{"path": rel, "content_hash": "hash1"}])
        missing = scan_missing_entity_extract_md(str(vault), db)
        assert rel in missing


def test_missing_entity_extract_skips_when_fingerprint_matches():
    with tempfile.TemporaryDirectory() as tmp:
        vault = Path(tmp)
        rel = "notes/demo.md"
        _write(vault, rel, "---\ntitle: Demo\n---\n# Hello\n")
        save_entity_state_entry(str(vault), rel, "hash1", 2)
        db = FakeDB([{"path": rel, "content_hash": "hash1"}])
        missing = scan_missing_entity_extract_md(str(vault), db)
        assert rel not in missing


def test_orphan_entity_when_all_sources_dead():
    with tempfile.TemporaryDirectory() as tmp:
        vault = Path(tmp)
        db = FakeDB()
        _write(
            vault,
            "entities/ghost.md",
            "---\ntitle: Ghost\nsources:\n  - \"[[deleted-note]]\"\nstatus: draft\n---\n# Ghost\n",
        )
        stale, orphans = scan_entity_source_health(str(vault), db)
        assert len(stale) == 0
        assert len(orphans) == 1
        assert orphans[0]["entity_path"] == "entities/ghost.md"
        assert "deleted-note" in orphans[0]["dead_sources"]


def test_stale_sources_when_partial_dead():
    with tempfile.TemporaryDirectory() as tmp:
        vault = Path(tmp)
        rel = "notes/alive.md"
        _write(vault, rel, "---\ntitle: Alive\n---\n# Alive\n")
        db = FakeDB([{"path": rel, "content_hash": "h1"}])
        _write(
            vault,
            "entities/mixed.md",
            "---\ntitle: Mixed\nsources:\n  - \"[[alive]]\"\n  - \"[[gone]]\"\nstatus: draft\n---\n# Mixed\n",
        )
        stale, orphans = scan_entity_source_health(str(vault), db)
        assert len(orphans) == 0
        assert len(stale) == 1
        assert "gone" in stale[0]["dead_sources"]
        assert "alive" in stale[0]["live_sources"]


def test_resolve_source_alive_finds_md_stem():
    with tempfile.TemporaryDirectory() as tmp:
        vault = Path(tmp)
        rel = "notes/foo.md"
        _write(vault, rel, "---\ntitle: Foo\n---\n# Foo\n")
        db = FakeDB([{"path": rel, "content_hash": "h"}])
        alive, reason = resolve_source_alive(str(vault), db, "foo")
        assert alive
        assert "md_stem" in reason or "resolved" in reason


def test_scan_entity_health_counts():
    with tempfile.TemporaryDirectory() as tmp:
        vault = Path(tmp)
        rel = "notes/new.md"
        _write(vault, rel, "---\ntitle: New\n---\n# New\n")
        db = FakeDB([{"path": rel, "content_hash": "h2"}])
        result = scan_entity_health(str(vault), db)
        assert result["missing_entity_extract_count"] >= 1
        assert rel in result["missing_entity_extract_md"]
