"""摄入进度与阶段模板测试"""

import json
import tempfile
from pathlib import Path

from src.agent.ingest_stages import initial_stages_for_path, mark_ok, mark_running
from src.db.client import SQLiteClient


def test_initial_stages_for_pdf():
    stages = initial_stages_for_path("course/lecture.pdf")
    ids = [s["id"] for s in stages]
    assert ids == ["pdf_parse", "save_converted", "index", "embed", "entities"]
    assert all(s["status"] == "pending" for s in stages)


def test_mark_running_updates_detail():
    stages = initial_stages_for_path("a.pdf")
    updated = mark_running(stages, "pdf_parse", "12/40 页")
    pdf = next(s for s in updated if s["id"] == "pdf_parse")
    assert pdf["status"] == "running"
    assert pdf["detail"] == "12/40 页"


def test_update_task_progress_while_claimed():
    with tempfile.TemporaryDirectory() as tmp:
        db_path = str(Path(tmp) / "knowledge.db")
        db = SQLiteClient(db_path, vault_path=tmp)
        try:
            task_id = db.push_task("ingest", {"path": "x.pdf"}, generation=0)
            claimed = db.claim_task_by_id("test-worker", task_id, "ingest")
            assert claimed is not None

            stages = mark_running(initial_stages_for_path("x.pdf"), "pdf_parse", "1/10 页")
            db.update_task_progress(task_id, stages=stages, message="解析中")
            row = db.get_task(task_id)
            assert row["status"] == "claimed"
            progress = row["payload"]["progress"]
            assert progress["message"] == "解析中"
            assert progress["stages"][0]["detail"] == "1/10 页"

            done_stages = mark_ok(stages, "pdf_parse", "10/10 页")
            db.complete_task(task_id, {"result": {"message": "ok", "stages": done_stages}})
            done = db.get_task(task_id)
            assert done["status"] == "done"
            result = done["payload"]["result"]
            assert result["message"] == "ok"
        finally:
            db.close()


def test_estimate_seconds_parallel_binary():
    from src.vault.scanner import estimate_seconds, INGEST_PARALLEL

    sec = estimate_seconds({"binary_unprocessed": ["a.pdf", "b.pdf", "c.pdf", "d.pdf", "e.pdf"]})
    assert sec == 100  # ceil(5/3)*50
    assert INGEST_PARALLEL == 3
