import { useState } from 'react'
import { X } from 'lucide-react'
import { previewArchivePath } from './archiveLearnNote'
import type { LearnNote } from './types'

interface Props {
  open: boolean
  note: LearnNote
  archivedNotePath: string | null
  lastArchivedAt: string | null
  onConfirm: (andNewSession: boolean) => void | Promise<void>
  onClose: () => void
  busy?: boolean
  tauriOnly?: boolean
}

export default function EndClassDialog({
  open,
  note,
  archivedNotePath,
  lastArchivedAt,
  onConfirm,
  onClose,
  busy,
  tauriOnly,
}: Props) {
  const [andNew, setAndNew] = useState(false)
  if (!open) return null

  const path = previewArchivePath(note, archivedNotePath)
  const isUpdate = !!archivedNotePath

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4">
      <div
        className="end-class-dialog w-full max-w-md rounded-xl border border-[var(--border)]/60 shadow-xl p-4 text-sm text-[var(--ink-on-glass,var(--ink))]"
        role="dialog"
        aria-labelledby="end-class-title"
      >
        <div className="flex items-center justify-between mb-3">
          <h2 id="end-class-title" className="font-medium">
            {isUpdate ? '更新学习笔记' : '下课存档'}
          </h2>
          <button type="button" className="p-1 rounded hover:bg-white/10" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {tauriOnly && (
          <p className="text-xs text-[var(--danger)] mb-2">仅桌面版可写入 Vault 笔记。</p>
        )}

        <p className="text-xs text-[var(--ink-muted-on-glass,var(--ink-muted))] mb-2">
          主题：<strong className="text-[var(--ink-on-glass,var(--ink))]">{note.rootTopic}</strong>
        </p>
        <p className="text-xs text-[var(--ink-muted-on-glass,var(--ink-muted))] mb-2 break-all">
          路径：<code className="text-[10px] text-[var(--ink-on-glass,var(--ink))]">{path}</code>
        </p>
        {isUpdate && lastArchivedAt && (
          <p className="text-[10px] text-[var(--ink-muted-on-glass,var(--ink-muted))] mb-3">
            上次保存：{new Date(lastArchivedAt).toLocaleString()}
          </p>
        )}

        <label className="flex items-center gap-2 text-xs mb-4 cursor-pointer">
          <input
            type="checkbox"
            checked={andNew}
            onChange={(e) => setAndNew(e.target.checked)}
          />
          保存后开始新课
        </label>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="px-3 py-1.5 text-xs rounded-lg border border-[var(--border)]/60"
            onClick={onClose}
            disabled={busy}
          >
            取消
          </button>
          <button
            type="button"
            className="px-3 py-1.5 text-xs rounded-lg bg-[var(--accent)]/30 ring-1 ring-[var(--accent)]/50"
            disabled={busy || tauriOnly}
            onClick={() => void onConfirm(andNew)}
          >
            {busy ? '保存中…' : isUpdate ? '增量更新' : '保存笔记'}
          </button>
        </div>
      </div>
    </div>
  )
}
