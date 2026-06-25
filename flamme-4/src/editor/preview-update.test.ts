import { describe, expect, it } from 'vitest'
import { EditorState, EditorSelection } from '@codemirror/state'
import type { ViewUpdate } from '@codemirror/view'
import {
  syntaxPreviewShouldRebuild,
  widgetPreviewShouldRebuild,
  __testSetViewportScrollActive,
} from './preview-update'

function mockUpdate(
  startDoc: string,
  startSel: { from: number; to: number },
  endDoc: string,
  endSel: { from: number; to: number },
  flags: { docChanged?: boolean; viewportChanged?: boolean; selectionSet?: boolean },
): ViewUpdate {
  const startState = EditorState.create({
    doc: startDoc,
    selection: EditorSelection.range(startSel.from, startSel.to),
  })
  const state = EditorState.create({
    doc: endDoc,
    selection: EditorSelection.range(endSel.from, endSel.to),
  })
  return {
    startState,
    state,
    docChanged: flags.docChanged ?? false,
    viewportChanged: flags.viewportChanged ?? false,
    selectionSet: flags.selectionSet ?? false,
  } as unknown as ViewUpdate
}

describe('widgetPreviewShouldRebuild', () => {
  it('rebuilds on docChanged', () => {
    const u = mockUpdate('a', { from: 0, to: 0 }, 'ab', { from: 0, to: 0 }, { docChanged: true })
    expect(widgetPreviewShouldRebuild(u)).toBe(true)
  })

  it('skips viewportChanged during active range selection', () => {
    const doc = 'line1\nline2\nline3'
    const u = mockUpdate(
      doc,
      { from: 0, to: 3 },
      doc,
      { from: 0, to: 10 },
      { viewportChanged: true, selectionSet: true },
    )
    expect(widgetPreviewShouldRebuild(u)).toBe(false)
  })

  it('skips viewportChanged while scroll is active', () => {
    __testSetViewportScrollActive(true)
    const doc = 'line1\nline2\nline3'
    const u = mockUpdate(
      doc,
      { from: 0, to: 0 },
      doc,
      { from: 0, to: 0 },
      { viewportChanged: true },
    )
    expect(widgetPreviewShouldRebuild(u)).toBe(false)
    __testSetViewportScrollActive(false)
  })

  it('rebuilds on viewportChanged when caret is collapsed and not scrolling', () => {
    const doc = 'line1\nline2\nline3'
    const u = mockUpdate(
      doc,
      { from: 0, to: 0 },
      doc,
      { from: 0, to: 0 },
      { viewportChanged: true },
    )
    expect(widgetPreviewShouldRebuild(u)).toBe(true)
  })

  it('skips selectionSet during active range selection', () => {
    const doc = 'line1\nline2\nline3'
    const u = mockUpdate(
      doc,
      { from: 0, to: 3 },
      doc,
      { from: 0, to: 10 },
      { selectionSet: true },
    )
    expect(widgetPreviewShouldRebuild(u)).toBe(false)
  })
})

describe('syntaxPreviewShouldRebuild', () => {
  it('ignores viewportChanged', () => {
    const doc = 'line1\nline2\nline3'
    const u = mockUpdate(
      doc,
      { from: 0, to: 0 },
      doc,
      { from: 0, to: 0 },
      { viewportChanged: true },
    )
    expect(syntaxPreviewShouldRebuild(u)).toBe(false)
  })

  it('rebuilds when range selection collapses to caret', () => {
    const doc = 'line1\nline2\nline3'
    const u = mockUpdate(
      doc,
      { from: 0, to: 10 },
      doc,
      { from: 10, to: 10 },
      { selectionSet: true },
    )
    expect(syntaxPreviewShouldRebuild(u)).toBe(true)
  })
})
