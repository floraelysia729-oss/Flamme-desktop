import { describe, expect, it } from 'vitest'
import { parseFrontmatterFields, scanFrontmatter } from './frontmatter-ranges'

describe('scanFrontmatter', () => {
  it('detects standard frontmatter at document start', () => {
    const doc = '---\ntitle: Foo\ntags: [a, b]\n---\n\n# Body\n'
    const fm = scanFrontmatter(doc)
    expect(fm).not.toBeNull()
    expect(fm!.from).toBe(0)
    expect(fm!.to).toBe('---\ntitle: Foo\ntags: [a, b]\n---\n'.length)
    expect(fm!.yamlText).toBe('title: Foo\ntags: [a, b]')
  })

  it('returns null without closing delimiter', () => {
    const doc = '---\ntitle: Foo\n\n# Body\n'
    expect(scanFrontmatter(doc)).toBeNull()
  })

  it('ignores horizontal rules in body', () => {
    const doc = '# Title\n\n---\n\nMore text\n'
    expect(scanFrontmatter(doc)).toBeNull()
  })
})

describe('parseFrontmatterFields', () => {
  it('parses simple key-value pairs', () => {
    const fields = parseFrontmatterFields('title: Foo\ndate: 2026-06-01')
    expect(fields).toEqual([
      { key: 'title', value: 'Foo' },
      { key: 'date', value: '2026-06-01' },
    ])
  })

  it('parses array values', () => {
    const fields = parseFrontmatterFields('tags: [markdown, editor, showcase]')
    expect(fields[0]).toEqual({
      key: 'tags',
      value: 'markdown, editor, showcase',
    })
  })
})
