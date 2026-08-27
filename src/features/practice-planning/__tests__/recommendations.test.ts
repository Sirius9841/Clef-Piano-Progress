import { describe, expect, it } from 'vitest'
import { DEFAULT_PRACTICE_PLANNING_OPTIONS } from '../options'
import { derivePracticePlanning } from '../recommendations'
import { preparePracticePlanningContext } from '../prepareContext'
import { composePracticeSessionPlan } from '../sessionPlan'
import type { PracticeRecommendation } from '../types'
import { attemptFixture, repositoryFixture, techniqueSummary } from './fixtures'

const AS_OF = '2026-08-26T12:00:00.000Z'

async function prepare(fixtures: readonly ReturnType<typeof attemptFixture>[], techniques = [] as ReturnType<typeof techniqueSummary>[]) {
  const source = repositoryFixture(fixtures, techniques)
  return preparePracticePlanningContext({ repository: source.repository, arrangementId: 'arrangement-1', scoreVersionId: 'score-version-1', asOf: AS_OF })
}

describe('Practice Planning recommendations and session composition', () => {
  it('does not increase speed after one excellent take', async () => {
    const result = derivePracticePlanning(await prepare([attemptFixture('excellent', { score: 0.96, speed: 0.8 })]))
    expect(result.recommendations.some((item) => item.kind === 'increase-speed')).toBe(false)
  })

  it('does not treat several excellent same-session takes as independent progression support', async () => {
    const context = await prepare(Array.from({ length: 4 }, (_, index) => attemptFixture(`excellent-${index}`, { sessionId: 'S1', score: 0.96, speed: 0.8, performedAt: `2026-08-${20 + index}T12:00:00.000Z` })))
    const result = derivePracticePlanning(context)
    expect(result.recommendations.some((item) => item.kind === 'increase-speed')).toBe(false)
  })

  it('permits a conservative five-point increase after controlled evidence in two current sessions', async () => {
    const result = derivePracticePlanning(await prepare([
      attemptFixture('excellent-a', { sessionId: 'S1', score: 0.96, speed: 0.8 }),
      attemptFixture('excellent-b', { sessionId: 'S2', score: 0.95, speed: 0.8, performedAt: '2026-08-23T12:00:00.000Z' }),
    ]))
    expect(result.recommendations).toContainEqual(expect.objectContaining({ kind: 'increase-speed', suggestedPracticeSpeedMultiplier: 0.85 }))
  })

  it('caps suggested speed at 100 percent', async () => {
    const result = derivePracticePlanning(await prepare([
      attemptFixture('excellent-a', { sessionId: 'S1', score: 0.96, speed: 0.98 }),
      attemptFixture('excellent-b', { sessionId: 'S2', score: 0.95, speed: 0.98, performedAt: '2026-08-23T12:00:00.000Z' }),
    ]))
    expect(result.recommendations).toContainEqual(expect.objectContaining({ kind: 'increase-speed', suggestedPracticeSpeedMultiplier: 1 }))
    const atTarget = derivePracticePlanning(await prepare([
      attemptFixture('target-a', { sessionId: 'S1', score: 0.96, speed: 1 }),
      attemptFixture('target-b', { sessionId: 'S2', score: 0.95, speed: 1, performedAt: '2026-08-23T12:00:00.000Z' }),
    ]))
    expect(atTarget.recommendations.some((item) => item.kind === 'increase-speed')).toBe(false)
  })

  it('does not reduce speed after one poor take', async () => {
    const result = derivePracticePlanning(await prepare([attemptFixture('poor', { score: 0.5, speed: 0.8 })]))
    expect(result.recommendations.some((item) => item.kind === 'reduce-speed')).toBe(false)
  })

  it('may hold or reduce only after repeated same-speed weakness across independent sessions', async () => {
    const severe = derivePracticePlanning(await prepare([
      attemptFixture('poor-a', { sessionId: 'S1', score: 0.5, speed: 0.8 }),
      attemptFixture('poor-b', { sessionId: 'S2', score: 0.55, speed: 0.8, performedAt: '2026-08-23T12:00:00.000Z' }),
    ]))
    expect(severe.recommendations).toContainEqual(expect.objectContaining({ kind: 'reduce-speed', suggestedPracticeSpeedMultiplier: 0.75 }))
    const moderate = derivePracticePlanning(await prepare([
      attemptFixture('review-a', { sessionId: 'S1', score: 0.74, speed: 0.8 }),
      attemptFixture('review-b', { sessionId: 'S2', score: 0.76, speed: 0.8, performedAt: '2026-08-23T12:00:00.000Z' }),
    ]))
    expect(moderate.recommendations).toContainEqual(expect.objectContaining({ kind: 'hold-speed', suggestedPracticeSpeedMultiplier: 0.8 }))
  })

  it('uses Mastery needs-repetition as a full-run verification request', async () => {
    const context = await prepare([attemptFixture('one-good-run', { score: 0.95, speed: 0.8 })])
    expect(context.mastery.demonstratedSpeedStatus).toBe('needs-repetition')
    const recommendation = derivePracticePlanning(context).recommendations.find((item) => item.kind === 'full-run')
    expect(recommendation).toMatchObject({ suggestedPracticeSpeedMultiplier: 0.8, reasons: [expect.objectContaining({ code: 'mastery-needs-repetition', masteryStatus: 'needs-repetition' })] })
  })

  it('uses Mastery needs-current-support as a current-evidence request, never an established-speed claim', async () => {
    const context = await prepare([
      attemptFixture('old-a', { sessionId: 'S1', score: 0.95, speed: 1, performedAt: '2025-08-20T12:00:00.000Z' }),
      attemptFixture('old-b', { sessionId: 'S2', score: 0.95, speed: 1, performedAt: '2025-08-19T12:00:00.000Z' }),
    ])
    expect(context.mastery.demonstratedSpeedStatus).toBe('needs-current-support')
    const recommendation = derivePracticePlanning(context).recommendations.find((item) => item.kind === 'full-run')
    expect(recommendation?.reasons[0]).toMatchObject({ code: 'mastery-needs-current-support', masteryStatus: 'needs-current-support' })
    expect(recommendation?.reasons[0]?.code).not.toBe('strong-section-control-at-speed')
  })

  it('does not mutate Mastery, Skill, or user-controlled repertoire state', async () => {
    const repertoireStatus = { value: 'Learning' }
    const context = await prepare([attemptFixture('one-good-run', { score: 0.95 })])
    const masteryBefore = JSON.stringify(context.mastery)
    const skillsBefore = JSON.stringify(context.skills)
    derivePracticePlanning(context)
    expect(JSON.stringify(context.mastery)).toBe(masteryBefore)
    expect(JSON.stringify(context.skills)).toBe(skillsBefore)
    expect(repertoireStatus.value).toBe('Learning')
  })

  it('creates an independent Technique target from low quality with supported confidence', async () => {
    const techniques = [0, 2, 4].map((tonic, index) => techniqueSummary(`scale-${index}`, 'scales', 60, { tonic }))
    const result = derivePracticePlanning(await prepare([], techniques))
    const recommendation = result.recommendations.find((item) => item.kind === 'technique-drill')
    expect(recommendation?.target).toEqual({ type: 'technique', moduleId: 'scales', requiresNewStimulus: false })
    expect(recommendation?.reasons[0]).toMatchObject({ code: 'supported-technique-opportunity', skillModuleId: 'scales' })
  })

  it('uses refresh-technique-evidence for low-confidence Skill evidence', async () => {
    const result = derivePracticePlanning(await prepare([], [techniqueSummary('scale', 'scales', 55)]))
    expect(result.recommendations).toContainEqual(expect.objectContaining({ kind: 'refresh-technique-evidence', target: { type: 'technique', moduleId: 'scales', requiresNewStimulus: false } }))
    expect(result.recommendations.some((item) => item.kind === 'technique-drill')).toBe(false)
  })

  it('never structurally claims that a Technique Skill caused a repertoire section problem', async () => {
    const techniques = [0, 2, 4].map((tonic, index) => techniqueSummary(`scale-${index}`, 'scales', 60, { tonic }))
    const result = derivePracticePlanning(await prepare([
      attemptFixture('poor-a', { sessionId: 'S1', score: 0.5 }),
      attemptFixture('poor-b', { sessionId: 'S2', score: 0.5, performedAt: '2026-08-23T12:00:00.000Z' }),
    ], techniques))
    const technique = result.recommendations.find((item) => item.target.type === 'technique')!
    expect(technique.target).not.toHaveProperty('section')
    expect(technique.reasons.every((item) => item.dimension === null)).toBe(true)
    expect(JSON.stringify(result)).not.toContain('caused')
  })

  it('retains new first-pass stimulus semantics for Sight Reading', async () => {
    const techniques = [0, 2, 4].map((tonic, index) => techniqueSummary(`sight-${index}`, 'sight-reading', 60, { tonic, firstPass: true }))
    const result = derivePracticePlanning(await prepare([], techniques))
    expect(result.recommendations).toContainEqual(expect.objectContaining({ target: { type: 'technique', moduleId: 'sight-reading', requiresNewStimulus: true } }))
  })

  it.each([15, 30, 60])('keeps a %i-minute deterministic plan within budget with positive blocks', async (availableMinutes) => {
    const techniques = [0, 2, 4].map((tonic, index) => techniqueSummary(`scale-${index}`, 'scales', 60, { tonic }))
    const context = await prepare([
      attemptFixture('poor-a', { sessionId: 'S1', score: 0.5, durationMs: 480_000 }),
      attemptFixture('poor-b', { sessionId: 'S2', score: 0.5, durationMs: 480_000, performedAt: '2026-08-23T12:00:00.000Z' }),
    ], techniques)
    const first = derivePracticePlanning(context, { availableMinutes })
    const second = derivePracticePlanning(context, { availableMinutes })
    expect(first.sessionPlan).toEqual(second.sessionPlan)
    expect(first.sessionPlan!.totalSuggestedMinutes).toBeLessThanOrEqual(availableMinutes)
    expect(first.sessionPlan!.blocks.length).toBeLessThanOrEqual(4)
    expect(first.sessionPlan!.blocks.every((block) => block.suggestedMinutes > 0)).toBe(true)
  })

  it('allocates more time to a primary supported recommendation than a tentative one', () => {
    const recommendation = (id: string, evidenceStrength: PracticeRecommendation['evidenceStrength']): PracticeRecommendation => ({
      id,
      rank: id === 'supported' ? 1 : 2,
      kind: id === 'supported' ? 'focus-section' : 'verify-section',
      target: { type: 'arrangement', arrangementId: 'arrangement-1', scoreVersionId: 'score-version-1' },
      suggestedPracticeSpeedMultiplier: null,
      evidenceStrength,
      reasons: [],
      evidenceAttemptIds: [],
      evidenceSessionIds: [],
      lastEvidenceAt: null,
    })
    const plan = composePracticeSessionPlan(
      [recommendation('supported', 'supported'), recommendation('tentative', 'tentative')],
      15,
      { estimatedMinutes: null, practiceSpeedMultiplier: null, evidenceAttemptIds: [], lastMeasuredAt: null },
      DEFAULT_PRACTICE_PLANNING_OPTIONS,
    )
    expect(plan.blocks[0]!.suggestedMinutes).toBeGreaterThan(plan.blocks[1]!.suggestedMinutes)
  })

  it('rejects invalid session budgets', async () => {
    const context = await prepare([])
    expect(() => derivePracticePlanning(context, { availableMinutes: 0 })).toThrow(RangeError)
    expect(() => derivePracticePlanning(context, { availableMinutes: 12.5 })).toThrow(RangeError)
  })

  it('omits a full run when the evidence-backed duration cannot fit', async () => {
    const context = await prepare([attemptFixture('long-run', { score: 0.95, speed: 0.8, durationMs: 20 * 60_000 })])
    const result = derivePracticePlanning(context, { availableMinutes: 15 })
    expect(context.fullRunDuration.estimatedMinutes).toBe(20)
    expect(result.sessionPlan?.blocks.some((block) => block.kind === 'full-run')).toBe(false)
  })

  it('does not invent a full-run duration when no trustworthy duration exists', async () => {
    const context = await prepare([attemptFixture('unknown-duration', { score: 0.95, speed: 0.8, durationMs: 0 })])
    const result = derivePracticePlanning(context, { availableMinutes: 30 })
    expect(context.fullRunDuration).toMatchObject({ estimatedMinutes: null, evidenceAttemptIds: [] })
    expect(result.sessionPlan?.blocks.some((block) => block.kind === 'full-run')).toBe(false)
  })

  it('deep-freezes the result, recommendation provenance, and session plan', async () => {
    const result = derivePracticePlanning(await prepare([attemptFixture('poor', { score: 0.5 })]), { availableMinutes: 15 })
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.sectionHistories)).toBe(true)
    expect(Object.isFrozen(result.sectionHistories[0]!.dimensions)).toBe(true)
    expect(Object.isFrozen(result.recommendations)).toBe(true)
    expect(Object.isFrozen(result.recommendations[0]!.reasons)).toBe(true)
    expect(Object.isFrozen(result.sessionPlan?.blocks)).toBe(true)
  })
})
