import { describe, expect, it } from 'vitest'
import {
  activeOutlineId,
  buildOutlineTree,
  resolveOutlinePos,
  scanDocOutline,
} from './markdownOutline'

describe('markdownOutline', () => {
  it('extracts markdown headings', () => {
    const doc = '# Title\n\n## Section A\n\n### Sub'
    const items = scanDocOutline(doc)
    expect(items).toHaveLength(3)
    expect(items[0]).toMatchObject({ label: 'Title', level: 1 })
    expect(items[1]).toMatchObject({ label: 'Section A', level: 2 })
    expect(items[2]).toMatchObject({ label: 'Sub', level: 3 })
  })

  it('skips frontmatter', () => {
    const doc = '---\ntitle: x\n---\n\n# Real Title'
    const items = scanDocOutline(doc)
    expect(items).toHaveLength(1)
    expect(items[0].label).toBe('Real Title')
  })

  it('skips headings inside fenced code blocks', () => {
    const doc = '```\n# fake\n```\n\n## Real'
    const items = scanDocOutline(doc)
    expect(items).toHaveLength(1)
    expect(items[0].label).toBe('Real')
  })

  it('merges nearby html anchor with heading', () => {
    const doc = '<a id="overview"></a>\n## 一、考试概览\n\nbody'
    const items = scanDocOutline(doc)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      label: '一、考试概览',
      level: 2,
      anchorId: 'overview',
      id: 'overview',
    })
    expect(resolveOutlinePos(doc, items[0])).toBe(0)
  })

  it('builds nested tree', () => {
    const items = scanDocOutline('# A\n## B\n### C\n## D')
    const tree = buildOutlineTree(items)
    expect(tree).toHaveLength(1)
    expect(tree[0].children).toHaveLength(2)
    expect(tree[0].children[0].children).toHaveLength(1)
    expect(tree[0].children[0].children[0].item.label).toBe('C')
  })

  it('resolves active outline id from scroll position', () => {
    const doc = '# A\n\npara\n\n## B\n\nmore'
    const items = scanDocOutline(doc)
    const bPos = items[1].from
    expect(activeOutlineId(items, 0)).toBe(items[0].id)
    expect(activeOutlineId(items, bPos)).toBe(items[1].id)
    expect(activeOutlineId(items, bPos + 100)).toBe(items[1].id)
  })

  it('does not skip headings after unclosed fenced code block (regression)', () => {
    const doc = '# Title\n## 模块一\n### a\n```\ncode without closing fence\n## 模块二\n### b'
    const items = scanDocOutline(doc)
    const labels = items.map((i) => i.label)
    expect(labels).toContain('模块二')
    expect(labels).toContain('b')
  })

  it('still skips headings inside properly closed fenced code block', () => {
    const doc = '## Real\n```\n# fake\n```\n## After'
    const labels = scanDocOutline(doc).map((i) => i.label)
    expect(labels).toEqual(['Real', 'After'])
  })

  it('ignores inline fence openers with content on same line', () => {
    const doc = '## A\n```cpp int main() {}\n## B'
    const labels = scanDocOutline(doc).map((i) => i.label)
    expect(labels).toEqual(['A', 'B'])
  })
})
