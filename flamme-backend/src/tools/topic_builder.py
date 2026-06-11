"""Topic Builder Tool — 社区 → vault/topics/*.md"""

from src.tools.interfaces import BaseTool, InterruptBehavior, ToolResult
from src.scripts.topic_builder import build_topics


class TopicBuilderTool(BaseTool):
    name = "topic_builder"
    description = "基于 Leiden 社区检测生成 topic hub 页与 topic_map.json"
    is_concurrency_safe = False
    is_read_only = False
    interrupt_behavior = InterruptBehavior.BLOCK
    max_result_chars = 5_000

    def __init__(self, db=None, llm_model: str | None = None):
        self._db = db
        self._llm_model = llm_model

    def execute(self, params: dict) -> ToolResult:
        vault_path = params.get("vault_path", "")
        if not vault_path:
            return ToolResult.err("未指定 vault_path")
        if not self._db:
            return ToolResult.err("TopicBuilder 未注入 db")

        communities = params.get("communities")
        if isinstance(communities, int):
            communities = None

        llm_model = params.get("llm_model") or self._llm_model
        incremental = params.get("incremental", True)
        force = params.get("force", False)
        try:
            result = build_topics(
                vault_path,
                self._db,
                communities=communities if isinstance(communities, dict) else None,
                llm_model=llm_model,
                incremental=incremental,
                force=force,
            )
            return ToolResult.ok(result)
        except Exception as e:
            return ToolResult.err(str(e))
