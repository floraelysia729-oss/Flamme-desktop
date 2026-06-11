"""Diagnose PPT→PDF COM in worker thread vs subprocess."""
import json
import sys
import threading
import time
from pathlib import Path

LOG = Path(__file__).resolve().parents[1] / "debug-0ee77d.log"


def log(msg: str, data: dict, hid: str):
    payload = {
        "sessionId": "0ee77d",
        "location": "diagnose_ppt.py",
        "message": msg,
        "data": data,
        "hypothesisId": hid,
        "timestamp": int(time.time() * 1000),
    }
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(json.dumps(payload, ensure_ascii=False) + "\n")
    print(msg, data)


def com_in_thread(ppt: str) -> bool:
    ok = False
    err = ""

    def worker():
        nonlocal ok, err
        try:
            import comtypes.client
            import pythoncom

            pythoncom.CoInitialize()
            try:
                pp = comtypes.client.CreateObject("Powerpoint.Application")
                ok = pp is not None
            finally:
                pythoncom.CoUninitialize()
        except Exception as e:
            err = str(e)

    t = threading.Thread(target=worker)
    t.start()
    t.join(timeout=30)
    log("com_in_thread", {"ok": ok, "error": err}, "A")
    return ok


def com_in_main() -> bool:
    err = ""
    try:
        import comtypes.client

        pp = comtypes.client.CreateObject("Powerpoint.Application")
        log("com_in_main", {"ok": True}, "A")
        return True
    except Exception as e:
        err = str(e)
        log("com_in_main", {"ok": False, "error": err}, "A")
        return False


def soffice_on_path() -> bool:
    import shutil

    found = shutil.which("soffice") or shutil.which("soffice.exe")
    log("soffice_path", {"found": found}, "A")
    return bool(found)


if __name__ == "__main__":
    ppt_arg = sys.argv[1] if len(sys.argv) > 1 else ""
    log("start", {"ppt": ppt_arg, "python": sys.executable}, "A")
    com_in_main()
    com_in_thread(ppt_arg or "dummy")
    soffice_on_path()
