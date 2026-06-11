/** 语义边颜色 — 与 relation_types 对齐，表达式在运行时解析为主题色 */
export const RELATION_COLOR_EXPR: Record<string, string> = {
  subordinate: 'var(--theme-c4, var(--accent-warm))',
  coordinate: 'var(--theme-c1, var(--accent))',
  correlative: 'var(--theme-c3, var(--accent))',
  wikilink: 'var(--theme-c2, var(--accent-warm))',
  has_entity: 'var(--accent)',
  related_to: 'var(--theme-c3, var(--accent))',
  frontmatter: 'var(--ink-muted)',
  prerequisite: 'var(--theme-c4, var(--accent-warm))',
}

export const RELATION_LABELS: Record<string, string> = {
  subordinate: '上下级',
  coordinate: '并列/对比',
  correlative: '弱相关',
  wikilink: '双链',
  has_entity: '文档→实体',
  related_to: '相关',
  frontmatter: '相关',
  prerequisite: '上下级',
}

/** 默认隐藏的边类型（全景预设） */
export const DEFAULT_HIDDEN_RELATIONS = new Set(['wikilink', 'has_entity'])

/** 边过滤预设 — 隐藏的关系类型 */
export const EDGE_PRESET_RELATIONS = {
  hierarchy: ['wikilink', 'has_entity', 'correlative'] as const,
  network: ['has_entity'] as const,
  overview: ['wikilink', 'has_entity'] as const,
  all: [] as const,
}

export function displayRelationLabel(label: string): string {
  return RELATION_LABELS[label] ?? label
}

export function withAlpha(rgb: string, alpha: number): string {
  const m = rgb.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
  if (!m) return rgb
  return `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${alpha})`
}

const COMMUNITY_EXPR = [
  'var(--theme-c1, var(--accent))',
  'var(--theme-c2, var(--accent-warm))',
  'var(--theme-c3, var(--accent))',
  'var(--theme-c4, var(--accent-warm))',
  'oklch(from var(--theme-c1, var(--accent)) l c h / 0.72)',
  'oklch(from var(--theme-c2, var(--accent-warm)) l c h / 0.72)',
  'oklch(from var(--theme-c1, var(--accent)) l c h / 0.5)',
]

export interface GraphColorScheme {
  community: string[]
  document: string
  fallback: string
  relations: Record<string, string>
  accent: string
  label: string
  pillBg: string
  colorMode: 'light' | 'dark'
  /** 连线标签文字 — 始终用正文色保证浅色主题可读 */
  linkLabelText: string
  /** 连线标签底色 — 浅色主题用高不透明度白底 */
  linkLabelBg: string
}

/** 将 CSS color 表达式解析为 canvas 可用的 rgb/rgba 字符串 */
export function resolveCssColor(expression: string, fallback = '#94a3b8'): string {
  if (typeof document === 'undefined') return fallback
  const el = document.createElement('span')
  el.style.color = expression
  el.style.display = 'none'
  document.documentElement.appendChild(el)
  const color = getComputedStyle(el).color
  document.documentElement.removeChild(el)
  return color && color !== 'rgba(0, 0, 0, 0)' ? color : fallback
}

export function buildGraphColorScheme(colorMode: 'light' | 'dark'): GraphColorScheme {
  const relations: Record<string, string> = {}
  for (const [key, expr] of Object.entries(RELATION_COLOR_EXPR)) {
    relations[key] = resolveCssColor(expr)
  }
  return {
    community: COMMUNITY_EXPR.map((e) => resolveCssColor(e)),
    document: resolveCssColor(
      colorMode === 'dark'
        ? 'oklch(from var(--ink-muted) l c h / 0.45)'
        : 'oklch(from var(--ink-muted) l c h / 0.28)',
    ),
    fallback: resolveCssColor('var(--ink-muted)'),
    relations,
    accent: resolveCssColor('var(--accent)'),
    label: resolveCssColor('var(--ink)'),
    pillBg: resolveCssColor('var(--bg-elevated)'),
    colorMode,
    linkLabelText: resolveCssColor('var(--ink)'),
    linkLabelBg: resolveCssColor(
      colorMode === 'light'
        ? 'oklch(0.99 0.002 260 / 0.96)'
        : 'oklch(from var(--bg-elevated) l c h / 0.94)',
    ),
  }
}

export function communityColor(id: number | undefined, scheme: GraphColorScheme): string {
  if (id == null || id < 0) return scheme.fallback
  return scheme.community[id % scheme.community.length]
}

export function nodeFill(type: string, community: number | undefined, scheme: GraphColorScheme): string {
  if (type === 'entity' || type === 'concept') return communityColor(community, scheme)
  if (type === 'document') return scheme.document
  return scheme.fallback
}

export function linkColor(label: string, scheme: GraphColorScheme): string {
  return scheme.relations[label] ?? scheme.fallback
}

export function isHierarchicalRelation(label: string): boolean {
  return label === 'subordinate' || label === 'prerequisite'
}

/** 有向边：上下级（含 prerequisite）、文档→实体 */
export function isDirectedRelation(label: string): boolean {
  return isHierarchicalRelation(label) || label === 'has_entity'
}

/** 无向语义边（可能存双向，画标签时去重） */
export function isUndirectedRelation(label: string): boolean {
  return !isDirectedRelation(label)
}

/** 沿连线垂直方向偏移标签，减少交叉重叠 */
export function linkLabelOffset(linkKey: string, globalScale: number): number {
  let h = 0
  for (let i = 0; i < linkKey.length; i++) h = (h * 31 + linkKey.charCodeAt(i)) | 0
  const slot = ((h % 5) - 2) * 10
  return slot / Math.max(globalScale, 0.4)
}
