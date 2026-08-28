import { describe, expect, it } from 'vitest'
import { summaryRepairPresentation } from './repairPresentation'

describe('summary repair presentation', () => {
  it('claims verified success only for a healthy final report', () => {
    expect(summaryRepairPresentation({ status: 'healthy', totalIssueCount: 0 })).toEqual({
      message: 'Derived summaries rebuilt and integrity verified.',
      error: null,
    })
  })

  it('shows a factual error and never a verified-success claim for remaining issues', () => {
    const presentation = summaryRepairPresentation({ status: 'issues-found', totalIssueCount: 2 })
    expect(presentation.message).toBeNull()
    expect(presentation.error).toContain('2 issues remain')
    expect(presentation.error).not.toContain('integrity verified')
  })
})
