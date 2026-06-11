import { describe, expect, it } from 'vitest'
import { INGEST_CONCURRENCY, summarizeActiveStage } from './ingest'
import type { IngestStage } from '../api/types'

describe('summarizeActiveStage', () => {
  it('shows running stage with MinerU page detail', () => {
    const stages: IngestStage[] = [
      { id: 'pdf_parse', label: 'PDF 解析 (MinerU)', status: 'ok', detail: '40/40 页' },
      { id: 'save_converted', label: '保存 converted.md', status: 'running' },
    ]
    expect(summarizeActiveStage('course/notes.pdf', stages)).toBe(
      'notes.pdf · 保存 converted.md',
    )
  })

  it('includes detail when stage is running', () => {
    const stages: IngestStage[] = [
      { id: 'pdf_parse', label: 'PDF 解析 (MinerU)', status: 'running', detail: '8/32 页' },
    ]
    expect(summarizeActiveStage('a/b.pdf', stages)).toBe(
      'b.pdf · PDF 解析 (MinerU) (8/32 页)',
    )
  })
})

describe('INGEST_CONCURRENCY', () => {
  it('defaults to 3 parallel workers', () => {
    expect(INGEST_CONCURRENCY).toBe(3)
  })
})
