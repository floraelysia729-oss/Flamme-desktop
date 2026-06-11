import { useLayoutEffect, useMemo, useState } from 'react'
import { useTheme } from '../theme/ThemeContext'
import { buildGraphColorScheme, type GraphColorScheme } from './colors'

export function useGraphThemeColors(): GraphColorScheme {
  const { colorMode, visualTheme } = useTheme()
  const [tick, setTick] = useState(0)

  // 等 DOM 主题 class / CSS 变量落地后再采样颜色
  useLayoutEffect(() => {
    const id = requestAnimationFrame(() => setTick((t) => t + 1))
    return () => cancelAnimationFrame(id)
  }, [colorMode, visualTheme])

  return useMemo(
    () => buildGraphColorScheme(colorMode),
    [colorMode, visualTheme, tick],
  )
}
