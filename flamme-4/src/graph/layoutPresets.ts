import type { LayoutMode } from './layoutMode'

export type EdgePreset = 'hierarchy' | 'network' | 'overview' | 'all' | 'custom'

export const LAYOUT_MODE_KEY = 'flamme.graph.layoutMode'
export const EDGE_PRESET_KEY = 'flamme.graph.edgePreset'

export const EDGE_PRESET_HIDDEN: Record<Exclude<EdgePreset, 'custom'>, readonly string[]> = {
  hierarchy: ['wikilink', 'has_entity', 'correlative'],
  network: ['has_entity'],
  overview: ['wikilink', 'has_entity'],
  all: [],
}

export const EDGE_PRESET_LABELS: Record<Exclude<EdgePreset, 'custom'>, string> = {
  hierarchy: '学习层次',
  network: '实体网络',
  overview: '全景',
  all: '全部',
}

const VALID_LAYOUT_MODES: LayoutMode[] = ['network', 'hierarchy']
const VALID_EDGE_PRESETS: EdgePreset[] = ['hierarchy', 'network', 'overview', 'all', 'custom']

function migrateLayoutMode(raw: string | null): LayoutMode {
  if (raw === 'hierarchy') return 'hierarchy'
  if (raw === 'network') return 'network'
  // 旧版 auto / force / community → network
  if (raw === 'auto' || raw === 'force' || raw === 'community') return 'network'
  return 'network'
}

export function loadLayoutMode(): LayoutMode {
  if (typeof localStorage === 'undefined') return 'network'
  const v = localStorage.getItem(LAYOUT_MODE_KEY)
  const migrated = migrateLayoutMode(v)
  if (v !== migrated) {
    try {
      localStorage.setItem(LAYOUT_MODE_KEY, migrated)
    } catch {
      /* ignore */
    }
  }
  return VALID_LAYOUT_MODES.includes(migrated) ? migrated : 'network'
}

export function saveLayoutMode(mode: LayoutMode): void {
  try {
    localStorage.setItem(LAYOUT_MODE_KEY, mode)
  } catch {
    /* ignore quota */
  }
}

export function loadEdgePreset(): EdgePreset {
  if (typeof localStorage === 'undefined') return 'overview'
  const v = localStorage.getItem(EDGE_PRESET_KEY)
  return VALID_EDGE_PRESETS.includes(v as EdgePreset) ? (v as EdgePreset) : 'overview'
}

export function saveEdgePreset(preset: EdgePreset): void {
  try {
    localStorage.setItem(EDGE_PRESET_KEY, preset)
  } catch {
    /* ignore quota */
  }
}

export function hiddenRelationsForPreset(preset: Exclude<EdgePreset, 'custom'>): Set<string> {
  return new Set(EDGE_PRESET_HIDDEN[preset])
}
