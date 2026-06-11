import { useState, useRef, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { ExternalLink, X } from 'lucide-react'
import { rgbToHex, type RGB } from '../theme/colors'
import type { ThemeColors } from '../theme/useThemeColors'
import { useTheme } from '../theme/ThemeContext'
import { useConnectionStore } from '../api/connection'
import { API_HELP_ENTRIES } from './apiHelp'
import ApiKeyField from './ApiKeyField'
import ConnectionForm from '../dashboard/ConnectionForm'
import { useIngestStore } from '../ingest/store'
import {
  clampEntityBackfillLimit,
  DEFAULT_ENTITY_BACKFILL_LIMIT,
  MAX_ENTITY_BACKFILL_LIMIT,
  MIN_ENTITY_BACKFILL_LIMIT,
} from '../shared/ingest'
import {
  EDITOR_COLOR_SLOTS,
  applyImagePalette,
  clearImagePalette,
  extractColorsFromImage,
  importObsidianTheme,
} from './editorThemeUtils'

interface Props {
  open: boolean
  onClose: () => void
}

type MainSection = 'interface' | 'editor' | 'backend' | 'api'
type EditorSection = 'colors' | 'import' | 'picker'

function HorizontalTab({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 px-4 py-2 rounded-xl text-xs font-medium transition-colors ${
        active
          ? 'bg-[var(--accent)]/25 text-[var(--ink)] ring-1 ring-[var(--accent)]/40'
          : 'text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-white/5'
      }`}
    >
      {label}
    </button>
  )
}

function LearnNotesDirField() {
  const learnNotesDir = useConnectionStore((s) => s.learnNotesDir)
  const setLearnNotesDir = useConnectionStore((s) => s.setLearnNotesDir)
  return (
    <input
      type="text"
      className="w-full text-sm px-3 py-2 rounded-lg border border-[var(--border)]/50 bg-white/5"
      value={learnNotesDir}
      onChange={(e) => setLearnNotesDir(e.target.value)}
      placeholder="学习笔记"
    />
  )
}

function EntityBackfillLimitField() {
  const limit = useIngestStore((s) => s.entityBackfillLimit)
  const setLimit = useIngestStore((s) => s.setEntityBackfillLimit)
  return (
    <input
      type="number"
      min={MIN_ENTITY_BACKFILL_LIMIT}
      max={MAX_ENTITY_BACKFILL_LIMIT}
      className="w-full text-sm px-3 py-2 rounded-lg border border-[var(--border)]/50 bg-white/5 tabular-nums"
      value={limit}
      onChange={(e) => setLimit(clampEntityBackfillLimit(Number(e.target.value)))}
    />
  )
}

export default function SettingsPanel({ open, onClose }: Props) {
  const {
    colors,
    updateEditorColors,
    visualTheme,
    visualThemes,
    requestSetVisualTheme,
    colorMode,
    requestSetColorMode,
  } = useTheme()

  const llmApiKey = useConnectionStore((s) => s.llmApiKey)
  const embedApiKey = useConnectionStore((s) => s.embedApiKey)
  const brainApiKey = useConnectionStore((s) => s.brainApiKey)
  const mineruApiToken = useConnectionStore((s) => s.mineruApiToken)
  const setLlmApiKey = useConnectionStore((s) => s.setLlmApiKey)
  const setEmbedApiKey = useConnectionStore((s) => s.setEmbedApiKey)
  const setBrainApiKey = useConnectionStore((s) => s.setBrainApiKey)
  const setMineruApiToken = useConnectionStore((s) => s.setMineruApiToken)

  const [section, setSection] = useState<MainSection>('interface')
  const [editorSection, setEditorSection] = useState<EditorSection>('colors')
  const [importStatus, setImportStatus] = useState('')
  const [imageColors, setImageColors] = useState<RGB[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const handleColorChange = useCallback(
    (key: keyof ThemeColors, value: string) => {
      clearImagePalette()
      updateEditorColors({ ...colors, [key]: value })
    },
    [colors, updateEditorColors],
  )

  const handleObsidianImport = useCallback(async () => {
    setImportStatus('正在读取…')
    try {
      const msg = await importObsidianTheme(updateEditorColors)
      setImportStatus(msg)
    } catch (e: unknown) {
      const err = e as { name?: string; message?: string }
      if (err.name === 'AbortError') setImportStatus('')
      else setImportStatus(`导入失败: ${err.message ?? String(e)}`)
    }
  }, [updateEditorColors])

  const handleImage = useCallback(async (file: File) => {
    try {
      setImageColors(await extractColorsFromImage(file, 8))
    } catch (e) {
      console.error('Failed to extract colors:', e)
    }
  }, [])

  const apiValues: Record<string, string> = {
    llm: llmApiKey,
    embed: embedApiKey,
    brain: brainApiKey,
    mineru: mineruApiToken,
  }

  const setApiValue = (id: string, value: string) => {
    switch (id) {
      case 'llm':
        setLlmApiKey(value)
        break
      case 'embed':
        setEmbedApiKey(value)
        break
      case 'brain':
        setBrainApiKey(value)
        break
      case 'mineru':
        setMineruApiToken(value)
        break
    }
  }

  if (!open) return null

  return createPortal(
    <>
      <button
        type="button"
        className="fixed inset-0 z-[499] bg-black/55 cursor-default"
        aria-label="关闭设置"
        onClick={onClose}
      />
      <aside
        className="settings-panel settings-panel-solid fixed right-0 top-0 h-full w-[min(100%,26rem)] z-[500] rounded-l-3xl shadow-2xl flex flex-col border-l border-white/15"
        role="dialog"
        aria-modal="true"
        aria-label="设置"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
          <span className="text-sm font-semibold text-[var(--ink)]">设置</span>
          <button
            type="button"
            className="p-1.5 rounded-lg hover:bg-white/10 text-[var(--ink-muted)] hover:text-[var(--ink)]"
            onClick={onClose}
            aria-label="关闭"
          >
            <X size={16} />
          </button>
        </div>

        <nav
          className="shrink-0 flex gap-2 px-3 py-3 overflow-x-auto border-b border-white/10"
          aria-label="设置分类"
          style={{ scrollbarGutter: 'stable' }}
        >
          <HorizontalTab
            active={section === 'interface'}
            label="界面"
            onClick={() => setSection('interface')}
          />
          <HorizontalTab
            active={section === 'editor'}
            label="编辑器"
            onClick={() => setSection('editor')}
          />
          <HorizontalTab
            active={section === 'backend'}
            label="后端"
            onClick={() => setSection('backend')}
          />
          <HorizontalTab
            active={section === 'api'}
            label="API"
            onClick={() => setSection('api')}
          />
        </nav>

        <div className="overflow-y-auto flex-1 p-4 min-h-0">
          {section === 'interface' && (
            <div className="space-y-4">
              <div>
                <p className="text-xs text-[var(--ink-muted)] mb-2">壁纸主题（横选，与 Ctrl+T 相同）</p>
                <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarGutter: 'stable' }}>
                  {visualThemes.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className={`shrink-0 flex flex-col items-center gap-1.5 p-2 rounded-xl border transition-colors w-[5.5rem] ${
                        visualTheme === t.id
                          ? 'border-[var(--accent)] bg-white/10'
                          : 'border-white/10 hover:border-white/25 hover:bg-white/5'
                      }`}
                      onClick={() => requestSetVisualTheme(t.id)}
                    >
                      <img
                        src={t.bgImage}
                        alt=""
                        className="w-full h-10 rounded-lg object-cover"
                      />
                      <span className="text-[11px] font-medium text-[var(--ink)]">{t.name}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs text-[var(--ink-muted)] mb-2">界面明暗</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={`flex-1 py-2.5 rounded-xl text-xs border transition-colors ${
                      colorMode === 'light'
                        ? 'border-[var(--accent)] bg-white/10 text-[var(--ink)]'
                        : 'border-white/10 text-[var(--ink-muted)] hover:bg-white/5'
                    }`}
                    onClick={() => requestSetColorMode('light')}
                  >
                    浅色
                  </button>
                  <button
                    type="button"
                    className={`flex-1 py-2.5 rounded-xl text-xs border transition-colors ${
                      colorMode === 'dark'
                        ? 'border-[var(--accent)] bg-white/10 text-[var(--ink)]'
                        : 'border-white/10 text-[var(--ink-muted)] hover:bg-white/5'
                    }`}
                    onClick={() => requestSetColorMode('dark')}
                  >
                    深色
                  </button>
                </div>
              </div>
            </div>
          )}

          {section === 'editor' && (
            <div className="space-y-3">
              <div className="flex gap-2 overflow-x-auto pb-1">
                <HorizontalTab
                  active={editorSection === 'colors'}
                  label="配色"
                  onClick={() => setEditorSection('colors')}
                />
                <HorizontalTab
                  active={editorSection === 'import'}
                  label="导入"
                  onClick={() => setEditorSection('import')}
                />
                <HorizontalTab
                  active={editorSection === 'picker'}
                  label="取色"
                  onClick={() => setEditorSection('picker')}
                />
              </div>

              {editorSection === 'colors' && (
                <div className="space-y-1.5">
                  <p className="text-xs text-[var(--ink-muted)]">CodeMirror 语法配色</p>
                  {EDITOR_COLOR_SLOTS.map((s) => (
                    <label key={s.key} className="flex items-center justify-between py-0.5">
                      <span className="text-xs text-[var(--ink-muted)]">{s.label}</span>
                      <input
                        type="color"
                        value={colors[s.key]}
                        onChange={(e) => handleColorChange(s.key, e.target.value)}
                        className="w-8 h-6 rounded cursor-pointer border-none bg-transparent"
                      />
                    </label>
                  ))}
                </div>
              )}

              {editorSection === 'import' && (
                <div className="space-y-3">
                  <p className="text-xs text-[var(--ink-muted)]">
                    选择 Obsidian 仓库根目录，读取当前主题与已启用 CSS 片段
                  </p>
                  <button
                    type="button"
                    className="w-full py-2.5 rounded-xl text-xs font-medium bg-[var(--bg-surface)] text-[var(--ink)] hover:bg-white/10"
                    onClick={() => void handleObsidianImport()}
                  >
                    选择仓库目录
                  </button>
                  {importStatus && (
                    <p className="text-xs text-[var(--ink-muted)]">{importStatus}</p>
                  )}
                </div>
              )}

              {editorSection === 'picker' && (
                <div className="space-y-3">
                  <p className="text-xs text-[var(--ink-muted)] leading-relaxed">
                    拖入或选择参考图，按当前界面明暗（{colorMode === 'light' ? '浅色' : '深色'}）映射配色；切换明暗时会自动重新映射。手动改单项配色后将不再跟随参考图。
                  </p>
                  <div
                    className="flex items-center justify-center h-24 rounded-xl border-2 border-dashed border-white/20 hover:border-white/40 cursor-pointer"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault()
                      const file = e.dataTransfer.files[0]
                      if (file) void handleImage(file)
                    }}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <span className="text-xs text-[var(--ink-muted)]">拖入图片 / 点击选择</span>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files?.[0]) void handleImage(e.target.files[0])
                      }}
                    />
                  </div>
                  {imageColors.length > 0 && (
                    <>
                      <div className="flex gap-2 flex-wrap">
                        {imageColors.map((c, i) => (
                          <div
                            key={i}
                            className="w-8 h-8 rounded-lg shrink-0"
                            style={{ backgroundColor: rgbToHex(c) }}
                            title={rgbToHex(c)}
                          />
                        ))}
                      </div>
                      <button
                        type="button"
                        className="w-full py-2.5 rounded-xl text-xs font-medium bg-[var(--bg-surface)] hover:bg-white/10"
                        onClick={() =>
                          updateEditorColors(applyImagePalette(imageColors, colorMode))
                        }
                      >
                        应用自动配色（{colorMode === 'light' ? '浅色' : '深色'}）
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {section === 'backend' && (
            <div className="space-y-4">
              <p className="text-xs text-[var(--ink-muted)] leading-relaxed">
                配置本地 Python 后端与 Vault 路径；同步索引与摄入也在此完成。仪表盘仅展示数据可视化。
              </p>
              <ConnectionForm variant="settings" />
              <label className="block space-y-1">
                <span className="text-xs text-[var(--ink-muted)]">学习笔记目录（相对 Vault）</span>
                <LearnNotesDirField />
                <span className="text-[10px] text-[var(--ink-muted)]">
                  「下课」存档的 Markdown 笔记将写入此目录，可手动摄入索引。
                </span>
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-[var(--ink-muted)]">实体补跑单次上限（篇）</span>
                <EntityBackfillLimitField />
                <span className="text-[10px] text-[var(--ink-muted)]">
                  摄入面板「补跑实体」每次最多处理的源文档数，默认 {DEFAULT_ENTITY_BACKFILL_LIMIT}，范围{' '}
                  {MIN_ENTITY_BACKFILL_LIMIT}–{MAX_ENTITY_BACKFILL_LIMIT}。每篇可能触发多次 LLM 调用。
                </span>
              </label>
            </div>
          )}

          {section === 'api' && (
            <div className="space-y-4">
              <p className="text-xs text-[var(--ink-muted)] leading-relaxed">
                密钥通过请求头传给本地后端。未填写时使用 flamme-backend 的 .env。
              </p>
              <p className="text-[11px] px-2 py-2 rounded-lg border border-[var(--accent-warm)]/30 bg-[var(--accent-warm)]/10 text-[var(--ink)] leading-relaxed">
                对话走 <strong>DeepSeek</strong> 接口；<strong>千问 / DashScope</strong> 的 Key 只能填「向量嵌入」。
                填反会 401。点输入框右侧眼睛图标可核对是否粘贴完整。
              </p>
              {API_HELP_ENTRIES.map((entry) => (
                <div key={entry.id} className="space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-medium text-[var(--ink)]">{entry.label}</p>
                      <p className="text-[10px] text-[var(--ink-muted)]">{entry.description}</p>
                    </div>
                    <a
                      href={entry.helpUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 inline-flex items-center gap-1 text-[10px] text-[var(--accent)] hover:underline"
                    >
                      {entry.helpLabel}
                      <ExternalLink size={11} />
                    </a>
                  </div>
                  <ApiKeyField
                    id={`api-key-${entry.id}`}
                    placeholder={entry.placeholder}
                    value={apiValues[entry.id] ?? ''}
                    onChange={(v) => setApiValue(entry.id, v)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>
    </>,
    document.body,
  )
}
