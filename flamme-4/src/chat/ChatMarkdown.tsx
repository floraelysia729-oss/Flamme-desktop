import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { resolveLink } from '../api/bridge'
import { useConnectionStore } from '../api/connection'
import { getFileStore } from '../files'
import { useWorkspaceStore } from '../shared/workspaceStore'
import { renderChatMarkdown } from './renderMarkdown'
import { parseWikilinkTarget, resolveDocLinkFromElement } from './resolveVaultLink'

interface Props {
  content: string
}

export default function ChatMarkdown({ content }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [linkHint, setLinkHint] = useState('')
  const html = useMemo(() => renderChatMarkdown(content), [content])

  const handleDocClick = useCallback(async (el: HTMLElement) => {
    const nodes = getFileStore().nodes
    let path = resolveDocLinkFromElement(el, nodes)
    if (!path) {
      const target =
        el.getAttribute('data-doc-target') ??
        el.getAttribute('data-doc-href') ??
        el.textContent?.trim() ??
        ''
      const { connected } = useConnectionStore.getState()
      if (connected && target) {
        try {
          const hit = await resolveLink(parseWikilinkTarget(target))
          if (hit.found && hit.path) path = hit.path
        } catch {
          /* 回退失败，沿用下方提示 */
        }
      }
    }
    if (!path) {
      setLinkHint('未在侧栏文件树中找到该笔记')
      return
    }
    setLinkHint('')
    try {
      await Promise.resolve(getFileStore().openFile(path))
      useWorkspaceStore.getState().setMode('split')
    } catch {
      setLinkHint('打开文件失败')
    }
  }, [])

  useEffect(() => {
    const root = containerRef.current
    if (!root) return

    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const link = target.closest<HTMLElement>('.chat-doc-link')
      if (!link || !root.contains(link)) return
      e.preventDefault()
      e.stopPropagation()
      void handleDocClick(link)
    }

    root.addEventListener('click', onClick)
    return () => root.removeEventListener('click', onClick)
  }, [html, handleDocClick])

  if (!html) {
    return <span className="text-[var(--ink-muted-on-glass,var(--ink-muted))]">…</span>
  }

  return (
    <div className="chat-md-wrap">
      <div
        ref={containerRef}
        className="chat-md text-sm leading-relaxed break-words"
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {linkHint && (
        <p className="mt-1 text-[10px] text-[var(--danger)]">{linkHint}</p>
      )}
    </div>
  )
}
