; 安装/卸载前结束 FLAMME 与 Python sidecar，避免文件被占用导致更新失败
!macro NSIS_HOOK_PREINSTALL
  nsExec::Exec 'taskkill /F /IM FLAMME.exe /T'
  nsExec::Exec 'taskkill /F /IM flamme-api.exe /T'
  Sleep 1000
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  nsExec::Exec 'taskkill /F /IM FLAMME.exe /T'
  nsExec::Exec 'taskkill /F /IM flamme-api.exe /T'
  Sleep 1000
!macroend
