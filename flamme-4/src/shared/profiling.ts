/** 开发期性能打点 — 生产 tree-shake（§4.2-F） */
const ENABLED = import.meta.env.DEV

const marks = new Map<string, number>()

export function mark(name: string) {
  if (!ENABLED) return
  marks.set(name, performance.now())
}

export function report() {
  if (!ENABLED) return
  for (const [name, time] of marks) {
    console.log(`[flamme] ${name}: ${time.toFixed(0)}ms`)
  }
}
