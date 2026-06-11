import { Flame } from 'lucide-react'

interface Props {
  /** icon-only 用于侧栏；full 含 FLAMME 字标（官方 logo 图） */
  variant?: 'icon' | 'full'
  /** full 尺寸：hero 用于启动屏居中展示 */
  size?: 'default' | 'hero'
  className?: string
}

/** 品牌火焰 — icon 与「检查并摄入」同款 Lucide Flame；full 用你的 logo 图 */
export default function FlammeLogo({
  variant = 'full',
  size = 'default',
  className = '',
}: Props) {
  if (variant === 'icon') {
    return (
      <Flame
        size={22}
        strokeWidth={2.25}
        className={`shrink-0 text-[#E86B4A] ${className}`}
        aria-hidden
      />
    )
  }

  const imgClass =
    size === 'hero'
      ? 'w-[min(360px,82vw)] max-h-[58vh] object-contain'
      : 'w-[140px] h-auto object-contain'

  return (
    <div className={`flex flex-col items-center justify-center select-none ${className}`}>
      <img
        src="/branding/logo-full.jpg"
        alt="FLAMME"
        className={imgClass}
        draggable={false}
      />
    </div>
  )
}
