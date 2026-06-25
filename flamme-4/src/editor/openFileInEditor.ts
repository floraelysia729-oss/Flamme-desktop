import { getFileStore } from '../files'
import { useEditorSplitStore } from './editorSplitStore'

export interface OpenFileInEditorOptions {
  /** 在右侧新开分屏打开 */
  newPane?: boolean
  /** 指定分屏窗格打开（侧栏目录绑定到该窗格时使用） */
  paneId?: string
}

export async function openFileInEditor(
  fileId: string,
  options?: OpenFileInEditorOptions,
): Promise<void> {
  const split = useEditorSplitStore.getState()
  if (options?.newPane) {
    if (options.paneId) split.focusPane(options.paneId)
    split.openInNewPane(fileId)
  } else if (options?.paneId) {
    split.openInPane(options.paneId, fileId)
  } else {
    split.openInFocusedPane(fileId)
  }
  await Promise.resolve(getFileStore().openFile(fileId))
}

export async function selectEditorTab(paneId: string, fileId: string): Promise<void> {
  useEditorSplitStore.getState().selectTab(paneId, fileId)
  await Promise.resolve(getFileStore().openFile(fileId))
}
