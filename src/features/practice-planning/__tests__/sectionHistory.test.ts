import { describe, expect, it } from 'vitest'
import type { PerformanceAttemptRecord } from '../../persistence/types'
import { derivePracticePlanning } from '../recommendations'
import { preparePracticePlanningContext } from '../prepareContext'
import { attemptFixture, repositoryFixture } from './fixtures'

const AS_OF = '2026-08-26T12:00:00.000Z'

async function planning(fixtures: readonly ReturnType<typeof attemptFixture>[], asOf = AS_OF) {
  const source = repositoryFixture(fixtures)
  const context = await preparePracticePlanningContext({ repository: source.repository, arrangementId: 'arrangement-1', scoreVersionId: 'score-version-1', asOf })
  return derivePracticePlanning(context)
}

describe('Practice Planning section identity and longitudinal evidence', () => {
  it('aggregates the same exact source-measure section across attempts', async () => {
    const result = await planning([attemptFixture('a', { sessionId: 'S1' }), attemptFixture('b', { sessionId: 'S2' })])
    expect(result.sectionHistories).toHaveLength(1)
    expect(result.sectionHistories[0]!.evidenceAttemptIds).toEqual(['a', 'b'])
  })

  it('does not merge repeated display text with different canonical source IDs', async () => {
    const result = await planning([
      attemptFixture('a', { sourcePrefix: 'first-source', displayRange: 'Measures 1–4' }),
      attemptFixture('b', { sourcePrefix: 'second-source', displayRange: 'Measures 1–4' }),
    ])
    expect(result.sectionHistories).toHaveLength(2)
    expect(new Set(result.sectionHistories.map((history) => history.section.id)).size).toBe(2)
  })

  it('does not merge two-measure and four-measure windows', async () => {
    const result = await planning([
      attemptFixture('two', { sectionLength: 2, sourcePrefix: 'source' }),
      attemptFixture('four', { sectionLength: 4, sourcePrefix: 'source' }),
    ])
    expect(result.sectionHistories).toHaveLength(2)
    expect(result.sectionHistories.map((history) => history.section.endMeasureIndex)).toEqual([1, 3])
  })

  it('excludes a section when any constituent measure is outside attempted scope', async () => {
    const result = await planning([attemptFixture('partial-outside', { scope: 'aligned-span', outsideScopeMeasureIndex: 3 })])
    expect(result.sectionHistories).toEqual([])
    expect(result.exclusions).toContainEqual(expect.objectContaining({ code: 'section-outside-attempted-scope' }))
  })

  it('accepts a partial-scope section when the complete window is contained', async () => {
    const result = await planning([attemptFixture('partial-contained', { scope: 'aligned-span' })])
    expect(result.sectionHistories).toHaveLength(1)
    expect(result.exclusions.some((item) => item.code === 'section-outside-attempted-scope')).toBe(false)
  })

  it('keeps unavailable dimensions null rather than inventing zero', async () => {
    const result = await planning([attemptFixture('notes-only', { rhythm: null, tempo: null })])
    const dimensions = Object.fromEntries(result.sectionHistories[0]!.dimensions.map((dimension) => [dimension.dimension, dimension]))
    expect(dimensions.notes?.qualityEstimate).not.toBeNull()
    expect(dimensions.rhythm).toMatchObject({ qualityEstimate: null, weaknessEstimate: null, rawAttemptCount: 0, evidenceStrength: 'insufficient' })
    expect(dimensions.tempo).toMatchObject({ qualityEstimate: null, weaknessEstimate: null, rawAttemptCount: 0, evidenceStrength: 'insufficient' })
  })

  it('ignores frozen Phase 7 PracticePriority values when deriving Phase 14 evidence and actions', async () => {
    const lowPriority = await planning([attemptFixture('same', { score: 0.55, oldPracticePriority: 0 })])
    const highPriority = await planning([attemptFixture('same', { score: 0.55, oldPracticePriority: 0.95 })])
    expect(highPriority.sectionHistories).toEqual(lowPriority.sectionHistories)
    expect(highPriority.recommendations).toEqual(lowPriority.recommendations)
  })

  it('turns one poor take into verification, not persistent weakness', async () => {
    const result = await planning([attemptFixture('poor', { score: 0.55 })])
    expect(result.recommendations.some((item) => item.kind === 'verify-section')).toBe(true)
    expect(result.recommendations.some((item) => item.kind === 'focus-section')).toBe(false)
  })

  it('caps six same-session poor takes and does not claim independent persistence', async () => {
    const fixtures = Array.from({ length: 6 }, (_, index) => attemptFixture(`poor-${index}`, {
      sessionId: 'same-session', score: 0.55, performedAt: `2026-08-${String(19 + index).padStart(2, '0')}T12:00:00.000Z`,
    }))
    const result = await planning(fixtures)
    const notes = result.sectionHistories[0]!.dimensions.find((dimension) => dimension.dimension === 'notes')!
    expect(notes.rawSessionCount).toBe(1)
    expect(notes.effectiveSessionSupport).toBeLessThanOrEqual(1)
    expect(result.recommendations.some((item) => item.kind === 'focus-section')).toBe(false)
  })

  it('establishes focus from repeated weakness in two current independent sessions', async () => {
    const result = await planning([
      attemptFixture('poor-a', { sessionId: 'S1', score: 0.55 }),
      attemptFixture('poor-b', { sessionId: 'S2', score: 0.58, performedAt: '2026-08-23T12:00:00.000Z' }),
    ])
    const focus = result.recommendations.find((item) => item.kind === 'focus-section')
    expect(focus).toBeDefined()
    expect(focus?.evidenceSessionIds).toEqual(['S1', 'S2'])
    expect(focus?.reasons.every((item) => item.code === 'supported-section-weakness')).toBe(true)
  })

  it('lets ancient weakness lose current authority as asOf advances without history mutation', async () => {
    const fixtures = [
      attemptFixture('old-a', { sessionId: 'S1', score: 0.5, performedAt: '2026-08-20T12:00:00.000Z' }),
      attemptFixture('old-b', { sessionId: 'S2', score: 0.5, performedAt: '2026-08-19T12:00:00.000Z' }),
    ]
    const current = await planning(fixtures, AS_OF)
    const later = await planning(fixtures, '2028-08-26T12:00:00.000Z')
    const currentNotes = current.sectionHistories[0]!.dimensions[0]!
    const laterNotes = later.sectionHistories[0]!.dimensions[0]!
    expect(laterNotes.effectiveSessionSupport).toBeLessThan(currentNotes.effectiveSessionSupport)
    expect(later.recommendations.some((item) => item.kind === 'focus-section')).toBe(false)
  })

  it('gives limited evidence less authority than equivalent reliable evidence', async () => {
    const reliable = await planning([attemptFixture('same', { score: 0.6, reliability: 'reliable' })])
    const limited = await planning([attemptFixture('same', { score: 0.6, reliability: 'limited' })])
    expect(limited.sectionHistories[0]!.dimensions[0]!.effectiveAttemptSupport).toBeLessThan(reliable.sectionHistories[0]!.dimensions[0]!.effectiveAttemptSupport)
  })

  it('is deterministic under shuffled repository ordering', async () => {
    const fixtures = [
      attemptFixture('a', { sessionId: 'S1', score: 0.6 }),
      attemptFixture('b', { sessionId: 'S2', score: 0.7, performedAt: '2026-08-23T12:00:00.000Z' }),
      attemptFixture('c', { sessionId: 'S3', score: 0.9, performedAt: '2026-08-22T12:00:00.000Z' }),
    ]
    expect(await planning([...fixtures].reverse())).toEqual(await planning(fixtures))
  })

  it('keeps mixed-speed trend explicitly insufficient instead of claiming regression', async () => {
    const result = await planning([
      attemptFixture('slow', { sessionId: 'S1', speed: 0.7, score: 0.9 }),
      attemptFixture('fast', { sessionId: 'S2', speed: 0.9, score: 0.7, performedAt: '2026-08-25T12:00:00.000Z' }),
    ])
    const notes = result.sectionHistories[0]!.dimensions[0]!
    expect(notes.speedContexts).toHaveLength(2)
    expect(notes.trend).toBe('insufficient')
    expect(notes).not.toHaveProperty('regression')
  })

  it('fails closed on malformed section topology', async () => {
    const fixture = attemptFixture('malformed')
    const section = fixture.record.performanceResults.sections[0]!
    const malformedRecord = {
      ...fixture.record,
      performanceResults: { ...fixture.record.performanceResults, sections: [{ ...section, sourceMeasureIds: ['unrelated-source'] }] },
    } as PerformanceAttemptRecord
    const source = repositoryFixture([{ record: malformedRecord, summary: fixture.summary }])
    const context = await preparePracticePlanningContext({ repository: source.repository, arrangementId: 'arrangement-1', scoreVersionId: 'score-version-1', asOf: AS_OF })
    expect(context.attempts[0]?.sectionObservations).toEqual([])
    expect(context.exclusions).toContainEqual(expect.objectContaining({ code: 'malformed-section-topology' }))
  })
})
