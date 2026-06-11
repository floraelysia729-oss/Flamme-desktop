/// <reference types="vite/client" />

declare const __FEATURE_TAURI__: boolean

declare module 'd3-force-3d' {
  export function forceCollide<T>(): {
    radius(fn: (node: T) => number): ReturnType<typeof forceCollide<T>>
    strength(s: number): ReturnType<typeof forceCollide<T>>
  }
}
