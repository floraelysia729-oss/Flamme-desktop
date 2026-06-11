"""具体 Worker 实现 — Ingest / Query / Lint / BatchTag

每个 Worker 只处理自己类型的 task_queue 任务。
"""

import hashlib
import json
import logging
import os
import re
from pathlib import Path

logger = logging.getLogger(__name__)

from src.agent.ingest_stages import (
    finalize_stages,
    initial_stages_for_path,
    mark_failed,
    mark_ok,
    mark_running,
    mark_skipped,
)
from src.agent.worker import BaseWorker
from src.db.client import SQLiteClient
from src.tools.interfaces import ToolResult
from src.tools.sync import SOURCE_LEVEL, is_source_doc
from src.vault.binary_paths import find_sibling_pdf
from src.infra.log_config import backend_root, log_file_path


class IngestWorker(BaseWorker):
    """摄入 Worker — 解析 .md 文件并写入知识库"""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._current_task_id: int | None = None
        self._stages: list[dict] = []

    @property
    def worker_type(self) -> str:
        return "ingest"

    def _report(self, message: str | None = None) -> None:
        if self._current_task_id is not None:
            self._db.update_task_progress(
                self._current_task_id,
                stages=self._stages,
                message=message,
            )

    def _run_claimed_task(self, task: dict) -> dict:
        """执行已认领任务，上报分阶段进度并返回结构化结果"""
        self._current_task_id = task["id"]
        path = task.get("payload", {}).get("path", "")
        self._stages = initial_stages_for_path(path)
        self._report()
        try:
            result = self._execute_ingest(task.get("payload", {}))
            if isinstance(result, str):
                result = {"message": result, "stages": self._stages}
            else:
                result.setdefault("stages", self._stages)
            self._db.complete_task(task["id"], {"result": result})
            task["_result"] = result
            task["_status"] = "done"
            logger.info(
                "Worker[%s] task %s done (type=%s)",
                self._worker_id,
                task.get("id"),
                task.get("type"),
            )
        except Exception as e:
            running_id = next(
                (s["id"] for s in self._stages if s.get("status") == "running"),
                self._stages[0]["id"] if self._stages else "pdf_parse",
            )
            self._stages = mark_failed(self._stages, running_id, str(e))
            self._report(str(e))
            self._db.fail_task(task["id"], str(e))
            task["_error"] = str(e)
            task["_status"] = "failed"
            logger.error(
                "[INGEST] Worker[%s] task %s FAILED (type=%s): %s",
                self._worker_id,
                task.get("id"),
                task.get("type"),
                e,
                exc_info=True,
            )
        finally:
            self._current_task_id = None
        return task

    def _execute_task(self, payload: dict) -> str | dict:
        return self._execute_ingest(payload)

    def _execute_ingest(self, payload: dict) -> dict:
        path = payload.get("path", "")

        if not path:
            raise ValueError("未指定文件路径")

        logger.info(
            "[INGEST] 开始 path=%s vault=%s llm=%s log=%s",
            path,
            self._db._vault_path or "(none)",
            "yes" if self._llm else "NO",
            log_file_path(),
        )

        relpath = path.replace("\\", "/")
        if self._db._vault_path and os.path.isabs(path):
            relpath = self._db._norm(path)
        if not is_source_doc(relpath):
            msg = (
                f"跳过: {relpath} 是系统 wiki 页（entity/topic 等），"
                "由摄入管道自动生成，不可手动摄入"
            )
            self._stages = finalize_stages(self._stages)
            return {"message": msg, "stages": self._stages}

        if not os.path.isabs(path) and self._db._vault_path:
            path = os.path.join(self._db._vault_path, path)

        original_ppt = path
        if path.lower().endswith((".ppt", ".pptx")):
            src_ppt = Path(path)
            existing = find_sibling_pdf(src_ppt)
            if existing is not None:
                logger.info("[PPT→PDF] 复用同目录 PDF: %s → %s", src_ppt.name, existing.name)
                self._stages = mark_skipped(self._stages, "ppt_to_pdf", "复用已有 PDF")
                self._report()
                path = str(existing)
            else:
                self._stages = mark_running(self._stages, "ppt_to_pdf")
                self._report()
                logger.info("[PPT→PDF] 开始转换: %s", src_ppt)
                pdf_path = self._ppt_to_pdf(path)
                if not pdf_path:
                    raise ValueError(
                        f"PPT 转 PDF 失败: {original_ppt}（请查看日志 {log_file_path()}；"
                        "需安装 PowerPoint + pip install comtypes）"
                    )
                self._stages = mark_ok(self._stages, "ppt_to_pdf")
                self._report()
                path = pdf_path

        if path.endswith(".excalidraw.md"):
            return self._handle_excalidraw(path)
        if path.lower().endswith((".pdf", ".doc", ".docx")):
            return self._handle_pdf(path)
        return self._handle_markdown(path)

    def _handle_markdown(self, path: str) -> dict:
        parser = self._tools.get("markdown_parser")
        if not parser:
            raise ValueError("markdown_parser 未注册")

        self._stages = mark_running(self._stages, "parse_md")
        self._report()
        parsed = self._tool_exec(parser, {"path": path})
        if "error" in parsed:
            raise ValueError(parsed["error"])
        self._stages = mark_ok(self._stages, "parse_md")
        self._report()

        metadata = parsed.get("metadata", {})
        content = parsed.get("content", "")

        if "title" not in metadata:
            metadata["title"] = os.path.splitext(os.path.basename(path))[0]
        if "level" not in metadata:
            metadata["level"] = SOURCE_LEVEL

        content_hash = self._compute_hash(content)
        relpath = self._db._norm(path) if self._db._vault_path else path

        self._stages = mark_running(self._stages, "index")
        self._report()
        self._db.put_document({
            "path": relpath,
            "title": metadata.get("title", ""),
            "level": metadata.get("level", SOURCE_LEVEL),
            "status": metadata.get("status", "draft"),
            "tags": metadata.get("tags", []),
            "word_count": len(content),
            "content_hash": content_hash,
        })
        self._stages = mark_ok(self._stages, "index")
        self._report()

        self._stages = mark_running(self._stages, "embed")
        self._report()
        embedded = self._auto_embed(relpath, content, content_hash)
        self._stages = mark_ok(self._stages, "embed") if embedded else mark_skipped(self._stages, "embed", "无变更")
        self._report()

        entity_info = self._run_entity_stage(Path(path), relpath, content_hash)
        msg = f"已导入: {os.path.basename(path)}{entity_info}"
        return {"message": msg, "stages": self._stages}

    def _ppt_to_pdf(self, ppt_path: str) -> str | None:
        """将 PPT/PPTX 转为 PDF（同目录），返回 PDF 绝对路径；失败返回 None"""
        src = Path(ppt_path)
        existing = find_sibling_pdf(src)
        if existing is not None:
            logger.info("PDF already exists: %s", existing)
            return str(existing)

        pdf_path = src.with_suffix(".pdf")
        logger.info("[PPT→PDF] 转换 %s → %s", src, pdf_path)

        # Windows: 子进程 COM，避免 Worker 线程 CoInitialize 不稳定
        if os.name == "nt":
            if self._ppt_to_pdf_subprocess(src, pdf_path):
                return str(pdf_path)
            logger.warning("[PPT→PDF] 子进程失败，尝试线程内 COM …")

        # 回退：当前线程 COM（非 Windows 或子进程失败）
        pythoncom = None
        try:
            import comtypes.client
            import pythoncom as _pythoncom
            pythoncom = _pythoncom
            pythoncom.CoInitialize()
            powerpoint = comtypes.client.CreateObject("Powerpoint.Application")
            deck = powerpoint.Presentations.Open(str(src.resolve()), WithWindow=False)
            deck.SaveAs(str(pdf_path.resolve()), 32)  # ppSaveAsPDF
            deck.Close()
            try:
                powerpoint.Quit()
            except Exception:
                pass
            if pdf_path.exists() and pdf_path.stat().st_size > 0:
                logger.info("PPT→PDF done: %s", pdf_path.name)
                return str(pdf_path)
            logger.error("PPT→PDF: SaveAs returned but PDF not found")
        except Exception as e:
            logger.warning("[PPT→PDF] PowerPoint COM 失败: %s，尝试 LibreOffice …", e, exc_info=True)
        finally:
            if pythoncom is not None:
                try:
                    pythoncom.CoUninitialize()
                except Exception:
                    pass

        # 回退 LibreOffice
        try:
            import subprocess
            result = subprocess.run(
                ["soffice", "--headless", "--convert-to", "pdf", "--outdir",
                 str(src.parent), str(src)],
                capture_output=True, text=True, timeout=120,
            )
            if result.returncode == 0 and pdf_path.exists():
                logger.info("LibreOffice PPT→PDF done: %s", pdf_path.name)
                return str(pdf_path)
            logger.error(
                "[PPT→PDF] LibreOffice 失败 code=%s stderr=%s",
                result.returncode,
                (result.stderr or "")[:800],
            )
        except Exception as e:
            logger.error("[PPT→PDF] LibreOffice 不可用: %s", e)

        logger.error("[PPT→PDF] 全部方式失败: %s", src)
        return None

    @staticmethod
    def _ppt_to_pdf_subprocess(src: Path, pdf_path: Path) -> bool:
        """在独立进程中运行 PowerPoint COM"""
        import subprocess
        import sys

        root = backend_root()
        cmd = [
            sys.executable,
            "-m",
            "src.tools.ppt_to_pdf_com",
            str(src.resolve()),
            str(pdf_path.resolve()),
        ]
        logger.info("[PPT→PDF] 子进程 cwd=%s cmd=%s", root, " ".join(cmd[:3]) + " …")
        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=180,
                cwd=str(root),
            )
            out = (result.stdout or "").strip()
            err = (result.stderr or "").strip()
            if result.returncode == 0 and pdf_path.is_file() and pdf_path.stat().st_size > 0:
                logger.info("[PPT→PDF] 子进程成功: %s (%d bytes)", pdf_path.name, pdf_path.stat().st_size)
                return True
            logger.error(
                "[PPT→PDF] 子进程失败 code=%s stdout=%s stderr=%s",
                result.returncode,
                out[:500],
                err[:800],
            )
        except Exception as e:
            logger.error("[PPT→PDF] 子进程异常: %s", e, exc_info=True)
        return False

    def _handle_pdf(self, path: str) -> dict:
        logger.info("[PDF] MinerU 解析开始: %s", path)
        tool = self._tools.get("pdf_parse")
        if not tool:
            raise ValueError("pdf_parse 未注册（请在设置 → API 填写 MinerU Token）")
        has_token = bool(getattr(tool, "_token", ""))
        logger.info("[PDF] pdf_parse 已注册 mineru_token=%s", "yes" if has_token else "NO")

        pdf_detail = "上传中…"

        def on_pdf_progress(extracted: int, total: int) -> None:
            nonlocal pdf_detail
            pdf_detail = f"{extracted}/{total} 页"
            self._stages = mark_running(self._stages, "pdf_parse", pdf_detail)
            self._report()

        self._stages = mark_running(self._stages, "pdf_parse", pdf_detail)
        self._report()
        parsed = self._tool_exec(tool, {"path": path, "on_progress": on_pdf_progress})
        if "error" in parsed:
            raise ValueError(f"PDF 解析失败: {parsed['error']}")

        markdown = parsed.get("markdown", "")
        if not markdown:
            raise ValueError("PDF 解析结果为空（MinerU 未返回 Markdown）")
        self._stages = mark_ok(self._stages, "pdf_parse", pdf_detail if "/" in pdf_detail else "完成")
        self._report()

        self._stages = mark_running(self._stages, "save_converted")
        self._report()
        saved_to = self._save_converted(path, markdown)
        logger.info("[PDF] 已保存 converted: %s (%d chars)", saved_to, len(markdown))
        self._stages = mark_ok(self._stages, "save_converted")
        self._report()

        content_hash = self._compute_hash(markdown)
        relpath = self._db._norm(path) if self._db._vault_path else path

        self._stages = mark_running(self._stages, "index")
        self._report()
        self._db.put_document({
            "path": relpath,
            "title": os.path.splitext(os.path.basename(path))[0],
            "level": SOURCE_LEVEL,
            "status": "draft",
            "tags": [],
            "word_count": len(markdown),
            "content_hash": content_hash,
        })
        self._stages = mark_ok(self._stages, "index")
        self._report()

        self._stages = mark_running(self._stages, "embed")
        self._report()
        embedded = self._auto_embed(relpath, markdown, content_hash)
        self._stages = mark_ok(self._stages, "embed") if embedded else mark_skipped(self._stages, "embed", "无变更")
        self._report()

        entity_info = self._run_entity_stage(saved_to, relpath, content_hash)

        logger.info("[INGEST] 完成 PDF: %s", path)
        msg = f"已导入 PDF: {os.path.basename(path)} ({len(markdown)} chars{entity_info})"
        return {"message": msg, "stages": self._stages}

    def _handle_excalidraw(self, path: str) -> dict:
        tool = self._tools.get("excalidraw_ocr")
        if not tool:
            raise ValueError("excalidraw_ocr 未注册（需配置 OCR_API_KEY 或 EMBED_API_KEY）")
        self._stages = mark_running(self._stages, "ocr")
        self._report()
        parsed = self._tool_exec(tool, {"path": path})
        if "error" in parsed:
            raise ValueError(f"Excalidraw OCR 失败: {parsed['error']}")
        ocr_path = parsed.get("ocr_path", "")
        self._stages = mark_ok(self._stages, "ocr")
        self._report()
        msg = f"已 OCR: {path} → {ocr_path} ({parsed.get('chars', '?')} chars)"
        return {"message": msg, "stages": self._stages}

    def _auto_embed(self, doc_path: str, content: str, content_hash: str) -> bool:
        from src.tools.embed_index import embed_one
        return embed_one(
            self._db, self._llm, self._embedding_store,
            doc_path, content, content_hash, self._llm_queue,
        )

    @staticmethod
    def _compute_hash(text: str) -> str:
        return hashlib.sha256(text.encode("utf-8")).hexdigest()

    def _save_converted(self, path: str, markdown: str) -> Path:
        """保存 MinerU/PDF 转换结果到 .flamme/converted/{stem}.md"""
        from src.tools.paths import converted_dir, source_dir_for_path
        vault = Path(self._db._vault_path)
        source_dir = source_dir_for_path(vault, Path(path))
        conv = converted_dir(source_dir)
        stem = Path(path).stem
        out = conv / f"{stem}.md"
        out.write_text(markdown, encoding="utf-8")
        return out

    def _run_entity_stage(self, file_path: Path, track_relpath: str, content_hash: str) -> str:
        """实体抽取阶段（Markdown / PDF converted 共用）。"""
        entity_info = ""
        if not self._llm:
            self._stages = mark_skipped(self._stages, "entities", "未配置 LLM")
            self._report()
            logger.warning("[ENTITY] 跳过: 未配置 LLM API Key")
            return entity_info

        from src.tools.entity_sync import run_entity_extract

        self._stages = mark_running(self._stages, "entities")
        self._report()
        llm_model = getattr(self._llm, "_model", None)
        result = run_entity_extract(
            self._db._vault_path,
            file_path,
            self._llm._client,
            llm_model,
            track_relpath=track_relpath,
            content_hash=content_hash,
        )
        if result.get("error"):
            entity_info = f", 实体生成失败: {result['error']}"
            self._stages = mark_failed(self._stages, "entities", result["error"])
            logger.warning("[ENTITY] 失败: %s", result["error"])
        elif result.get("skipped"):
            reason = result.get("reason") or "未识别术语"
            self._stages = mark_skipped(self._stages, "entities", reason)
        else:
            count = result.get("entity_count", 0)
            entity_info = f", {count} 个实体页已创建"
            self._stages = mark_ok(self._stages, "entities", f"{count} 个")
            logger.info("[ENTITY] 完成: %d 个实体", count)
        self._report()
        return entity_info


