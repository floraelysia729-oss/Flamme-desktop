"""Vault 同步工具 — 扫描 .md 文件，对比 SQLite 索引，执行增量同步

文件是真相来源，SQLite 只是索引。sync 不修改任何 .md 文件，
只在 DB 中 upsert/delete 元数据记录。
"""

import hashlib
import logging
import os
from pathlib import Path

from src.tools.interfaces import BaseTool, InterruptBehavior, ToolResult

logger = logging.getLogger(__name__)


SKIP_DIRS = {".wiki", ".obsidian", ".git", "node_modules", ".trash", ".claude", "__pycache__", "venv", ".venv", "site-packages"}

# Wiki 系统页面前缀（非用户源资料）
WIKI_PAGE_PREFIXES = ("entities/", "topics/", "comparisons/", "explorations/")
WIKI_DIR_NAMES = frozenset({"entities", "topics", "comparisons", "explorations"})

# 统一文档级别（取代 pro/lite/raw）
SOURCE_LEVEL = "source"


def scan_all_md(vault_path: str) -> list[str]:
    """扫描 vault 中所有可索引的 .md 文件，返回相对路径列表"""
    vault = Path(vault_path)
    files = []
    for p in vault.rglob("*.md"):
        # 跳过排除目录
        if any(part in SKIP_DIRS for part in p.parts):
            continue
        # 跳过 excalidraw 文件（由专门工具处理）
        if p.name.endswith(".excalidraw.md"):
            continue
        # 转为 vault 相对路径（正斜杠）
        try:
            rel = str(p.relative_to(vault)).replace("\\", "/")
            files.append(rel)
        except ValueError:
            continue
    return sorted(files)


def content_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def infer_level(relpath: str) -> str:
    """返回统一源文档级别（路径不再推断 pro/lite/raw）"""
    return SOURCE_LEVEL


def is_wiki_system_path(relpath: str) -> bool:
    """是否为 entity/topic 等系统 wiki 页（含 test/entities/ 等嵌套路径）"""
    norm = relpath.replace("\\", "/")
    parts = norm.split("/")
    if any(part in WIKI_DIR_NAMES for part in parts):
        return True
    return any(norm.startswith(p) for p in WIKI_PAGE_PREFIXES)


def is_source_doc(relpath: str) -> bool:
    """判断是否为 vault 中的用户源资料（非系统/wiki 页）"""
    if not relpath or relpath.startswith("."):
        return False
    if "copilot-custom-prompts" in relpath:
        return False
    parts = relpath.replace("\\", "/").split("/")
    if any(part in SKIP_DIRS for part in parts):
        return False
    if ".flamme" in parts:
        return False
    if is_wiki_system_path(relpath):
        return False
    return True


class SyncTool(BaseTool):
    """扫描 vault 文件 → 对比 SQLite → 增量同步索引"""

    name = "sync"
    description = "扫描 vault 文件并同步 SQLite 索引"
    is_concurrency_safe = False
    is_read_only = False
    interrupt_behavior = InterruptBehavior.BLOCK
    max_result_chars = 10_000

    def __init__(self, db, vault_path: str, parser=None):
        self._db = db
        self._vault_path = vault_path
        self._parser = parser

    def execute(self, params: dict) -> ToolResult:
        vault = self._vault_path
        if not vault or not Path(vault).is_dir():
            return ToolResult.err(f"vault 路径无效: {vault}")

        # 1. 扫描文件
        disk_files = scan_all_md(vault)
        disk_set = set(disk_files)

        # 2. 获取 DB 中已有记录
        db_docs = self._db.list_documents()
        db_map = {doc["path"]: doc for doc in db_docs}

        added, updated, removed, unchanged = [], [], [], []

        # 3. 新增/更新
        for relpath in disk_files:
            abs_path = os.path.join(vault, relpath)
            try:
                raw = Path(abs_path).read_text(encoding="utf-8")
            except Exception:
                continue

            h = content_hash(raw)
            doc = db_map.get(relpath)

            # 解析 frontmatter 拿元数据
            metadata = self._parse_frontmatter(raw)
            title = metadata.get("title", Path(relpath).stem)
            tags = metadata.get("tags") or []
            level = metadata.get("level", infer_level(relpath))
            status = metadata.get("status", "draft")
            word_count = len(raw)

            if doc is None:
                # 新文件
                self._db.put_document({
                    "path": relpath, "title": title, "level": level,
                    "status": status, "content_hash": h,
                    "word_count": word_count, "tags": tags,
                })
                added.append(relpath)
            elif doc.get("content_hash") != h:
                # 内容变了
                self._db.put_document({
                    "path": relpath, "title": title, "level": level,
                    "status": status, "content_hash": h,
                    "word_count": word_count, "tags": tags,
                })
                updated.append(relpath)
            else:
                unchanged.append(relpath)

        # 4. 删除 DB 中没有对应文件的记录
        for doc in db_docs:
            if doc["path"] not in disk_set:
                abs_check = os.path.join(vault, doc["path"])
                if not os.path.isfile(abs_check):
                    self._db.delete_document(doc["path"])
                    removed.append(doc["path"])

        # 5. 统计需要 embedding 的
        unembedded = self._db.get_unembedded_docs()
        to_embed = [d["path"] for d in unembedded]

        return ToolResult.ok({
            "added": added,
            "updated": updated,
            "removed": removed,
            "unchanged": len(unchanged),
            "to_embed": to_embed,
            "total_disk": len(disk_files),
            "total_db": len(db_docs) - len(removed) + len(added),
        })

    def _parse_frontmatter(self, raw: str) -> dict:
        """解析 YAML frontmatter"""
        if not raw.startswith("---"):
            return {}
        end = raw.find("---", 3)
        if end < 0:
            return {}
        try:
            import yaml
            return yaml.safe_load(raw[3:end]) or {}
        except Exception:
            return {}

    def validate_input(self, params: dict) -> list[str]:
        return []


