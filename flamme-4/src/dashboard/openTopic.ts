import { getFileStore } from '../files'
import { openFileInEditor } from '../editor/openFileInEditor'

function normPath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.\//, '')
}

/** 在 Vault 树中解析 topic 路径并打开；返回是否成功 */
export async function openTopicDocument(
  topicPath: string | undefined,
  title: string,
  onSwitchToEditor?: () => void,
): Promise<boolean> {
  onSwitchToEditor?.()
  const store = getFileStore()
  const nodes = store.nodes as Record<string, { type?: string }>

  const candidates = new Set<string>()
  if (topicPath) {
    candidates.add(topicPath)
    candidates.add(normPath(topicPath))
  }
  candidates.add(`topics/${title}.md`)
  candidates.add(normPath(`topics/${title}.md`))

  for (const id of candidates) {
    if (nodes[id]?.type === 'file') {
      await openFileInEditor(id)
      return true
    }
  }

  const leaf = topicPath ? normPath(topicPath).split('/').pop() : `${title}.md`
  const hit = Object.keys(nodes).find((id) => {
    if (nodes[id]?.type !== 'file') return false
    const n = normPath(id)
    return n === normPath(topicPath ?? '') || n.endsWith(`/${leaf}`) || id.endsWith(leaf ?? '')
  })

  if (hit) {
    await openFileInEditor(hit)
    return true
  }

  return false
}
