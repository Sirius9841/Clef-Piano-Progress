import { describe, expect, it } from 'vitest'
import type { AttemptSummary, PersistedScoreVersion } from '../types'
import { scoreVersionNumberForAttempt } from '../history'

describe('historical score-version labels', () => {
  it('resolves each attempt against its own immutable ScoreVersion', () => {
    const attempt = { scoreVersionId: 'score-v1' } as AttemptSummary
    const versions = [{ id: 'score-v1', version: 1 }, { id: 'score-v2', version: 2 }] as PersistedScoreVersion[]
    expect(scoreVersionNumberForAttempt(attempt, versions)).toBe(1)
    expect(scoreVersionNumberForAttempt({ ...attempt, scoreVersionId: 'score-v2' }, versions)).toBe(2)
  })
})
