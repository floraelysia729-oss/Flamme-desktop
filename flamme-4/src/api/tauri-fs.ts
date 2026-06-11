import { open } from '@tauri-apps/plugin-dialog'
import type { LocalFsAdapter } from './bridge'
import { isTauriWebView, tauriInvoke, tauriUnavailableMessage, waitForTauriReady } from './tauri-runtime'

/** Tauri 对话框：打开外部 Markdown（registerLocalFs 用） */
export const tauriFsAdapter: LocalFsAdapter = {
  async openFile() {
    if (!isTauriWebView()) return null
    await waitForTauriReady()
    const selected = await open({
      multiple: false,
      directory: false,
      title: '打开 Markdown 文件',
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
    })
    if (!selected || Array.isArray(selected)) return null
    try {
      const [name, content] = await tauriInvoke<[string, string]>('read_external_file', {
        path: selected,
      })
      return { name, content }
    } catch (e) {
      console.warn('[tauri]', tauriUnavailableMessage('read_external_file'), e)
      return null
    }
  },
  async saveFile(_name, content) {
    void content
    return false
  },
}
