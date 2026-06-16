import { describe, expect, it, beforeEach } from 'vitest'
import { editorScrollKey, useEditorScrollStore } from '../editor/editorScrollStore'

describe('editorScrollStore', () => {
  beforeEach(() => {
    useEditorScrollStore.setState({ entries: {} })
  })

  it('saves and retrieves scroll by vault+path key', () => {
    const key = editorScrollKey('notes/exam.md')
    useEditorScrollStore.getState().saveEntry(key, 120, 480)
    const entry = useEditorScrollStore.getState().getEntry(key)
    expect(entry?.cursor).toBe(120)
    expect(entry?.scrollTop).toBe(480)
  })
})