def run_vault_sync(
    db,
    vault_path: str,
    registry=None,
    *,
    llm=None,
    embed: bool = False,
    graph: bool = False,
    topics: bool = False,
    entities: bool = False,
    entity_paths: list[str] | None = None,
    force_graph: bool = False,
    force_topics: bool = False,
    force_entities: bool = False,
) -> dict:
    """扫描 vault 并同步 SQLite，可选 embedding / 实体抽取 / 图谱 / topic 构建。

    图谱与 topic 默认增量：内容指纹未变则跳过；文档变更后收尾再检查去重。
    实体抽取默认仅处理 dirty 的源 .md，并按 content_hash 跳过无变更文件。
    """
    sync = SyncTool(db, vault_path)
    result = sync.execute({})
    if result.is_error:
        return {"error": result.error}

    data = dict(result.data)
    dirty_paths = list(set(data.get("added", [])) | set(data.get("updated", [])) | set(data.get("removed", [])))
    data["dirty_paths"] = dirty_paths

    removed = data.get("removed") or []
    if removed:
        from src.vault.entity_maintain import cleanup_entity_state

        data["entity_state_cleaned"] = cleanup_entity_state(vault_path, removed)

    if embed and data.get("to_embed") and registry:
        embed_tool = registry.get("embed_index")
        if embed_tool:
            embed_result = embed_tool.execute({"full": False})
            if embed_result.is_error:
                data["embed_error"] = embed_result.error
            else:
                payload = embed_result.data if isinstance(embed_result.data, dict) else {}
                data["embed_result"] = payload.get("result", embed_result.data)

    if entities and llm:
        from src.tools.entity_sync import run_entities_for_paths

        if entity_paths:
            md_dirty = [
                p.replace("\\", "/")
                for p in entity_paths
                if p.lower().endswith(".md") and is_source_doc(p.replace("\\", "/"))
            ]
        else:
            md_dirty = [
                p for p in dirty_paths
                if p.lower().endswith(".md") and is_source_doc(p.replace("\\", "/"))
            ]
        if md_dirty:
            logger.info("[ENTITY] sync 抽取 %d 篇变更 md …", len(md_dirty))
            client = getattr(llm, "_client", None)
            llm_model = getattr(llm, "_model", None)
            er = run_entities_for_paths(
                vault_path,
                md_dirty,
                client,
                llm_model,
                db=db,
                force=force_entities,
            )
            data["entities_result"] = er
            logger.info("[ENTITY] sync 完成: %s", er)
        else:
            data["entities_result"] = {"built": 0, "skipped": 0, "unchanged": 0, "errors": [], "paths": []}
    elif entities and not llm:
        data["entities_error"] = "未配置 LLM API Key，已跳过实体抽取"

    gb_communities = None
    need_graph = graph or topics

    if need_graph and registry:
        from src.vault.index_state import needs_graph_rebuild, save_graph_state

        do_rebuild, fp, reason = needs_graph_rebuild(vault_path, force=force_graph)
        logger.info("[GRAPH] need_rebuild=%s reason=%s", do_rebuild, reason)
        if not do_rebuild:
            data["graph_result"] = {"status": "skipped", "reason": reason}
            data["graph_skipped"] = True
        else:
            gb = registry.get("graph_builder")
            if gb:
                logger.info("[GRAPH] 开始重建 …")
                gb_result = gb.execute({
                    "vault_path": vault_path,
                    "incremental": False,
                })
                if gb_result.is_error:
                    logger.error("[GRAPH] 失败: %s", gb_result.error)
                    data["graph_result"] = gb_result.error
                else:
                    save_graph_state(vault_path, fp)
                    payload = gb_result.data if isinstance(gb_result.data, dict) else {}
                    data["graph_result"] = {
                        "status": "rebuilt",
                        "reason": reason,
                        "nodes": payload.get("nodes"),
                        "edges": payload.get("edges"),
                    }
                    gb_communities = payload.get("communities")

    if topics and registry:
        graph_ok = (
            data.get("graph_skipped")
            or (
                isinstance(data.get("graph_result"), dict)
                and data["graph_result"].get("status") in ("rebuilt", "skipped")
            )
            or data.get("graph_result") == "rebuilt"
        )
        gr = data.get("graph_result")
        if isinstance(gr, str) and gr != "rebuilt" and not data.get("graph_skipped"):
            logger.error("[TOPIC] 跳过: 图谱失败 — %s", gr)
            data["topics_error"] = "图谱重建失败，已跳过 topic 生成"
        elif not graph_ok and not force_topics:
            logger.warning("[TOPIC] 跳过: 图谱未就绪 graph_ok=%s", graph_ok)
            data["topics_error"] = "图谱未就绪，已跳过 topic 生成"
        else:
            tb = registry.get("topic_builder")
            if tb:
                logger.info("[TOPIC] 开始生成 Hub 页 …")
                tb_params: dict = {
                    "vault_path": vault_path,
                    "incremental": True,
                    "force": force_topics,
                }
                if isinstance(gb_communities, dict):
                    tb_params["communities"] = gb_communities
                tb_result = tb.execute(tb_params)
                if tb_result.is_error:
                    logger.error("[TOPIC] 失败: %s", tb_result.error)
                    data["topics_error"] = tb_result.error
                else:
                    logger.info("[TOPIC] 完成: %s", tb_result.data)
                    data["topics_result"] = tb_result.data

    return data


