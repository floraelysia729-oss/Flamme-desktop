import type { VaultEntry } from '../api/vault-types'
import type { VFSNode } from '../vfs/types'

/** Vault 根节点 id（空字符串，与 Rust 相对路径一致） */
export const VAULT_ROOT_ID = ''

export function entriesToNodes(root: VaultEntry): Record<string, VFSNode> {
  const nodes: Record<string, VFSNode> = {}

  const walk = (entry: VaultEntry, parentId: string | null) => {
    if (entry.is_dir) {
      const childIds = (entry.children ?? []).map((c) => c.path)
      nodes[entry.path] = {
        type: 'folder',
        name: entry.name,
        children: childIds,
        parentId,
      }
      for (const child of entry.children ?? []) {
        walk(child, entry.path)
      }
    } else {
      nodes[entry.path] = {
        type: 'file',
        name: entry.name,
        parentId,
      }
    }
  }

  walk(root, null)
  return nodes
}

export function firstFilePath(nodes: Record<string, VFSNode>): string | null {
  for (const [id, node] of Object.entries(nodes)) {
    if (node.type === 'file' && id) return id
  }
  return null
}
