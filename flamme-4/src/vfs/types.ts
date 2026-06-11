export interface VFSNode {
  type: 'file' | 'folder'
  name: string
  content?: string // only for files
  children?: string[] // only for folders, stores child node IDs
  parentId: string | null
}

export interface VFSState {
  nodes: Record<string, VFSNode>
  rootId: string
  activeFileId: string | null
}
