"""graph_algorithms tests."""

from src.knowledge.graph_algorithms import topological_layers


def test_topological_layers_linear():
    # c depends on b depends on a → order layers [[a], [b], [c]]
    nodes = ["a", "b", "c"]
    edges = [("b", "a", "subordinate"), ("c", "b", "subordinate")]
    layers, cycle = topological_layers(nodes, edges)
    assert cycle is None
    flat = [n for layer in layers for n in layer]
    assert flat.index("a") < flat.index("b") < flat.index("c")


def test_detect_cycle():
    nodes = ["a", "b"]
    edges = [("a", "b", "subordinate"), ("b", "a", "subordinate")]
    layers, cycle = topological_layers(nodes, edges)
    assert cycle is not None
    assert len(layers) >= 0
