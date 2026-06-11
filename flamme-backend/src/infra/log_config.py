"""Flamme API 日志 — 控制台 + flamme-backend/logs/flamme-api.log"""

from __future__ import annotations

import logging
import os
import sys
from logging.handlers import RotatingFileHandler
from pathlib import Path


_CONFIGURED = False
_LOG_FILE: Path | None = None


def backend_root() -> Path:
    env = os.environ.get("FLAMME_BACKEND_DIR", "").strip()
    if env:
        return Path(env)
    # src/infra/log_config.py → flamme-backend
    return Path(__file__).resolve().parents[2]


def log_file_path() -> Path:
    global _LOG_FILE
    if _LOG_FILE is None:
        custom = os.environ.get("FLAMME_LOG_FILE", "").strip()
        if custom:
            _LOG_FILE = Path(custom)
        else:
            _LOG_FILE = backend_root() / "logs" / "flamme-api.log"
    return _LOG_FILE


def configure_logging() -> Path:
    """配置根 logger（幂等）。返回日志文件路径。"""
    global _CONFIGURED
    log_path = log_file_path()
    log_path.parent.mkdir(parents=True, exist_ok=True)

    level_name = os.environ.get("FLAMME_LOG_LEVEL", "INFO").upper()
    level = getattr(logging, level_name, logging.INFO)

    fmt = "%(asctime)s %(levelname)s [%(name)s] %(message)s"
    datefmt = "%H:%M:%S"

    root = logging.getLogger()
    if _CONFIGURED:
        root.setLevel(level)
        return log_path

    root.setLevel(level)

    stream = logging.StreamHandler(sys.stderr)
    stream.setLevel(level)
    stream.setFormatter(logging.Formatter(fmt, datefmt=datefmt))

    file_handler = RotatingFileHandler(
        log_path,
        maxBytes=5 * 1024 * 1024,
        backupCount=3,
        encoding="utf-8",
    )
    file_handler.setLevel(level)
    file_handler.setFormatter(logging.Formatter(fmt, datefmt=datefmt))

    root.handlers.clear()
    root.addHandler(stream)
    root.addHandler(file_handler)

    # 降低噪声
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("uvicorn.access").setLevel(logging.INFO)

    _CONFIGURED = True
    logging.getLogger(__name__).info(
        "日志已启用 level=%s file=%s python=%s",
        level_name,
        log_path,
        sys.executable,
    )
    return log_path
