"""摄入管道阶段模板 — 与前端 anticipatedStages 对齐"""

from __future__ import annotations

import copy


def _pending(stage_id: str, label: str) -> dict:
    return {"id": stage_id, "label": label, "status": "pending"}


def initial_stages_for_path(path: str) -> list[dict]:
    """根据文件路径生成初始阶段列表"""
    norm = path.replace("\\", "/")
    name = norm.split("/")[-1].lower()
    if name.endswith((".ppt", ".pptx")):
        return [
            {"id": "ppt_to_pdf", "label": "PPTX → PDF", "status": "pending"},
            _pending("pdf_parse", "PDF 解析 (MinerU)"),
            _pending("save_converted", "保存 converted.md"),
            _pending("index", "写入文档索引"),
            _pending("embed", "向量嵌入"),
            _pending("entities", "实体 / 主题页"),
        ]
    if name.endswith((".pdf", ".doc", ".docx")):
        return [
            {"id": "pdf_parse", "label": "PDF 解析 (MinerU)", "status": "pending"},
            _pending("save_converted", "保存 converted.md"),
            _pending("index", "写入文档索引"),
            _pending("embed", "向量嵌入"),
            _pending("entities", "实体 / 主题页"),
        ]
    if name.endswith(".excalidraw.md"):
        return [{"id": "ocr", "label": "Excalidraw OCR", "status": "pending"}]
    return [
        {"id": "parse_md", "label": "解析 Markdown", "status": "pending"},
        _pending("index", "写入文档索引"),
        _pending("embed", "向量嵌入"),
        _pending("entities", "实体 / 主题页"),
    ]


def set_stage(
    stages: list[dict],
    stage_id: str,
    status: str,
    detail: str | None = None,
) -> list[dict]:
    """更新单个阶段状态（返回新列表）"""
    out = copy.deepcopy(stages)
    for s in out:
        if s.get("id") == stage_id:
            s["status"] = status
            if detail is not None:
                s["detail"] = detail
            break
    return out


def mark_running(stages: list[dict], stage_id: str, detail: str | None = None) -> list[dict]:
    return set_stage(stages, stage_id, "running", detail)


def mark_ok(stages: list[dict], stage_id: str, detail: str | None = None) -> list[dict]:
    return set_stage(stages, stage_id, "ok", detail)


def mark_skipped(stages: list[dict], stage_id: str, detail: str | None = None) -> list[dict]:
    return set_stage(stages, stage_id, "skipped", detail)


def mark_failed(stages: list[dict], stage_id: str, detail: str | None = None) -> list[dict]:
    return set_stage(stages, stage_id, "failed", detail)


def finalize_stages(stages: list[dict]) -> list[dict]:
    """将未完成的 pending/running 标为 skipped（失败收尾用）"""
    out = copy.deepcopy(stages)
    for s in out:
        if s.get("status") in ("pending", "running"):
            s["status"] = "skipped"
    return out
