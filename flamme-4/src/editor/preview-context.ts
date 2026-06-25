import type { EditorView } from '@codemirror/view'
import type { MathRange } from './math-ranges'
import { scanMathRanges } from './math-ranges'
import type { HtmlBlockRange } from './html-ranges'
import { scanHtmlLineBlocks } from './html-ranges'
import type { WikilinkRange } from './wikilink-ranges'
import { scanWikilinks } from './wikilink-ranges'
import type { FrontmatterRange } from './frontmatter-ranges'
import { scanFrontmatter } from './frontmatter-ranges'
import type { GfmTableRange } from './table-ranges'
import { scanGfmTableBlocks } from './table-ranges'
import type { AnchorTarget, InternalMdLink } from '../shared/markdownAnchors'
import { scanAnchorTargets, scanInternalMdLinks } from '../shared/markdownAnchors'
import type { FencedCodeRange } from './fenced-code-ranges'
import { scanFencedCodeBlocks } from './fenced-code-ranges'
import { shouldRenderWidget } from './viewport-scope'

export interface PreviewWidgetMask {
  math: MathRange[]
  wikilinks: WikilinkRange[]
  html: HtmlBlockRange[]
  tables: GfmTableRange[]
  fencedCode: FencedCodeRange[]
  internalLinks: InternalMdLink[]
  anchorTargets: AnchorTarget[]
  frontmatter: FrontmatterRange | null
}

function activeWidgetRanges<T extends { from: number; to: number }>(
  view: EditorView,
  cursor: number,
  ranges: T[],
): T[] {
  return ranges.filter(
    (r) =>
      !(cursor >= r.from && cursor <= r.to) &&
      shouldRenderWidget(view, r, cursor),
  )
}

/** 单次构建中缓存「由 Widget 接管」的区间，避免在语法树遍历里重复全量扫描 */
export function buildPreviewWidgetMask(
  view: EditorView,
  cursor: number,
): PreviewWidgetMask {
  const doc = view.state.doc.toString()
  const fm = scanFrontmatter(doc)
  const frontmatter =
    fm && !(cursor >= fm.from && cursor < fm.to) && shouldRenderWidget(view, fm, cursor)
      ? fm
      : null

  return {
    math: activeWidgetRanges(view, cursor, scanMathRanges(doc)),
    wikilinks: activeWidgetRanges(view, cursor, scanWikilinks(doc)),
    html: activeWidgetRanges(view, cursor, scanHtmlLineBlocks(doc)),
    tables: activeWidgetRanges(view, cursor, scanGfmTableBlocks(doc)),
    fencedCode: activeWidgetRanges(view, cursor, scanFencedCodeBlocks(view.state)),
    internalLinks: activeWidgetRanges(view, cursor, scanInternalMdLinks(doc)),
    anchorTargets: activeWidgetRanges(view, cursor, scanAnchorTargets(doc)),
    frontmatter,
  }
}

export function posInRanges(pos: number, ranges: { from: number; to: number }[]): boolean {
  for (const r of ranges) {
    if (pos < r.from) return false
    if (pos >= r.from && pos <= r.to) return true
  }
  return false
}

export function rangeOverlapsWidget(
  from: number,
  to: number,
  ranges: { from: number; to: number }[],
): boolean {
  for (const r of ranges) {
    if (r.from >= to) return false
    if (r.to <= from) continue
    return true
  }
  return false
}
