"""摄入相关 Python 依赖自检 — 启动时与 /api/status 共用。"""

from __future__ import annotations

import sys


def check_ingest_dependencies() -> list[dict[str, str]]:
    """返回缺失依赖列表（空 = 就绪）。"""
    missing: list[dict[str, str]] = []

    try:
        import jieba  # noqa: F401
    except ImportError:
        missing.append(
            {
                "package": "jieba",
                "feature": "实体页构建（entities/）",
                "fix": "pip install jieba  或  pip install -e .",
            }
        )

    if sys.platform == "win32":
        try:
            import comtypes  # noqa: F401
        except ImportError:
            missing.append(
                {
                    "package": "comtypes",
                    "feature": "PPT/PPTX → PDF（需已安装 Microsoft PowerPoint）",
                    "fix": "pip install comtypes  或  pip install -e .",
                }
            )

    return missing


def format_missing_deps_log(missing: list[dict[str, str]]) -> str:
    if not missing:
        return ""
    lines = ["摄入依赖未就绪（部分功能将失败）："]
    for item in missing:
        lines.append(f"  - {item['package']}: {item['feature']} → {item['fix']}")
    return "\n".join(lines)
