import type { VFSNode, VFSState } from '../vfs/types'

/** 侧栏 / 编辑器共用的文件树 store 形状 */
export interface FileStoreState extends VFSState {
  ready?: boolean
  error?: string | null
}

export interface FileStoreActions extends FileStoreState {
  createFile: (
    parentId: string,
    name: string,
    content?: string,
  ) => string | Promise<string>
  createFolder: (parentId: string, name: string) => string | Promise<string>
  renameNode: (id: string, newName: string) => void | Promise<void>
  deleteNode: (id: string) => void | Promise<void>
  moveNode?: (id: string, newParentId: string) => void
  openFile: (id: string, options?: { force?: boolean; prefetch?: boolean }) => void | Promise<void>
  prefetchFile?: (id: string) => Promise<void>
  getChildren: (folderId: string) => VFSNode[]
  updateContent: (id: string, content: string) => void
}
