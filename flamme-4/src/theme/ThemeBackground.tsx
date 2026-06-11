import { useTheme } from './ThemeContext'

/** 全屏清晰壁纸层；液态玻璃组件仍用模糊预览图，见 visualThemes.bgImage */
export default function ThemeBackground() {
  const { visualTheme, colorMode, visualThemes } = useTheme()
  const theme = visualThemes.find((t) => t.id === visualTheme) ?? visualThemes[0]

  return (
    <div
      className={`theme-bg ${colorMode === 'dark' ? 'theme-bg-dark' : 'theme-bg-light'}`}
      style={{ backgroundImage: `url(${theme.wallpaperImage})` }}
      aria-hidden
    />
  )
}
