/**
 * 文件树统一入口：Tauri 用 vault store，浏览器用 VFS store
 */
import { useVaultStore } from '../vault/store'
import { useVFSStore } from '../vfs/store'
import type { FileStoreActions } from './types'

declare const __FEATURE_TAURI__: boolean

export type { FileStoreActions, FileStoreState } from './types'

export function useFileStore<T>(selector: (state: FileStoreActions) => T): T {
  if (__FEATURE_TAURI__) {
    return useVaultStore(selector as (s: FileStoreActions) => T)
  }
  return useVFSStore(selector as (s: FileStoreActions) => T)
}

export function isVaultMode(): boolean {
  return __FEATURE_TAURI__
}

/** 非 React 上下文（如 Markdown 点击委托）读取文件树 */
export function getFileStore(): FileStoreActions {
  if (__FEATURE_TAURI__) {
    return useVaultStore.getState()
  }
  return useVFSStore.getState()
}
