/**
 * 后端连接配置（Zustand + localStorage）
 * 仅保存 baseUrl / vaultPath；业务请求走 bridge.ts
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface ConnectionState {
  baseUrl: string
  vaultPath: string
  connected: boolean
  learnNotesDir: string
  llmApiKey: string
  embedApiKey: string
  brainApiKey: string
  mineruApiToken: string
  setBaseUrl: (url: string) => void
  setVaultPath: (path: string) => void
  setConnected: (connected: boolean) => void
  setLearnNotesDir: (dir: string) => void
  setLlmApiKey: (key: string) => void
  setEmbedApiKey: (key: string) => void
  setBrainApiKey: (key: string) => void
  setMineruApiToken: (token: string) => void
}

export const useConnectionStore = create<ConnectionState>()(
  persist(
    (set) => ({
      baseUrl: 'http://127.0.0.1:8765/api',
      vaultPath: '',
      connected: false,
      learnNotesDir: '学习笔记',
      llmApiKey: '',
      embedApiKey: '',
      brainApiKey: '',
      mineruApiToken: '',

      setBaseUrl: (url) => set({ baseUrl: url }),
      setVaultPath: (path) => set({ vaultPath: path }),
      setConnected: (connected) => set({ connected }),
      setLearnNotesDir: (learnNotesDir) => set({ learnNotesDir }),
      setLlmApiKey: (llmApiKey) => set({ llmApiKey }),
      setEmbedApiKey: (embedApiKey) => set({ embedApiKey }),
      setBrainApiKey: (brainApiKey) => set({ brainApiKey }),
      setMineruApiToken: (mineruApiToken) => set({ mineruApiToken }),
    }),
    { name: 'flamme-connection' },
  ),
)

/** @deprecated 使用 useConnectionStore */
export const useApiStore = useConnectionStore
