$ErrorActionPreference = 'Stop'
$backend = Resolve-Path (Join-Path $PSScriptRoot '..\..\flamme-backend')
Write-Host "Setting up Python backend at $backend"
Push-Location $backend
try {
  if (-not (Test-Path '.venv\Scripts\python.exe')) {
    Write-Host 'Creating .venv ...'
    python -m venv .venv
  }
  Write-Host 'Installing flamme-backend (editable) ...'
  & .\.venv\Scripts\python.exe -m pip install -U pip
  & .\.venv\Scripts\pip.exe install -e .
  Write-Host 'Done. You can now run: pnpm run tauri:dev'
} finally {
  Pop-Location
}
