/** 与 src-tauri vault.rs VaultEntry 对齐 */
export interface VaultEntry {
  path: string
  name: string
  is_dir: boolean
  children?: VaultEntry[]
}
