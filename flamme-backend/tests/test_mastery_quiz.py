"""掌握测验 — 出题 / 判分 / 节点迁移"""

from src.agent.learn_note import empty_learn_note, mark_label_status
from src.agent.mastery_quiz import (
    complete_mastery,
    evaluate_answer,
    generate_quiz,
    new_wrong_entry,
    upsert_wrong_log,
)


def _note_with_tree(tree: str) -> dict:
    note = empty_learn_note("线性代数")
    for sec in note["sections"]:
        if sec["id"] == "knowledge_tree":
            sec["content"] = tree
    return note


class TestGenerateQuiz:
    def test_fallback_without_llm(self):
        note = _note_with_tree("→ 特征值\n├─□ 特征向量")
        quiz = generate_quiz(None, note, "特征值")
        assert quiz["target_label"] == "特征值"
        assert 2 <= len(quiz["questions"]) <= 5
        assert all("id" in q and "prompt" in q for q in quiz["questions"])


class TestEvaluateAnswer:
    def test_rejects_empty_answer(self):
        note = _note_with_tree("→ 特征值")
        result = evaluate_answer(None, "特征值", "核心是什么？", "  ", note)
        assert result["correct"] is False
        assert "作答" in result["explanation"]

    def test_accepts_yes_no_short_answer(self):
        note = _note_with_tree("→ 重载")
        result = evaluate_answer(
            None,
            "重载",
            "const 与 non-const 是否视为不同函数？",
            "否",
            note,
        )
        assert result["correct"] is True

    def test_give_up_shows_reference_answer(self):
        note = _note_with_tree("→ 重载")
        result = evaluate_answer(None, "重载", "如何绑定？", "不会", note)
        assert result["correct"] is False
        assert result["explanation"].startswith("参考答案")

    def test_accepts_longer_answer_without_llm(self):
        note = _note_with_tree("→ 特征值")
        result = evaluate_answer(
            None,
            "特征值",
            "核心是什么？",
            "特征值是矩阵作用于向量时保持方向不变的缩放因子",
            note,
        )
        assert result["correct"] is True


class TestCompleteMastery:
    def test_marks_current_as_learned_and_promotes_todo(self):
        tree = "✓ 线性代数\n├─→ 特征值\n└─□ 特征向量"
        note = _note_with_tree(tree)
        updated = complete_mastery(note, "特征值")
        tree_sec = next(s for s in updated["sections"] if s["id"] == "knowledge_tree")
        content = tree_sec["content"]
        assert "✓ 特征值" in content
        assert "→ 特征向量" in content
        assert "→ 特征值" not in content


class TestMarkLabelStatus:
    def test_mark_label_status_learned(self):
        content = "├─→ 特征值\n└─□ 特征向量"
        out = mark_label_status(content, "特征值", "learned")
        assert "✓ 特征值" in out


class TestWrongEntry:
    def test_new_wrong_entry_camel_case(self):
        entry = new_wrong_entry("特征值", "Q?", "A", "解析")
        assert entry["targetLabel"] == "特征值"
        assert entry["userAnswer"] == "A"
        assert "id" in entry
        assert "at" in entry

    def test_upsert_wrong_log_dedupes(self):
        log = []
        e1 = new_wrong_entry("重载", "同一题？", "不会", "解析1")
        e2 = new_wrong_entry("重载", "同一题？", "不知道", "解析2")
        upsert_wrong_log(log, e1)
        upsert_wrong_log(log, e2)
        assert len(log) == 1
        assert log[0]["userAnswer"] == "不知道"
