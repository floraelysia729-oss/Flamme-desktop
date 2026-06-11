"""FastAPI 入口 — CORS + 路由注册"""

import logging
import sys
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.api.routes import activity, chat, documents, graph, ingest, pipeline, resolve, status
from src.deps_check import check_ingest_dependencies, format_missing_deps_log
from src.infra.log_config import configure_logging, log_file_path

_log_path = configure_logging()
logger = logging.getLogger(__name__)

app = FastAPI(title="Flamme", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {"name": "Flamme", "status": "ok"}


app.include_router(chat.router, prefix="/api")
app.include_router(documents.router, prefix="/api")
app.include_router(graph.router, prefix="/api")
app.include_router(ingest.router, prefix="/api")
app.include_router(status.router, prefix="/api")
app.include_router(pipeline.router, prefix="/api")
app.include_router(activity.router, prefix="/api")
app.include_router(resolve.router, prefix="/api")


@app.on_event("startup")
def _log_ingest_dependencies() -> None:
    missing = check_ingest_dependencies()
    if missing:
        logger.warning(format_missing_deps_log(missing))
    else:
        logger.info(
            "摄入依赖就绪（jieba%s）",
            ", comtypes" if sys.platform == "win32" else "",
        )
    logger.info("API 已启动 — 日志文件: %s", log_file_path())


def main():
    configure_logging()
    uvicorn.run(
        "src.api.app:app",
        host="0.0.0.0",
        port=8765,
        reload=False,
        log_config=None,
    )


if __name__ == "__main__":
    main()
