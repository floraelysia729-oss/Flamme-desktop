"""Knowledge graph semantics — relation types, link resolution, algorithms."""

from src.knowledge.relation_types import RelationType, normalize_relation_type
from src.knowledge.link_resolver import LinkResolver, parse_wikilink_target

__all__ = [
    "RelationType",
    "normalize_relation_type",
    "LinkResolver",
    "parse_wikilink_target",
]
