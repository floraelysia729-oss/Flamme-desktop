import { useEffect, useRef } from 'react'
import { listen } from '@tauri-apps/api/event'
import { isVaultMode } from '../files'
import { isTauriWebView } from '../api/tauri-runtime'
import { useConnectionStore } from '../api/connection'
import { useVaultStore } from './store'

const DEBOUNCE_MS = 300

/** Tauri 模式：监听 Vault 磁盘变更并刷新侧栏；窗口重新聚焦时补刷一次 */
export function useVaultFsSync() {
  const vaultPath = useConnectionStore((s) => s.vaultPath)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!isVaultMode() || !isTauriWebView()) return
    if (!vaultPath.trim()) return

    const scheduleRefresh = () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        void useVaultStore.getState().refreshTree()
      }, DEBOUNCE_MS)
    }

    let unlisten: (() => void) | undefined
    void listen('vault-fs-changed', () => {
      scheduleRefresh()
    }).then((fn) => {
      unlisten = fn
    })

    const onFocus = () => {
      scheduleRefresh()
    }
    window.addEventListener('focus', onFocus)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      unlisten?.()
      window.removeEventListener('focus', onFocus)
    }
  }, [vaultPath])
}
