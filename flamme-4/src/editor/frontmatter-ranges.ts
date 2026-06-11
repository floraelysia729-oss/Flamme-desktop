/** 扫描文档开头 YAML frontmatter 区间 */

export interface FrontmatterRange {
  from: number
  to: number
  yamlText: string
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

export function scanFrontmatter(doc: string): FrontmatterRange | null {
  const match = FRONTMATTER_RE.exec(doc)
  if (!match) return null
  return {
    from: 0,
    to: match[0].length,
    yamlText: match[1],
  }
}

export interface FrontmatterField {
  key: string
  value: string
}

const MAX_VALUE_LEN = 80

function formatFieldValue(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const parsed = JSON.parse(trimmed.replace(/'/g, '"'))
      if (Array.isArray(parsed)) {
        return parsed.map(String).join(', ')
      }
    } catch {
      /* fall through */
    }
    return trimmed.slice(1, -1).trim()
  }
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

/** 轻量解析 frontmatter 键值对，供预览 Widget 使用 */
export function parseFrontmatterFields(yamlText: string): FrontmatterField[] {
  const fields: FrontmatterField[] = []
  for (const line of yamlText.split('\n')) {
    const m = line.match(/^([\w.-]+):\s*(.*)$/)
    if (!m) continue
    let value = formatFieldValue(m[2])
    if (value.length > MAX_VALUE_LEN) {
      value = `${value.slice(0, MAX_VALUE_LEN)}…`
    }
    fields.push({ key: m[1], value })
  }
  return fields
}
