"""PPT/PPTX → PDF via PowerPoint COM — 在独立子进程中运行，避免 Worker 线程 COM 问题。"""
import logging
import sys
import traceback
from pathlib import Path

logger = logging.getLogger(__name__)


def convert(ppt: str, pdf: str) -> int:
    import comtypes.client

    app = None
    try:
        src = Path(ppt).resolve()
        out = Path(pdf).resolve()
        if not src.is_file():
            logger.error("源文件不存在: %s", src)
            return 1
        logger.info("打开 PowerPoint: %s", src.name)
        app = comtypes.client.CreateObject("Powerpoint.Application")
        deck = app.Presentations.Open(str(src), WithWindow=False)
        deck.SaveAs(str(out), 32)  # ppSaveAsPDF
        deck.Close()
        if out.is_file() and out.stat().st_size > 0:
            logger.info("已写出 PDF: %s (%d bytes)", out, out.stat().st_size)
            return 0
        logger.error("SaveAs 完成但 PDF 不存在或为空: %s", out)
        return 2
    except Exception as e:
        logger.error("ppt_to_pdf_com 失败: %s", e)
        traceback.print_exc()
        return 1
    finally:
        if app is not None:
            try:
                app.Quit()
            except Exception:
                pass


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s [ppt_to_pdf_com] %(message)s",
        stream=sys.stderr,
    )
    if len(sys.argv) != 3:
        print("usage: python -m src.tools.ppt_to_pdf_com <input.pptx> <output.pdf>", file=sys.stderr)
        sys.exit(1)
    sys.exit(convert(sys.argv[1], sys.argv[2]))
