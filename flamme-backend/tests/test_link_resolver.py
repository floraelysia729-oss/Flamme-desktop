"""LinkResolver and relation_types tests."""

import os
import shutil
import tempfile
from pathlib import Path

from src.db.client import SQLiteClient
from src.knowledge.link_resolver import LinkResolver, parse_wikilink_target
from src.knowledge.relation_types import RelationType, normalize_relation_type


def test_normalize_legacy_related_to():
    assert normalize_relation_type("related_to") == RelationType.CORRELATIVE


def test_subordinate_unchanged():
    assert normalize_relation_type("subordinate") == RelationType.SUBORDINATE


def test_parse_wikilink_target_alias():
    assert parse_wikilink_target("矩阵基础|显示名") == "矩阵基础"


def test_resolve_entity_by_title():
    tmpdir = tempfile.mkdtemp()
    vault = os.path.join(tmpdir, "vault")
    db_path = os.path.join(tmpdir, "test.db")
    entity_dir = Path(vault) / "entities"
    entity_dir.mkdir(parents=True)
    (entity_dir / "矩阵基础.md").write_text(
        "---\ntitle: 矩阵基础\ntype: entity\n---\n", encoding="utf-8"
    )

    db = SQLiteClient(db_path, vault_path=vault)
    try:
        db.put_document({
            "path": "entities/矩阵基础.md",
            "title": "矩阵基础",
            "level": "pro",
            "status": "stable",
            "tags": [],
            "word_count": 1,
            "content_hash": "x",
        })
        r = LinkResolver(db, vault).resolve("矩阵基础")
        assert r is not None
        assert r["path"] == "entities/矩阵基础.md"
        assert r["match_kind"] in ("title_exact", "path_candidate", "path_exact")
    finally:
        db.close()
        shutil.rmtree(tmpdir, ignore_errors=True)
