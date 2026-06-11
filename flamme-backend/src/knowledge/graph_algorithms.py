"""Graph algorithms on relation subgraphs — topological sort and cycle detection."""

from __future__ import annotations

from collections import defaultdict, deque

from src.knowledge.relation_types import RelationType, normalize_relation_type

_DIRECTED = {RelationType.SUBORDINATE, RelationType.HAS_ENTITY}


def topological_layers(
    node_ids: list[str],
    edges: list[tuple[str, str, str]],
) -> tuple[list[list[str]], list[str] | None]:
    """Kahn layering. subordinate edge source→target: source depends on target (target is prerequisite).

    Returns layer order (prerequisites first) and cycle node list if cyclic.
    """
    nodes = set(node_ids)
    adj: dict[str, set[str]] = defaultdict(set)
    indeg: dict[str, int] = {n: 0 for n in nodes}

    for src, tgt, rel in edges:
        if normalize_relation_type(rel) not in _DIRECTED:
            continue
        if src not in nodes or tgt not in nodes:
            continue
        # src depends on tgt → tgt must come first → edge tgt -> src
        if src not in adj[tgt]:
            adj[tgt].add(src)
            indeg[src] = indeg.get(src, 0) + 1

    q = deque([n for n in nodes if indeg.get(n, 0) == 0])
    layers: list[list[str]] = []
    visited = 0

    while q:
        layer = list(q)
        layers.append(layer)
        visited += len(layer)
        nq: deque[str] = deque()
        for u in layer:
            for v in adj.get(u, ()):
                indeg[v] -= 1
                if indeg[v] == 0:
                    nq.append(v)
        q = nq

    if visited != len(nodes):
        return layers, _find_cycle(nodes, edges)
    return layers, None


def _find_cycle(
    nodes: set[str],
    edges: list[tuple[str, str, str]],
) -> list[str]:
    """DFS three-color on subordinate subgraph; return nodes on a back-edge cycle."""
    adj: dict[str, list[str]] = defaultdict(list)
    for src, tgt, rel in edges:
        if normalize_relation_type(rel) not in _DIRECTED:
            continue
        if src in nodes and tgt in nodes:
            adj[tgt].append(src)

    WHITE, GRAY, BLACK = 0, 1, 2
    color = {n: WHITE for n in nodes}
    parent: dict[str, str | None] = {n: None for n in nodes}
    cycle_nodes: list[str] = []

    def dfs(u: str) -> bool:
        color[u] = GRAY
        for v in adj.get(u, []):
            if color[v] == GRAY:
                cycle_nodes.append(v)
                cur: str | None = u
                while cur is not None and cur != v:
                    cycle_nodes.append(cur)
                    cur = parent.get(cur)
                cycle_nodes.append(v)
                return True
            if color[v] == WHITE:
                parent[v] = u
                if dfs(v):
                    return True
        color[u] = BLACK
        return False

    for n in nodes:
        if color[n] == WHITE and dfs(n):
            break
    return list(dict.fromkeys(cycle_nodes)) if cycle_nodes else list(nodes)[:3]
