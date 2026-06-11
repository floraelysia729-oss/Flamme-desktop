# 创建 venv、安装依赖并启动 Flamme 后端
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

if (-not (Test-Path ".venv\Scripts\python.exe")) {
    Write-Host "Creating .venv ..."
    python -m venv .venv
}

# 代理常导致 pip 超时；可按需注释下一行
$env:HTTP_PROXY = ""
$env:HTTPS_PROXY = ""

Write-Host "Installing dependencies (jieba + comtypes on Windows) ..."
.\.venv\Scripts\pip install -e .

Write-Host "Starting API on :8765 ..."
.\.venv\Scripts\python.exe -m src.api.app
