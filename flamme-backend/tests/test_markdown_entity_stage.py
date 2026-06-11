"""Markdown 摄入应进入实体阶段（非 skipped Markdown 源文件）"""

import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch

from src.agent.workers import IngestWorker


def test_handle_markdown_runs_entity_stage():
    worker = IngestWorker.__new__(IngestWorker)
    worker._tools = {
        "markdown_parser": MagicMock(),
    }
    worker._db = MagicMock()
    worker._db._vault_path = "/vault"
    worker._db._norm = lambda p: p.replace("\\", "/")
    worker._db.put_document = MagicMock()
    worker._llm = MagicMock()
    worker._embedding_store = None
    worker._llm_queue = None
    worker._current_task_id = None
    worker._stages = [
        {"id": "parse_md", "label": "解析", "status": "pending"},
        {"id": "index", "label": "索引", "status": "pending"},
        {"id": "embed", "label": "嵌入", "status": "pending"},
        {"id": "entities", "label": "实体", "status": "pending"},
    ]

    worker._tool_exec = lambda tool, params: {
        "metadata": {"title": "Demo"},
        "content": "# Demo\n\nReAct 是一种推理方法。",
    }
    worker._auto_embed = MagicMock(return_value=True)
    worker._report = MagicMock()

    with tempfile.TemporaryDirectory() as tmp:
        md = Path(tmp) / "demo.md"
        md.write_text("# Demo\n\nReAct 是一种推理方法。", encoding="utf-8")
        with patch.object(worker, "_run_entity_stage", return_value=", 2 个实体页已创建") as run_entities:
            result = worker._handle_markdown(str(md))
            run_entities.assert_called_once()
            assert "2 个实体页" in result["message"]
