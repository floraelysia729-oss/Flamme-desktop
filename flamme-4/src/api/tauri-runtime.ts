/**
 * Tauri WebView 探测与 invoke 封装
 * - 浏览器 `npm run dev`：__FEATURE_TAURI__ 为 false，Vault invoke 不启用
 * - `npm run tauri:dev`：须在 Tauri 窗口内运行，勿用 Chrome 直连 :5173
 */
declare const __FEATURE_TAURI__: boolean

type TauriWindow = Window & {
  __TAURI_INTERNALS__?: unknown
  __TAURI__?: unknown
}

export function isTauriWebView(): boolean {
  if (typeof window === 'undefined') return false
  const w = window as TauriWindow
  return Boolean(w.__TAURI_INTERNALS__ ?? w.__TAURI__)
}

export function tauriUnavailableMessage(cmd: string): string {
  if (!__FEATURE_TAURI__) {
    return `当前为浏览器开发模式，无法执行 ${cmd}。请使用 npm run tauri:dev 启动桌面版`
  }
  if (!isTauriWebView()) {
    return `未检测到 Tauri 桌面环境（${cmd}）。请用 npm run tauri:dev 启动应用，勿在 Chrome 中打开 localhost:5173`
  }
  return `Tauri 命令失败: ${cmd}`
}

function assertTauriEnv(cmd: string): void {
  if (!__FEATURE_TAURI__ || !isTauriWebView()) {
    throw new Error(tauriUnavailableMessage(cmd))
  }
}

async function invokeCore<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  assertTauriEnv(cmd)
  const { invoke } = await import('@tauri-apps/api/core')
  try {
    return (await invoke<T>(cmd, args)) as T
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(msg.trim() || tauriUnavailableMessage(cmd))
  }
}

/** 探测 IPC 是否可用（get_vault_root 在未设置 Vault 时仍返回 Ok(null)） */
export async function waitForTauriReady(maxMs = 15_000): Promise<boolean> {
  if (!__FEATURE_TAURI__ || !isTauriWebView()) return false
  const deadline = Date.now() + maxMs
  while (Date.now() < deadline) {
    try {
      await invokeCore<unknown>('get_vault_root')
      return true
    } catch {
      await new Promise((r) => setTimeout(r, 60))
    }
  }
  return false
}

/**
 * 调用 Rust command；失败抛错（带后端 message）。
 * 注意：返回值为 `()` 的 command 在 JS 侧通常是 `null`，不能据此判断失败。
 */
export async function tauriInvoke<T>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  return invokeCore<T>(cmd, args)
}

/** Result<(), String> — 成功时返回值可能是 null */
export async function tauriInvokeVoid(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<void> {
  await invokeCore<null | undefined>(cmd, args)
}
