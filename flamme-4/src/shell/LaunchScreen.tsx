import FlammeLogo from './FlammeLogo'
import type { BootPhase } from '../api/bootDesktop'
import { BOOT_PHASE_LABEL } from '../api/bootDesktop'

interface Props {
  phase: BootPhase
  detail?: string
  error?: string
  onRetry?: () => void
}

/** 桌面启动屏 — logo 置于视口偏下区域（光学正中） */
export default function LaunchScreen({ phase, detail, error, onRetry }: Props) {
  const status = error ?? detail ?? BOOT_PHASE_LABEL[phase]

  return (
    <div className="fixed inset-0 z-[200] bg-[#F5F0EB]">
      <div
        className="absolute inset-0 opacity-40 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 65% 50% at 50% 58%, rgba(255,158,122,0.35), transparent 72%)',
        }}
      />
      <div
        className="absolute left-1/2 flex flex-col items-center gap-10 px-6 w-full max-w-lg"
        style={{ top: '58%', transform: 'translate(-50%, -50%)' }}
      >
        <FlammeLogo variant="full" size="hero" />
        <div className="flex flex-col items-center gap-3 min-h-[3rem] w-full">
          {phase !== 'done' && phase !== 'error' && (
            <div className="w-8 h-8 rounded-full border-2 border-[#C65D3A]/30 border-t-[#C65D3A] animate-spin" />
          )}
          <p
            className={`text-sm text-center max-w-xs ${
              error ? 'text-red-600' : 'text-[#8B7355]'
            }`}
          >
            {status}
          </p>
          {error && onRetry && (
            <button
              type="button"
              className="px-4 py-2 rounded-lg text-sm bg-[#C65D3A] text-white hover:opacity-90"
              onClick={onRetry}
            >
              重试
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