class QueryWorker(BaseWorker):
    """查询 Worker — 语义检索 + LLM 生成回答"""

    @property
    def worker_type(self) -> str:
        return "query"

    def _execute_task(self, payload: dict) -> str:
        question = payload.get("question", "")
        if not question:
            return "错误: 空查询"

        if not self._llm:
            return "错误: LLM 未配置"

        # 语义检索
        context_parts = []
        if self._embedding_store and self._embedding_store.count() > 0:
            context_parts = self._semantic_context(question)

        # 退回全量文档列表（含正文摘要）
        if not context_parts:
            docs = self._db.list_documents()
            parser = self._tools.get("markdown_parser") if self._tools else None
            for doc in docs[:10]:
                snippet = ""
                if parser:
                    parsed = self._tool_exec(parser, {"path": self._db.resolve(doc["path"])})
                    if "error" not in parsed:
                        snippet = parsed.get("content", "")[:500]
                context_parts.append(f"- [{doc['title']}] {snippet}")

        context = "\n".join(context_parts) if context_parts else "无文档"

        messages = [
            {"role": "system", "content": f"你是知识库助手。以下是知识库中的相关内容，请基于这些内容回答用户问题。如果内容不足以回答，请明确说明。\n\n{context}"},
            {"role": "user", "content": question},
        ]

        return self._call_llm(self._llm.complete, messages)

    def _semantic_context(self, question: str) -> list[str]:
        try:
            embeddings = self._call_llm(self._llm.embed, [question])
            query_vector = embeddings[0]
            results = self._embedding_store.search(query_vector, top_k=5)
            parser = self._tools.get("markdown_parser") if self._tools else None
            context = []
            for r in results:
                doc = self._db.get_document(r["doc_id"])
                if not doc:
                    continue
                content_snippet = ""
                if parser:
                    parsed = self._tool_exec(parser, {"path": self._db.resolve(r["doc_id"])})
                    if "error" not in parsed:
                        full_content = parsed.get("content", "")
                        content_snippet = full_content[:1500]
                entry = f"## {doc['title']} (相关度: {r['score']:.2f})\n{content_snippet}"
                context.append(entry)
            return context
        except Exception:
            return []


