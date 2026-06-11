# -*- mode: python ; coding: utf-8 -*-
"""Bundle flamme-backend as onedir flamme-api.exe for Tauri resources."""

import sys
from pathlib import Path

from PyInstaller.utils.hooks import collect_data_files, collect_submodules

# SPEC = absolute path to this .spec file (PyInstaller 6+)
spec_dir = Path(SPEC).resolve().parent
backend_root = spec_dir.parent
entry = spec_dir / "pyinstaller_entry.py"

datas = [
    (str(backend_root / "agents"), "agents"),
    (str(backend_root / "src/db/schema.sql"), "src/db"),
    (str(backend_root / ".env.example"), "."),
]
datas += collect_data_files("jieba")
datas += collect_data_files("graphifyy", include_py_files=True)

hiddenimports = (
    collect_submodules("src")
    + collect_submodules("uvicorn")
    + collect_submodules("fastapi")
    + collect_submodules("starlette")
    + collect_submodules("pydantic")
    + [
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.lifespan",
        "uvicorn.lifespan.on",
        "comtypes",
        "comtypes.client",
    ]
)

a = Analysis(
    [str(entry)],
    pathex=[str(backend_root)],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["pytest", "tkinter"],
    noarchive=False,
    optimize=0,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="flamme-api",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="flamme-api",
)
