import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useConnectionStore } from '../api/connection'

interface VaultUiState {
  lastActiveByVault: Record<string, string>
  setLastActiveFile: (vaultPath: string, fileId: string) => void
  getLastActiveFile: (vaultPath: string) => string | null
  clearLastActiveFile: (vaultPath: string) => void
}

function vaultKey(vaultPath: string): string {
  return vaultPath.trim().replace(/\\/g, '/') || '_default'
}

function normPath(fileId: string): string {
  return fileId.replace(/\\/g, '/')
}

export const useVaultUiStore = create<VaultUiState>()(
  persist(
    (set, get) => ({
      lastActiveByVault: {},

      setLastActiveFile(vaultPath, fileId) {
        const key = vaultKey(vaultPath)
        const norm = normPath(fileId)
        if (!norm) return
        set((s) => ({
          lastActiveByVault: { ...s.lastActiveByVault, [key]: norm },
        }))
      },

      getLastActiveFile(vaultPath) {
        return get().lastActiveByVault[vaultKey(vaultPath)] ?? null
      },

      clearLastActiveFile(vaultPath) {
        const key = vaultKey(vaultPath)
        set((s) => {
          const { [key]: _removed, ...rest } = s.lastActiveByVault
          return { lastActiveByVault: rest }
        })
      },
    }),
    {
      name: 'flamme-vault-ui',
      partialize: (s) => ({ lastActiveByVault: s.lastActiveByVault }),
    },
  ),
)

export function persistVaultActiveFile(fileId: string | null) {
  const vaultPath = useConnectionStore.getState().vaultPath
  if (!vaultPath.trim() || !fileId) return
  useVaultUiStore.getState().setLastActiveFile(vaultPath, fileId)
}
