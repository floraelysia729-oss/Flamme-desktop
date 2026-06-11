import { useEffect, useState } from 'react'
import { isVaultMode } from '../files'
import { useConnectionStore } from '../api/connection'
import { isTauriWebView, tauriInvoke } from '../api/tauri-runtime'

interface Props {
  relativePath: string
  fileName: string
}

export default function PdfViewer({ relativePath, fileName }: Props) {
  const [src, setSrc] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const vaultPath = useConnectionStore((s) => s.vaultPath)

  useEffect(() => {
    let revoked: string | null = null
    setError(null)
    setSrc(null)

    const load = async () => {
      if (isVaultMode() && isTauriWebView()) {
        try {
          const { convertFileSrc } = await import('@tauri-apps/api/core')
          const abs = await tauriInvoke<string>('get_vault_file_absolute_path', {
            path: relativePath,
          })
          setSrc(convertFileSrc(abs))
        } catch (e) {
          setError(e instanceof Error ? e.message : '无法加载 PDF')
        }
        return
      }

      const root = vaultPath.trim().replace(/\\/g, '/').replace(/\/$/, '')
      if (!root) {
        setError('请先配置 Vault 路径（浏览器模式暂不支持本地 PDF）')
        return
      }
      setError('浏览器开发模式请使用 Tauri 桌面版预览 PDF')
    }

    void load()
    return () => {
      if (revoked) URL.revokeObjectURL(revoked)
    }
  }, [relativePath, vaultPath])

  if (error) {
    return (
      <div className="h-full flex items-center justify-center p-6 text-[var(--ink-muted)] text-sm text-center">
        {error}
      </div>
    )
  }

  if (!src) {
    return (
      <div className="h-full flex items-center justify-center text-[var(--ink-muted)] text-sm">
        加载 PDF…
      </div>
    )
  }

  return (
    <iframe
      title={fileName}
      src={src}
      className="w-full h-full min-h-0 border-0 bg-[var(--bg-elevated)]"
    />
  )
}
