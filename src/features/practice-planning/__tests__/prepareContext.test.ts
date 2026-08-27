import { describe, expect, it } from 'vitest'
import { preparePracticePlanningContext } from '../prepareContext'
import { attemptFixture, repositoryFixture } from './fixtures'

const AS_OF = '2026-08-26T12:00:00.000Z'

describe('Practice Planning bounded preparation', () => {
  it('excludes different Arrangement, ScoreVersion, future, and provisional summaries before full reads', async () => {
    const valid = attemptFixture('valid')
    const wrongArrangement = attemptFixture('wrong-arrangement', { arrangementId: 'arrangement-2' })
    const wrongVersion = attemptFixture('wrong-version', { scoreVersionId: 'score-version-2' })
    const future = attemptFixture('future', { performedAt: '2026-08-27T12:00:00.000Z' })
    const provisional = attemptFixture('provisional', { reliability: 'provisional' })
    const fixture = repositoryFixture([valid, wrongArrangement, wrongVersion, future, provisional])
    const context = await preparePracticePlanningContext({ repository: fixture.repository, arrangementId: 'arrangement-1', scoreVersionId: 'score-version-1', asOf: AS_OF })
    expect(fixture.getAttemptIds).toEqual(['valid'])
    expect(context.exclusions.map((item) => item.code)).toEqual(expect.arrayContaining(['wrong-arrangement', 'different-score-version', 'future-dated-evidence', 'provisional-or-unavailable-attempt']))
    expect(context.attempts.map((attempt) => attempt.attemptId)).toEqual(['valid'])
  })

  it('fails closed for unsupported frozen PerformanceResults semantics', async () => {
    const old = attemptFixture('old-results', { aggregationVersion: '0.9.0' })
    const fixture = repositoryFixture([old])
    const context = await preparePracticePlanningContext({ repository: fixture.repository, arrangementId: 'arrangement-1', scoreVersionId: 'score-version-1', asOf: AS_OF })
    expect(context.attempts).toEqual([])
    expect(context.exclusions).toContainEqual(expect.objectContaining({ attemptId: 'old-results', code: 'unsupported-result-aggregation-version' }))
  })

  it('reports missing and unreadable authoritative attempts without repairing summaries', async () => {
    const missing = attemptFixture('missing')
    const corrupt = attemptFixture('corrupt')
    const fixture = repositoryFixture([missing, corrupt], [], { missingAttemptIds: ['missing'], throwAttemptIds: ['corrupt'] })
    const context = await preparePracticePlanningContext({ repository: fixture.repository, arrangementId: 'arrangement-1', scoreVersionId: 'score-version-1', asOf: AS_OF })
    expect(context.attempts).toEqual([])
    expect(context.exclusions).toEqual(expect.arrayContaining([
      expect.objectContaining({ attemptId: 'missing', code: 'missing-full-attempt' }),
      expect.objectContaining({ attemptId: 'corrupt', code: 'full-attempt-read-failed' }),
    ]))
  })

  it('cross-checks selected summary and full-attempt identity', async () => {
    const mismatch = attemptFixture('mismatch', { summaryOverrides: { practiceSessionId: 'summary-session' } })
    const fixture = repositoryFixture([mismatch])
    const context = await preparePracticePlanningContext({ repository: fixture.repository, arrangementId: 'arrangement-1', scoreVersionId: 'score-version-1', asOf: AS_OF })
    expect(context.attempts).toEqual([])
    expect(context.exclusions).toContainEqual(expect.objectContaining({ code: 'summary-full-attempt-identity-mismatch' }))
  })

  it('selects only the latest eight sessions', async () => {
    const fixtures = Array.from({ length: 10 }, (_, index) => attemptFixture(`attempt-${index}`, {
      sessionId: `session-${index}`,
      performedAt: `2026-08-${String(10 + index).padStart(2, '0')}T12:00:00.000Z`,
    }))
    const fixture = repositoryFixture(fixtures)
    const context = await preparePracticePlanningContext({ repository: fixture.repository, arrangementId: 'arrangement-1', scoreVersionId: 'score-version-1', asOf: AS_OF })
    expect(context.diagnostics.selectedSessionCount).toBe(8)
    expect(context.diagnostics.fullAttemptReadCount).toBe(8)
    expect(context.exclusions.filter((item) => item.code === 'outside-bounded-history')).toHaveLength(2)
  })

  it('loads at most three attempts per selected session', async () => {
    const fixtures = Array.from({ length: 7 }, (_, index) => attemptFixture(`retry-${index}`, {
      sessionId: 'one-session',
      performedAt: `2026-08-${String(18 + index).padStart(2, '0')}T12:00:00.000Z`,
    }))
    const fixture = repositoryFixture(fixtures)
    const context = await preparePracticePlanningContext({ repository: fixture.repository, arrangementId: 'arrangement-1', scoreVersionId: 'score-version-1', asOf: AS_OF })
    expect(context.diagnostics.selectedSummaryCount).toBe(3)
    expect(context.diagnostics.fullAttemptReadCount).toBe(3)
    expect(fixture.getAttemptIds).toHaveLength(3)
  })

  it('prevents twenty retries in one sitting from crowding out independent sessions', async () => {
    const retries = Array.from({ length: 20 }, (_, index) => attemptFixture(`retry-${index}`, {
      sessionId: 'retry-session',
      performedAt: new Date(Date.UTC(2026, 7, 26, 11, index)).toISOString(),
    }))
    const independent = Array.from({ length: 8 }, (_, index) => attemptFixture(`independent-${index}`, {
      sessionId: `independent-session-${index}`,
      performedAt: `2026-08-${String(18 + index).padStart(2, '0')}T10:00:00.000Z`,
    }))
    const fixture = repositoryFixture([...retries, ...independent])
    const context = await preparePracticePlanningContext({ repository: fixture.repository, arrangementId: 'arrangement-1', scoreVersionId: 'score-version-1', asOf: AS_OF })
    expect(context.diagnostics.selectedSessionCount).toBe(8)
    expect(context.attempts.filter((attempt) => attempt.practiceSessionId === 'retry-session')).toHaveLength(3)
    expect(new Set(context.attempts.map((attempt) => attempt.practiceSessionId)).size).toBe(8)
    expect(context.diagnostics.fullAttemptReadCount).toBeLessThanOrEqual(24)
    expect(context.diagnostics.fullAttemptReadCount).toBeLessThan(retries.length + independent.length)
  })

  it('fails closed when Arrangement or ScoreVersion lookup cannot validate the planning identity', async () => {
    const fixtureValue = attemptFixture('attempt')
    const missingArrangement = repositoryFixture([fixtureValue], [], { arrangementExists: false })
    const first = await preparePracticePlanningContext({ repository: missingArrangement.repository, arrangementId: 'arrangement-1', scoreVersionId: 'score-version-1', asOf: AS_OF })
    expect(first.exclusions).toContainEqual(expect.objectContaining({ code: 'arrangement-not-found' }))
    expect(first.diagnostics.fullAttemptReadCount).toBe(0)
    const wrongScore = repositoryFixture([fixtureValue], [], { scoreArrangementId: 'arrangement-2' })
    const second = await preparePracticePlanningContext({ repository: wrongScore.repository, arrangementId: 'arrangement-1', scoreVersionId: 'score-version-1', asOf: AS_OF })
    expect(second.exclusions).toContainEqual(expect.objectContaining({ code: 'score-version-arrangement-mismatch' }))
    expect(second.diagnostics.fullAttemptReadCount).toBe(0)
  })

  it('rejects invalid explicit asOf instead of consulting Date.now', async () => {
    const fixture = repositoryFixture([])
    await expect(preparePracticePlanningContext({ repository: fixture.repository, arrangementId: 'arrangement-1', scoreVersionId: 'score-version-1', asOf: 'invalid' })).rejects.toThrow(RangeError)
  })

  it('deep-freezes cloned context evidence without freezing repository-owned summaries', async () => {
    const attempt = attemptFixture('attempt')
    const fixture = repositoryFixture([attempt])
    const context = await preparePracticePlanningContext({ repository: fixture.repository, arrangementId: 'arrangement-1', scoreVersionId: 'score-version-1', asOf: AS_OF })
    expect(Object.isFrozen(context.attemptSummaries[0])).toBe(true)
    expect(Object.isFrozen(attempt.summary)).toBe(false)
  })
})
