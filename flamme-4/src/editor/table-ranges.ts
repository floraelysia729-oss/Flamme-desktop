/** 扫描文档中的 GFM 管道表格块（多行） */

export interface GfmTableRange {
  from: number
  to: number
  markdown: string
}

const TABLE_SEP_RE = /^\s*\|(\s*:?-+:?\s*\|)+\s*$/

export function isGfmTableRow(line: string): boolean {
  const t = line.trim()
  return t.length > 0 && t.startsWith('|') && t.endsWith('|') && t.includes('|')
}

export function isGfmTableSeparator(line: string): boolean {
  return TABLE_SEP_RE.test(line.trim())
}

/** 判断两行是否构成表格开头（表头 + 分隔行） */
export function isGfmTableStart(headerLine: string, sepLine: string): boolean {
  return isGfmTableRow(headerLine) && isGfmTableSeparator(sepLine)
}

export function scanGfmTableBlocks(doc: string): GfmTableRange[] {
  const lines = doc.split('\n')
  const out: GfmTableRange[] = []
  let offset = 0
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    const next = lines[i + 1] ?? ''

    if (isGfmTableStart(line, next)) {
      const start = offset
      const blockLines = [line, next]
      i += 2
      while (i < lines.length && isGfmTableRow(lines[i])) {
        blockLines.push(lines[i])
        i += 1
      }
      const markdown = blockLines.join('\n')
      const end = start + markdown.length
      out.push({ from: start, to: end, markdown })
      offset = end + 1
      continue
    }

    offset += line.length + 1
    i += 1
  }

  return out
}
