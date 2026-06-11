import { describe, expect, it } from 'vitest'
import {
  assessHierarchyQuality,
  pickNetworkLayout,
  resolveLayoutMode,
} from './layoutMode'
import { applyHierarchyLayout, type LayoutNode } from './treeLayout'
import { computeForceLayoutParams, fuzzyMatchNode } from './graphVisual'
import type { GraphNode } from './types'

describe('pickNetworkLayout', () => {
  it('prefers force when few communities', () => {
    const nodes = Array.from({ length: 10 }, (_, i) => ({
      id: `n${i}`,
      label: `N${i}`,
      type: 'entity',
      community: 0,
    }))
    expect(pickNetworkLayout(nodes)).toBe('force')
  })

  it('picks community when 3+ communities', () => {
    const nodes: GraphNode[] = [
      { id: 'a', label: 'A', type: 'entity', community: 0 },
      { id: 'b', label: 'B', type: 'entity', community: 1 },
      { id: 'c', label: 'C', type: 'entity', community: 2 },
    ]
    expect(pickNetworkLayout(nodes)).toBe('community')
  })
})

describe('resolveLayoutMode', () => {
  it('returns hierarchy when mode is hierarchy', () => {
    const nodes: GraphNode[] = [{ id: 'a', label: 'A', type: 'entity' }]
    expect(resolveLayoutMode('hierarchy', nodes, [])).toBe('hierarchy')
  })

  it('returns network internal layout for network mode', () => {
    const nodes: GraphNode[] = [
      { id: 'a', label: 'A', type: 'entity', community: 0 },
      { id: 'b', label: 'B', type: 'entity', community: 1 },
      { id: 'c', label: 'C', type: 'entity', community: 2 },
    ]
    expect(resolveLayoutMode('network', nodes, [])).toBe('community')
  })
})

describe('applyHierarchyLayout', () => {
  it('does not stack overflow when subtree contains a cycle', () => {
    const nodes: LayoutNode[] = [
      { id: 'root', label: 'Root', type: 'document' },
      { id: 'a', label: 'A', type: 'entity' },
      { id: 'b', label: 'B', type: 'entity' },
    ]
    const links = [
      { source: 'a', target: 'root', label: 'subordinate' },
      { source: 'a', target: 'b', label: 'subordinate' },
      { source: 'b', target: 'a', label: 'subordinate' },
    ]
    expect(() => applyHierarchyLayout(nodes, links)).not.toThrow()
    const { applied, pinnedIds } = applyHierarchyLayout(nodes, links)
    expect(applied).toBe(true)
    expect(pinnedIds.size).toBe(3)
  })

  it('assigns vertical depth on x axis', () => {
    const nodes: LayoutNode[] = [
      { id: 'root', label: 'Root', type: 'entity' },
      { id: 'child', label: 'Child', type: 'entity' },
    ]
    const links = [{ source: 'child', target: 'root', label: 'subordinate' }]
    const { applied, pinnedIds } = applyHierarchyLayout(nodes, links)
    expect(applied).toBe(true)
    expect(pinnedIds.size).toBe(2)
    expect(nodes[0].x).toBe(0)
    expect(nodes[1].x).toBeGreaterThan(0)
  })
})

describe('computeForceLayoutParams', () => {
  it('increases repulsion and link distance for dense graphs', () => {
    const sparse = computeForceLayoutParams(30, 40, false)
    const dense = computeForceLayoutParams(200, 600, false)
    expect(Math.abs(dense.charge)).toBeGreaterThan(Math.abs(sparse.charge))
    expect(dense.linkDistance(1, 1)).toBeGreaterThan(sparse.linkDistance(1, 1))
    expect(dense.collisionRadius(1)).toBeGreaterThan(sparse.collisionRadius(1))
  })
})

describe('fuzzyMatchNode', () => {
  const nodes: GraphNode[] = [
    { id: 'linear-algebra', label: '线性代数', type: 'entity' },
    { id: 'ml', label: '机器学习基础', type: 'entity' },
  ]

  it('matches substring', () => {
    expect(fuzzyMatchNode(nodes, '线性')?.id).toBe('linear-algebra')
  })

  it('prefers shorter label on multiple matches', () => {
    expect(fuzzyMatchNode(nodes, '机器')?.id).toBe('ml')
  })
})

describe('assessHierarchyQuality', () => {
  it('reports high root ratio for sparse hierarchy', () => {
    const nodes = Array.from({ length: 20 }, (_, i) => ({
      id: `n${i}`,
      label: `N${i}`,
      type: 'entity',
    }))
    const links = [{ source: 'n1', target: 'n0', label: 'subordinate' }]
    const m = assessHierarchyQuality(nodes, links)
    expect(m.rootRatio).toBeGreaterThan(0.3)
  })
})
