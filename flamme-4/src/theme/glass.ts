export type ColorMode = 'light' | 'dark'
export type GlassVariant = 'light' | 'dark'

export function glassVariant(colorMode: ColorMode): GlassVariant {
  return colorMode === 'dark' ? 'dark' : 'light'
}

/** 液态玻璃 class 组合（随 colorMode 切换，勿写死 dark） */
export function glassClasses(colorMode: ColorMode) {
  const v = glassVariant(colorMode)
  return {
    variant: v,
    panel: `glass-panel glass-panel-${v} depth-panel-${v} refraction-tint-${v}`,
    card: `liquid-card liquid-card-${v} depth-card-${v}`,
    cardSpecular: `liquid-card liquid-card-${v} depth-card-${v} specular-edge specular-edge-${v}`,
    toolbar: `shell-toolbar liquid-card liquid-card-${v} depth-card-${v}`,
  }
}
