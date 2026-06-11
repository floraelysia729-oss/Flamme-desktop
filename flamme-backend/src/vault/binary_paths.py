"""二进制摄入路径 — PPT/PDF 去重与已有 PDF 探测"""

from __future__ import annotations

import os
from pathlib import Path

PPT_EXTS = frozenset({".ppt", ".pptx"})


def is_ppt_path(relpath: str) -> bool:
    return Path(relpath).suffix.lower() in PPT_EXTS


def ppt_pdf_relpath(relpath: str) -> str:
    return str(Path(relpath).with_suffix(".pdf")).replace("\\", "/")


def ppt_sibling_pdf(abs_ppt: Path) -> Path:
    """与 PPT 同目录的 PDF（摄入管道的标准产物位置）"""
    return abs_ppt.with_suffix(".pdf")


def find_sibling_pdf(abs_ppt: Path) -> Path | None:
    """仅检测同目录 PDF；勿把 .flamme/converted/*.pdf 当作已转换，否则会跳过 PPT 且无法继续摄入。"""
    candidate = ppt_sibling_pdf(abs_ppt)
    try:
        if candidate.is_file() and candidate.stat().st_size > 0:
            return candidate.resolve()
    except OSError:
        pass
    return None


# 兼容旧调用名
find_existing_pdf_for_ppt = find_sibling_pdf


def dedupe_binary_queue(vault: Path, relpaths: list[str]) -> list[str]:
    """队列中同 stem 的 PPT 与 PDF 并存时只保留 PDF；磁盘已有同目录 PDF 时去掉 PPT。"""
    pending = {p.replace("\\", "/") for p in relpaths}
    out: list[str] = []
    for p in relpaths:
        norm = p.replace("\\", "/")
        if not is_ppt_path(norm):
            out.append(p)
            continue
        pdf_rel = ppt_pdf_relpath(norm)
        if pdf_rel in pending:
            continue
        abs_ppt = vault / norm.replace("/", os.sep)
        if find_sibling_pdf(abs_ppt) is not None:
            continue
        out.append(p)
    return out