class LintWorker(BaseWorker):
    """Lint Worker — 知识库完整性检查"""

    BINARY_EXTS = (".pdf", ".doc", ".docx", ".ppt", ".pptx")

    @property
    def worker_type(self) -> str:
        return "lint"

    def _is_source_doc(self, path: str) -> bool:
        return is_source_doc(path)

    @staticmethod
    def _is_binary(path: str) -> bool:
        return path.lower().endswith(LintWorker.BINARY_EXTS)

    def _execute_task(self, payload: dict) -> str:
        docs = self._db.list_documents()
        vault = self._db._vault_path
        issues = []

        def _abs(relpath: str) -> str:
            return os.path.join(vault, relpath) if vault else relpath

        # ── 1. DB 记录 vs 实际文件 ──
        missing_files = []
        for doc in docs:
            if not os.path.isfile(_abs(doc["path"])):
                missing_files.append(doc["path"])
        if missing_files:
            issues.append(f"[文件缺失] {len(missing_files)} 个 DB 记录指向不存在的文件:")
            for f in missing_files[:10]:
                issues.append(f"  - {f}")

        # ── 2. 源文档 frontmatter 检查 ──
        fm_issues = []
        for doc in docs:
            if not self._is_source_doc(doc["path"]):
                continue

            abs_path = _abs(doc["path"])
            if not os.path.isfile(abs_path):
                continue  # 已在上面报告

            # 二进制文件跳过 frontmatter 检查
            if self._is_binary(abs_path):
                continue

            # 读文件验证 frontmatter
            try:
                text = open(abs_path, encoding="utf-8").read()
            except Exception:
                fm_issues.append(f"[读失败] {doc['path']}")
                continue

            if not text.startswith("---"):
                fm_issues.append(f"[无frontmatter] {doc['path']}")
                continue

            fm_end = text.find("---", 3)
            if fm_end < 0:
                fm_issues.append(f"[frontmatter未闭合] {doc['path']}")
                continue

            # 检查 body 中是否有 orphan tags 块
            body = text[fm_end + 3:]
            if re.search(r'^---\s*\n\s*tags:', body, re.MULTILINE):
                fm_issues.append(f"[双frontmatter] {doc['path']}")

            # 检查 tags（从文件内容而非 DB）
            fm_text = text[3:fm_end]
            has_tags = bool(re.search(r'tags:\s*(\S|\n\s*-)', fm_text))
            if not has_tags:
                fm_issues.append(f"[缺tags] {doc['path']}")

        if fm_issues:
            issues.append(f"[Frontmatter] {len(fm_issues)} 个问题:")
            for i in fm_issues[:20]:
                issues.append(f"  - {i}")
            if len(fm_issues) > 20:
                issues.append(f"  ... 还有 {len(fm_issues) - 20} 个")

        # ── 3. .flamme/ 产物完整性 ──
        flamme_issues = self._check_flamme_artifacts(docs, vault)
        issues.extend(flamme_issues)

        # ── 4. 图谱节点 vs 页面 ──
        graph_issues = self._check_graph_nodes(docs)
        issues.extend(graph_issues)

        if not issues:
            return f"Lint 通过: {len(docs)} 个文档，无问题"
        return f"Lint 发现 {len(docs)} 个文档中的问题:\n" + "\n".join(f"  - {i}" for i in issues)

    def _check_flamme_artifacts(self, docs: list[dict], vault: str) -> list[str]:
        """检查二进制文件的 .flamme/converted/ 与 vault/entities/ 产物"""
        if not vault:
            return []

        from src.tools.paths import source_dir_for_path, converted_dir, entities_dir
        vault_path = Path(vault)

        missing_converted = []

        for doc in docs:
            doc_path = doc["path"]
            abs_path = Path(self._db.resolve(doc_path))

            if not self._is_binary(doc_path):
                continue

            source_dir = source_dir_for_path(vault_path, abs_path)
            conv = converted_dir(source_dir)
            conv_md = conv / f"{abs_path.stem}.md"

            if not conv_md.exists():
                missing_converted.append(doc_path)

        issues = []
        if missing_converted:
            issues.append(f"[转换缺失] {len(missing_converted)} 个二进制文件未生成 .flamme/converted/:")
            for f in missing_converted[:15]:
                issues.append(f"  - {f}")
            if len(missing_converted) > 15:
                issues.append(f"  ... 还有 {len(missing_converted) - 15} 个")
        has_binary = any(self._is_binary(d["path"]) for d in docs)
        if has_binary:
            ent_dir = entities_dir(vault_path)
            if ent_dir.exists() and not any(ent_dir.glob("*.md")):
                issues.append("[实体缺失] vault/entities/ 为空（二进制摄入后应生成实体页）")
        return issues

    def _check_graph_nodes(self, docs: list[dict]) -> list[str]:
        """检查图谱中有节点但无对应页面的情况"""
        graph_tool = self._tools.get("graph_query") if self._tools else None
        if not graph_tool:
            return []

        # 从工具获取默认 graph 路径
        graph_path = getattr(graph_tool, "_default_graph_path", "")
        if not graph_path or not os.path.isfile(graph_path):
            return []

        try:
            import json as _json
            raw = _json.loads(open(graph_path, encoding="utf-8").read())
        except Exception:
            return []

        nodes = raw.get("nodes", {})
        if not nodes:
            return []

        # 从 edges 计算 degree
        from collections import Counter
        degree = Counter()
        for edge in raw.get("edges", []):
            degree[edge.get("source", "")] += 1
            degree[edge.get("target", "")] += 1

        # 建立已有页面的 path 集合（归一化后的相对路径）
        known_paths = set()
        known_titles = set()
        for doc in docs:
            known_paths.add(doc["path"])
            if doc.get("title"):
                known_titles.add(doc["title"].lower())

        # 检查图谱节点是否有对应页面
        orphans = []
        for nid, attrs in nodes.items():
            source = attrs.get("source_file", "")
            node_type = attrs.get("type", "")
            label = attrs.get("label", nid)
            deg = degree.get(nid, 0)

            # 有 source_file 的节点：归一化后比较
            if source:
                rel_source = self._db._norm(source)
                if rel_source not in known_paths and not os.path.isfile(source):
                    orphans.append(f"{label} (type={node_type}, degree={deg})")
            # 无 source_file 的实体节点（degree >= 5）：检查标题
            elif deg >= 5 and label.lower() not in known_titles:
                orphans.append(f"{label} (type={node_type}, degree={deg}, 无实体页)")

        issues = []
        if orphans:
            issues.append(f"[图谱孤立节点] {len(orphans)} 个图谱节点无对应页面:")
            for o in orphans[:15]:
                issues.append(f"  - {o}")
            if len(orphans) > 15:
                issues.append(f"  ... 还有 {len(orphans) - 15} 个")

        return issues


