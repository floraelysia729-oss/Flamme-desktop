import type { ReactNode } from 'react'

interface Props {
  variant: 'editor' | 'dashboard'
  children: ReactNode
}

/** 全 app 统一的液态玻璃外壳（对齐 mock） */
export default function AppShell({ variant, children }: Props) {
  if (variant === 'dashboard') {
    return (
      <div className="relative z-0 h-screen p-5 box-border flex flex-col min-h-0">
        {children}
      </div>
    )
  }

  return (
    <div className="relative z-0 h-screen box-border flex min-h-0 overflow-hidden">
      {children}
    </div>
  )
}