def format_sync_summary(data: dict) -> str:
    """将 sync 结果格式化为用户可读摘要（Orchestrator 回复用）"""
    added = len(data.get("added", []))
    updated = len(data.get("updated", []))
    removed = len(data.get("removed", []))
    unchanged = data.get("unchanged", 0)
    summary = (
        f"同步完成：新增 {added}，更新 {updated}，"
        f"删除 {removed}，未变 {unchanged}"
    )
    if data.get("embed_result"):
        summary += f"\n{data['embed_result']}"
    if data.get("graph_result"):
        gr = data["graph_result"]
        if isinstance(gr, dict):
            if gr.get("status") == "skipped":
                summary += f"\n图谱: 无变更（跳过）"
            else:
                summary += f"\n图谱: 已重建 ({gr.get('nodes', '?')} 节点)"
        elif gr:
            summary += f"\n图谱: {gr}"
    if data.get("topics_result"):
        tr = data["topics_result"]
        if isinstance(tr, dict):
            built = tr.get("built", 0)
            unchanged = tr.get("unchanged", 0)
            if built == 0 and unchanged > 0:
                summary += f"\n主题: 无变更（跳过 {unchanged} 个社区）"
            else:
                summary += f"\n主题: 更新 {built} 篇"
                if unchanged:
                    summary += f"，跳过 {unchanged} 篇"
        else:
            summary += f"\n主题: {tr}"
    if data.get("topics_error"):
        summary += f"\n主题错误: {data['topics_error']}"
    if data.get("entities_result"):
        er = data["entities_result"]
        if isinstance(er, dict):
            built = er.get("built", 0)
            unchanged = er.get("unchanged", 0)
            if built == 0 and unchanged > 0:
                summary += f"\n实体: 无变更（跳过 {unchanged} 篇）"
            elif built > 0:
                summary += f"\n实体: 更新 {built} 篇"
                if unchanged:
                    summary += f"，跳过 {unchanged} 篇"
    if data.get("entities_error"):
        summary += f"\n实体错误: {data['entities_error']}"
    return summary