class BatchTagWorker(BaseWorker):
    """批量标签修复 Worker — LLM 为缺标签文档补全 tags"""

    @property
    def worker_type(self) -> str:
        return "batch_tag"

    def _execute_task(self, payload: dict) -> str:
        doc_path = payload.get("path", "")
        if not doc_path:
            return "错误: 未指定文件路径"

        # 二进制文件无法写入 frontmatter，跳过
        if doc_path.lower().endswith((".pdf", ".doc", ".docx", ".ppt", ".pptx")):
            return f"跳过（二进制文件）: {doc_path}"

        # 1. 读文件
        p = __import__("pathlib").Path(doc_path)
        if not p.exists():
            return f"文件不存在: {doc_path}"

        raw = p.read_text(encoding="utf-8")

        # 解析 frontmatter
        fm_tags, content = self._parse_frontmatter_tags(raw)

        # 已有标签则跳过
        if fm_tags:
            return f"跳过（已有 {len(fm_tags)} 个标签）: {doc_path}"

        # 2. LLM 补标签
        if not self._llm:
            return f"跳过（LLM 未配置）: {doc_path}"

        new_tags = self._llm_suggest_tags(doc_path, content)
        if not new_tags:
            return f"LLM 未返回标签: {doc_path}"

        # 3. 写回 frontmatter
        updated = self._inject_tags(raw, new_tags)
        p.write_text(updated, encoding="utf-8")

        # 4. 更新 DB
        self._db.put_document({
            "path": doc_path,
            "title": __import__("os").path.splitext(__import__("os").path.basename(doc_path))[0],
            "tags": new_tags,
            "word_count": len(content),
            "content_hash": hashlib.sha256(content.encode("utf-8")).hexdigest(),
        })

        return f"已补标签 {new_tags}: {doc_path}"

    @staticmethod
    def _parse_frontmatter_tags(text: str) -> tuple[list[str], str]:
        """提取 frontmatter 中的 tags 和正文（纯字符串解析，不依赖 yaml）"""
        if not text.startswith("---"):
            return [], text
        fm_end = text.find("---", 3)
        if fm_end < 0:
            return [], text
        fm_text = text[3:fm_end]
        content = text[fm_end + 3:].strip()

        # 字符串级别找 tags: 行
        tags = []
        in_tags = False
        for line in fm_text.split("\n"):
            stripped = line.strip()
            if stripped.startswith("tags:"):
                in_tags = True
                val = stripped[5:].strip()
                if val == "[]" or not val:
                    continue
                # inline format: tags: [a, b]
                if val.startswith("[") and val.endswith("]"):
                    tags = [t.strip().strip("\"'") for t in val[1:-1].split(",") if t.strip()]
                    break
                # tags: a  (single value)
                tags = [val.strip("\"'")]
                continue
            if in_tags and stripped.startswith("- "):
                tags.append(stripped[2:].strip("\"'"))
            elif in_tags and stripped:
                in_tags = False

        return [t for t in tags if t], content

    @staticmethod
    def _clean_orphan_tags_blocks(body: str) -> str:
        """清理正文中所有孤立的 --- tags: ... --- 块"""
        import re as _re
        # 匹配正文中的 --- tags: ... --- 块（可能跨多行）
        pattern = _re.compile(
            r"\n---\s*\n\s*tags:\s*\n(?:\s*- .+\n)*\s*---",
            _re.MULTILINE,
        )
        return pattern.sub("", body).strip()

    @staticmethod
    def _inject_tags(text: str, tags: list[str]) -> str:
        """将 tags 注入 frontmatter（纯字符串操作，不经过 YAML round-trip）"""
        tag_block = "tags:\n" + "\n".join(f"  - {t}" for t in tags)

        # 无 frontmatter → 新建
        if not text.startswith("---"):
            return f"---\n{tag_block}\n---\n{text}"

        fm_end = text.find("---", 3)
        if fm_end < 0:
            return text

        fm_text = text[3:fm_end]
        body = BatchTagWorker._clean_orphan_tags_blocks(text[fm_end + 3:])

        # 在 frontmatter 中替换或追加 tags
        lines = fm_text.split("\n")
        new_lines = []
        skip_old_tags = False
        found = False
        for line in lines:
            stripped = line.strip()
            if stripped.startswith("tags:"):
                new_lines.append(tag_block)
                skip_old_tags = True
                found = True
                continue
            if skip_old_tags and (stripped.startswith("- ") or stripped.startswith("[") or stripped == "[]"):
                continue
            skip_old_tags = False
            new_lines.append(line)
        if not found:
            new_lines.append(tag_block)

        return "---\n" + "\n".join(new_lines) + "\n---\n" + body

    def _llm_suggest_tags(self, doc_path: str, content: str) -> list[str]:
        """调用 LLM 为文档推荐标签"""
        snippet = content[:2000] if content else "(空文件)"
        filename = os.path.basename(doc_path)

        messages = [
            {"role": "system", "content": (
                "你是知识库标签助手。根据文件路径和内容，推荐 3-8 个标签。\n"
                "只返回 JSON 数组，例如: [\"微积分\", \"数学\", \"极值\"]\n"
                "不要解释，只返回 JSON。"
            )},
            {"role": "user", "content": f"文件: {filename}\n路径: {doc_path}\n\n{snippet}"},
        ]
        try:
            resp = self._call_llm(self._llm.complete, messages, max_tokens=256, temperature=0)
            # 提取 JSON
            match = re.search(r'\[.*?\]', resp, re.DOTALL)
            if match:
                tags = json.loads(match.group())
                return [t for t in tags if isinstance(t, str) and len(t) < 30]
        except Exception:
            pass
        return []
