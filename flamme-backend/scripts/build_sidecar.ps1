# Build PyInstaller onedir sidecar -> flamme-4/src-tauri/binaries/flamme-api/
$ErrorActionPreference = 'Stop'

$BackendRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$OutRoot = Join-Path $BackendRoot '..\flamme-4\src-tauri\binaries'
$DistPath = $OutRoot
$WorkPath = Join-Path $BackendRoot 'build\pyinstaller'
$VenvPath = Join-Path $BackendRoot 'build\sidecar-venv'

Write-Host "Backend: $BackendRoot"
Write-Host "Output:  $OutRoot\flamme-api"

if (-not (Test-Path $VenvPath)) {
  python -m venv $VenvPath
}

$Python = Join-Path $VenvPath 'Scripts\python.exe'
$Pip = Join-Path $VenvPath 'Scripts\pip.exe'

& $Python -m pip install -q -e $BackendRoot
& $Python -m pip install -q pyinstaller

if (Test-Path (Join-Path $OutRoot 'flamme-api')) {
  Remove-Item -Recurse -Force (Join-Path $OutRoot 'flamme-api')
}
New-Item -ItemType Directory -Force -Path $OutRoot | Out-Null
New-Item -ItemType Directory -Force -Path $WorkPath | Out-Null

Push-Location $BackendRoot
try {
  & $Python -m PyInstaller `
    (Join-Path $PSScriptRoot 'build_sidecar.spec') `
    --noconfirm `
    --distpath $DistPath `
    --workpath $WorkPath

  if ($LASTEXITCODE -ne 0) {
    throw "PyInstaller failed with exit code $LASTEXITCODE"
  }

  $Exe = Join-Path $OutRoot 'flamme-api\flamme-api.exe'
  if (-not (Test-Path $Exe)) {
    throw "Expected output not found: $Exe"
  }

  Write-Host "Built: $Exe"
}
finally {
  Pop-Location
}
