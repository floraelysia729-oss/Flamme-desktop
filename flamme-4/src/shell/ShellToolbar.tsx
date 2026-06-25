import type { ReactNode } from 'react'
import { useTheme } from '../theme/ThemeContext'

interface Props {
  left?: ReactNode
  center?: ReactNode
  right?: ReactNode
}

/** 编辑器 / 仪表盘共用的 liquid-card 顶栏 */
export default function ShellToolbar({ left, center, right }: Props) {
  const { glass } = useTheme()
  return (
    <div className={`${glass.toolbar} flex items-center rounded-xl shrink-0`}>
      {left && <div className="flex items-center gap-1 shrink-0">{left}</div>}
      {center && (
        <div className="chrome-title flex-1 min-w-0 text-center text-[12px] truncate select-none flex items-center justify-center">
          {center}
        </div>
      )}
      {right && <div className="flex items-center gap-0.5 shrink-0 ml-auto">{right}</div>}
    </div>
  )
}
