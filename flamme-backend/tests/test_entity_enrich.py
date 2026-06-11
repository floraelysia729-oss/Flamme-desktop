"""Entity builder incremental enrichment helpers."""

from src.scripts.entity_builder import (
    _concept_name_only,
    _merge_entity_relations,
    _merge_source_names,
    find_enrichment_terms,
)


def test_concept_name_only_strips_description():
    assert _concept_name_only("深度优先搜索: 另一种无信息搜索策略") == "深度优先搜索"
    assert _concept_name_only("[[搜索问题形式化：理解如何建模]]") == "搜索问题形式化"


def test_merge_source_names_accumulates():
    fm = {"sources": ["[[1.绪论]]", "[[2.无信息搜索]]"]}
    merged = _merge_source_names(fm, ["3.有信息搜索"])
    assert merged == ["1.绪论", "2.无信息搜索", "3.有信息搜索"]


def test_merge_entity_relations_keeps_old_links():
    fm = {
        "prerequisites": ["搜索问题形式化"],
        "coordinate": ["有信息搜索"],
        "related": [],
        "tags": ["搜索策略"],
    }
    new = {
        "prerequisites": ["无信息搜索"],
        "coordinate": [],
        "related": ["A*搜索"],
        "tags": ["启发式搜索"],
    }
    out = _merge_entity_relations(new.copy(), fm, "有信息搜索")
    assert "无信息搜索" in out["prerequisites"]
    assert "搜索问题形式化" in out["prerequisites"]
    assert "A*搜索" in out["related"]


def test_find_enrichment_terms_detects_mentions():
    body = "# 回顾\n\n宽度优先搜索与深度优先搜索均为无信息搜索策略。\n\n" + "x" * 20
    existing = {"宽度优先搜索", "图灵测试"}
    found = find_enrichment_terms(body, existing, skip_terms={"贪婪搜索"})
    assert "宽度优先搜索" in found
    assert "图灵测试" not in found
