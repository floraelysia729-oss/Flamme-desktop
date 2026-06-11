# Create FLAMME.lnk on Windows Desktop; runs tauri:build when exe is missing or stale.
$ErrorActionPreference = 'Stop'

$FlammeRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$ReleaseDir = Join-Path $FlammeRoot 'src-tauri/target/release'

function Find-FlammeExe {
  foreach ($name in @('FLAMME.exe', 'app.exe')) {
    $p = Join-Path $ReleaseDir $name
    if (Test-Path $p) { return (Resolve-Path $p).Path }
  }
  return $null
}

function Get-SourceStamp {
  $candidates = @(
    (Join-Path $FlammeRoot 'src'),
    (Join-Path $FlammeRoot 'src-tauri/src'),
    (Join-Path $FlammeRoot 'src-tauri/Cargo.toml'),
    (Join-Path $FlammeRoot 'src-tauri/tauri.conf.json'),
    (Join-Path $FlammeRoot 'package.json'),
    (Join-Path $FlammeRoot 'index.html')
  )
  $max = [datetime]::MinValue
  foreach ($path in $candidates) {
    if (-not (Test-Path $path)) { continue }
    $item = Get-Item $path
    if ($item.PSIsContainer) {
      Get-ChildItem $path -Recurse -File -ErrorAction SilentlyContinue |
        ForEach-Object {
          if ($_.LastWriteTime -gt $max) { $max = $_.LastWriteTime }
        }
    }
    elseif ($item.LastWriteTime -gt $max) {
      $max = $item.LastWriteTime
    }
  }
  return $max
}

$exe = Find-FlammeExe
$sourceStamp = Get-SourceStamp
$exeStale = [bool]($exe -and ((Get-Item $exe).LastWriteTime -lt $sourceStamp))
$needsBuild = (-not $exe) -or $exeStale

if ($needsBuild) {
  if ($exeStale) {
    Write-Host 'Source newer than exe; running tauri:build...'
  }
  else {
    Write-Host 'No release exe found; running tauri:build (first run may take a while)...'
  }
  Push-Location $FlammeRoot
  try {
    npm run tauri:build
    if ($LASTEXITCODE -ne 0) {
      throw "tauri:build failed with exit code $LASTEXITCODE"
    }
  }
  finally {
    Pop-Location
  }
  $exe = Find-FlammeExe
  if (-not $exe) {
    throw 'Build finished but FLAMME.exe not found. Check Rust/Tauri setup.'
  }
}
else {
  Write-Host 'Release exe is up to date; skipping build.'
}

$desktop = [Environment]::GetFolderPath('Desktop')
$lnk = Join-Path $desktop 'FLAMME.lnk'
$icon = Join-Path $FlammeRoot 'src-tauri/icons/icon.ico'

if (-not (Test-Path $icon)) {
  throw "Icon not found: $icon"
}

$shell = New-Object -ComObject WScript.Shell
$sc = $shell.CreateShortcut($lnk)
$sc.TargetPath = $exe
$sc.WorkingDirectory = Split-Path $exe -Parent
$sc.IconLocation = "$icon,0"
$sc.Description = 'FLAMME'
$sc.Save()

Write-Host "Shortcut created: $lnk"
Write-Host "Target: $exe"
