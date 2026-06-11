"""实体维护 — 修剪 sources、删除孤儿"""

import tempfile
from pathlib import Path

from src.vault.entity_maintain import (
    cleanup_entity_state,
    delete_orphan_entities,
    prune_stale_sources,
    run_entity_maintain,
)
from src.vault.index_state import save_entity_state_entry


class FakeDB:
    def __init__(self):
        self._docs: dict[str, dict] = {}

    def list_documents(self):
        return list(self._docs.values())

    def get_document(self, path: str):
        return self._docs.get(path.replace("\\", "/"))

    def get_unembedded_docs(self):
        return []


def _write(vault: Path, relpath: str, content: str) -> None:
    fp = vault / relpath
    fp.parent.mkdir(parents=True, exist_ok=True)
    fp.write_text(content, encoding="utf-8")


def test_prune_stale_sources_keeps_live():
    with tempfile.TemporaryDirectory() as tmp:
        vault = Path(tmp)
        rel = "notes/alive.md"
        _write(vault, rel, "---\ntitle: Alive\n---\n# Alive\n")
        entity_rel = "entities/mixed.md"
        _write(
            vault,
            entity_rel,
            "---\ntitle: Mixed\nsources:\n  - \"[[alive]]\"\n  - \"[[gone]]\"\nstatus: draft\n---\n# Mixed\n",
        )
        db = FakeDB()
        db._docs[rel] = {"path": rel, "title": "Alive", "content_hash": "h"}
        stale = [{
            "entity_path": entity_rel,
            "title": "Mixed",
            "dead_sources": ["gone"],
            "live_sources": ["alive"],
        }]
        result = prune_stale_sources(str(vault), stale)
        assert entity_rel in result["pruned"]
        raw = (vault / entity_rel).read_text(encoding="utf-8")
        assert "[[alive]]" in raw
        assert "[[gone]]" not in raw
        assert result["newly_orphaned"] == []


def test_delete_orphan_entities():
    with tempfile.TemporaryDirectory() as tmp:
        vault = Path(tmp)
        entity_rel = "entities/orphan.md"
        _write(
            vault,
            entity_rel,
            "---\ntitle: Orphan\nsources:\n  - \"[[missing]]\"\nstatus: draft\n---\n# Orphan\n",
        )
        orphans = [{
            "entity_path": entity_rel,
            "title": "Orphan",
            "dead_sources": ["missing"],
            "reason": "all_sources_dead",
        }]
        result = delete_orphan_entities(str(vault), orphans)
        assert entity_rel in result["deleted"]
        assert not (vault / entity_rel).exists()


def test_cleanup_entity_state():
    with tempfile.TemporaryDirectory() as tmp:
        vault = str(Path(tmp))
        rel = "notes/old.md"
        save_entity_state_entry(vault, rel, "hash", 1)
        cleaned = cleanup_entity_state(vault, [rel])
        assert rel in cleaned
        from src.vault.index_state import load_entity_state

        assert rel not in load_entity_state(vault)


def test_run_entity_maintain_prune_and_delete():
    with tempfile.TemporaryDirectory() as tmp:
        vault = Path(tmp)
        rel = "notes/keep.md"
        _write(vault, rel, "---\ntitle: Keep\n---\n# Keep\n")
        prune_rel = "entities/prune-me.md"
        orphan_rel = "entities/delete-me.md"
        _write(
            vault,
            prune_rel,
            "---\ntitle: Prune\nsources:\n  - \"[[keep]]\"\n  - \"[[dead]]\"\nstatus: draft\n---\n",
        )
        _write(
            vault,
            orphan_rel,
            "---\ntitle: Delete\nsources:\n  - \"[[vanished]]\"\nstatus: draft\n---\n",
        )
        db = FakeDB()
        db._docs[rel] = {"path": rel, "title": "Keep", "content_hash": "h"}
        scan = {
            "entity_stale_sources": [{
                "entity_path": prune_rel,
                "title": "Prune",
                "dead_sources": ["dead"],
                "live_sources": ["keep"],
            }],
            "orphan_entities": [{
                "entity_path": orphan_rel,
                "title": "Delete",
                "dead_sources": ["vanished"],
                "reason": "all_sources_dead",
            }],
            "entity_state_orphan_keys": [],
        }
        result = run_entity_maintain(str(vault), db, scan)
        assert prune_rel in result["pruned_entities"]
        assert orphan_rel in result["deleted_entities"]
        assert not (vault / orphan_rel).exists()
        raw = (vault / prune_rel).read_text(encoding="utf-8")
        assert "[[keep]]" in raw
        assert "[[dead]]" not in raw
