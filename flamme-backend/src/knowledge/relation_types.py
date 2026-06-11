"""Graph edge relation types — meaningful learning semantics."""

from enum import Enum


class RelationType(str, Enum):
    SUBORDINATE = "subordinate"
    COORDINATE = "coordinate"
    CORRELATIVE = "correlative"
    WIKILINK = "wikilink"
    HAS_ENTITY = "has_entity"


_LEGACY = {"related_to": RelationType.CORRELATIVE}


def normalize_relation_type(raw: str) -> RelationType:
    key = (raw or "").strip().lower()
    if key in _LEGACY:
        return _LEGACY[key]
    try:
        return RelationType(key)
    except ValueError:
        return RelationType.CORRELATIVE
