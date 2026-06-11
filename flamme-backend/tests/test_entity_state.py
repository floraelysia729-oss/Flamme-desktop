"""entity_state 增量指纹 — 避免无变更时重复 LLM 抽取"""

import tempfile
from pathlib import Path

from src.vault.index_state import (
    entity_needs_extract,
    load_entity_state,
    save_entity_state_entry,
)


def test_entity_fingerprint_skip_unchanged():
    with tempfile.TemporaryDirectory() as tmp:
        vault = str(Path(tmp))
        rel = "notes/demo.md"
        h1 = "abc123"
        save_entity_state_entry(vault, rel, h1, 3)
        assert not entity_needs_extract(vault, rel, h1)
        assert entity_needs_extract(vault, rel, "changed")
        state = load_entity_state(vault)
        assert state[rel]["entity_count"] == 3


def test_entity_needs_extract_when_no_state():
    with tempfile.TemporaryDirectory() as tmp:
        vault = str(Path(tmp))
        assert entity_needs_extract(vault, "a.md", "hash1")
        assert entity_needs_extract(vault, "a.md", "hash1", force=True)
