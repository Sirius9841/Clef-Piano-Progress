import { describe, expect, it } from 'vitest'
import type { AttemptSummary } from '../../persistence/types'
import { detectPersonalBestEvents, derivePersonalBests, deriveRollingMetrics } from '../model'

function summary(id: string, notes: number | null, overrides: Partial<AttemptSummary> = {}): AttemptSummary {
  return {
    id,
    arrangementId: 'arr-1',
    scoreVersionId: 'score-1',
    practiceSessionId: `session-${id}`,
    performedAt: `2026-08-${id.padStart(2, '0')}T12:00:00.000Z`,
    durationMs: 60_000,
    practiceSpeedMultiplier: 1,
    gradingScope: 'full-plan',
    reliability: 'reliable',
    notes,
    rhythm: notes,
    tempo: notes,
    ...overrides,
  }
}

describe('progress model', () => {
  it('labels the first full result without claiming a new record', () => {
    expect(detectPersonalBestEvents(summary('1', 0.8), [])).toEqual([
      { metric: 'notes', kind: 'first-full-result', value: 0.8, previousValue: null },
      { metric: 'rhythm', kind: 'first-full-result', value: 0.8, previousValue: null },
      { metric: 'tempo', kind: 'first-full-result', value: 0.8, previousValue: null },
    ])
  })

  it('requires a strict improvement in the same score, scope, arrangement, and speed context', () => {
    const prior = summary('1', 0.8)
    expect(detectPersonalBestEvents(summary('2', 0.8), [prior])).toEqual([])
    expect(detectPersonalBestEvents(summary('2', 0.9), [prior]).map((event) => event.metric)).toEqual(['notes', 'rhythm', 'tempo'])
    expect(detectPersonalBestEvents(summary('2', 0.9, { practiceSpeedMultiplier: 0.75 }), [prior]).every((event) => event.kind === 'first-full-result')).toBe(true)
    expect(detectPersonalBestEvents(summary('2', 0.9, { scoreVersionId: 'score-2' }), [prior]).every((event) => event.kind === 'first-full-result')).toBe(true)
  })

  it('never promotes a partial take to a headline personal best', () => {
    const partial = summary('2', 1, { gradingScope: 'aligned-span' })
    expect(detectPersonalBestEvents(partial, [summary('1', 0.5)])).toEqual([])
    expect(derivePersonalBests([partial])).toEqual([])
  })

  it('derives deterministic personal bests and rolling last-five windows', () => {
    const attempts = Array.from({ length: 10 }, (_, index) => summary(String(index + 1), (index + 1) / 10))
    expect(derivePersonalBests(attempts)[0]).toMatchObject({ metric: 'notes', value: 1, attemptId: '10' })
    expect(deriveRollingMetrics(attempts)[0]).toMatchObject({ currentAverage: 0.8, previousAverage: 0.3, change: 0.5, currentCount: 5, previousCount: 5 })
    expect(deriveRollingMetrics([...attempts].reverse())).toEqual(deriveRollingMetrics(attempts))
  })

  it('remains deterministic across a realistic 50-arrangement, 2,000-attempt fixture', () => {
    const attempts = Array.from({ length: 2_000 }, (_, index) => summary(String(index + 1), (index % 101) / 100, {
      arrangementId: `arr-${index % 50}`,
      scoreVersionId: `score-${index % 50}`,
      practiceSessionId: `session-${index % 500}`,
      performedAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
    }))
    const selected = attempts.filter((attempt) => attempt.arrangementId === 'arr-0')
    expect(selected).toHaveLength(40)
    expect(derivePersonalBests(selected)).toEqual(derivePersonalBests([...selected].reverse()))
    expect(deriveRollingMetrics(selected)).toEqual(deriveRollingMetrics([...selected].reverse()))
  })
})
