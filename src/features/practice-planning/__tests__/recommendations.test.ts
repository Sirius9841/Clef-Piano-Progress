import { describe, expect, it } from 'vitest'
import { DEFAULT_PRACTICE_PLANNING_OPTIONS } from '../options'
import { derivePracticePlanning } from '../recommendations'
import { preparePracticePlanningContext } from '../prepareContext'
import { createPlanningSectionIdentity } from '../sectionIdentity'
import { composePracticeSessionPlan } from '../sessionPlan'
import type { PracticeRecommendation, PracticeRecommendationKind, PracticeRecommendationTarget } from '../types'
import { attemptFixture, repositoryFixture, techniqueSummary } from './fixtures'

const AS_OF = '2026-08-26T12:00:00.000Z'

async function prepare(fixtures: readonly ReturnType<typeof attemptFixture>[], techniques = [] as ReturnType<typeof techniqueSummary>[]) {
  const source = repositoryFixture(fixtures, techniques)
  return preparePracticePlanningContext({ repository: source.repository, arrangementId: 'arrangement-1', scoreVersionId: 'score-version-1', asOf: AS_OF })
}

function directRecommendation(
  id: string,
  rank: number,
  kind: PracticeRecommendationKind,
  target: PracticeRecommendationTarget,
  sourcePracticeSpeedMultiplier: number | null = null,
  suggestedPracticeSpeedMultiplier: number | null = null,
): PracticeRecommendation {
  return {
    id,
    rank,
    kind,
    target,
    sourcePracticeSpeedMultiplier,
    suggestedPracticeSpeedMultiplier,
    evidenceStrength: kind === 'verify-section' ? 'single-session' : 'supported',
    reasons: [],
    evidenceAttemptIds: [],
    evidenceSessionIds: [],
    lastEvidenceAt: null,
  }
}

function controlledSpeed(speed: number, prefix: string, score = 0.96) {
  return [
    attemptFixture(`${prefix}-a`, { sessionId: 'S1', score, speed, performedAt: '2026-08-24T12:00:00.000Z' }),
    attemptFixture(`${prefix}-b`, { sessionId: 'S2', score, speed, performedAt: '2026-08-23T12:00:00.000Z' }),
  ]
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
    expect(result.recommendations).toContainEqual(expect.objectContaining({ kind: 'increase-speed', sourcePracticeSpeedMultiplier: 0.8, suggestedPracticeSpeedMultiplier: 0.85 }))
  })

  it('does not let historical 80 percent control override supported target-speed control', async () => {
    const result = derivePracticePlanning(await prepare([...controlledSpeed(0.8, 'slow'), ...controlledSpeed(1, 'target')]))
    expect(result.recommendations.some((item) => item.kind === 'increase-speed')).toBe(false)
  })

  it('advances only from the highest controlled speed frontier', async () => {
    const result = derivePracticePlanning(await prepare([
      ...controlledSpeed(0.7, 'slow'),
      ...controlledSpeed(0.8, 'middle'),
      ...controlledSpeed(0.9, 'frontier'),
    ]))
    const increases = result.recommendations.filter((item) => item.kind === 'increase-speed')
    expect(increases).toEqual([expect.objectContaining({ sourcePracticeSpeedMultiplier: 0.9, suggestedPracticeSpeedMultiplier: 0.95 })])
  })

  it('holds a tentatively attempted higher frontier instead of advising a lower historical increase', async () => {
    const result = derivePracticePlanning(await prepare([
      ...controlledSpeed(0.8, 'controlled'),
      attemptFixture('tentative-90', { sessionId: 'S3', speed: 0.9, score: 0.5, performedAt: '2026-08-25T12:00:00.000Z' }),
    ]))
    expect(result.recommendations.some((item) => item.kind === 'increase-speed')).toBe(false)
    expect(result.recommendations).toContainEqual(expect.objectContaining({
      kind: 'hold-speed',
      sourcePracticeSpeedMultiplier: 0.9,
      suggestedPracticeSpeedMultiplier: 0.9,
      reasons: expect.arrayContaining([expect.objectContaining({ code: 'frontier-needs-verification' })]),
    }))
  })

  it('lets persistent weakness at the higher frontier win over lower-speed control', async () => {
    const result = derivePracticePlanning(await prepare([
      ...controlledSpeed(0.8, 'controlled'),
      attemptFixture('weak-90-a', { sessionId: 'S1', speed: 0.9, score: 0.5, performedAt: '2026-08-25T12:00:00.000Z' }),
      attemptFixture('weak-90-b', { sessionId: 'S2', speed: 0.9, score: 0.55, performedAt: '2026-08-24T13:00:00.000Z' }),
    ]))
    expect(result.recommendations.some((item) => item.kind === 'increase-speed')).toBe(false)
    expect(result.recommendations).toContainEqual(expect.objectContaining({ kind: 'reduce-speed', sourcePracticeSpeedMultiplier: 0.9, suggestedPracticeSpeedMultiplier: 0.85 }))
  })

  it('does not increase from 90 percent when target speed is already controlled', async () => {
    const result = derivePracticePlanning(await prepare([...controlledSpeed(0.9, 'frontier'), ...controlledSpeed(1, 'target')]))
    expect(result.recommendations.some((item) => item.kind === 'increase-speed')).toBe(false)
  })

  it('selects the same speed frontier regardless of input ordering', async () => {
    const fixtures = [...controlledSpeed(0.7, 'slow'), ...controlledSpeed(0.8, 'middle'), ...controlledSpeed(0.9, 'frontier')]
    expect(derivePracticePlanning(await prepare(fixtures)).recommendations).toEqual(derivePracticePlanning(await prepare([...fixtures].reverse())).recommendations)
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

  it('holds at the configured floor instead of emitting a no-op reduction', async () => {
    const result = derivePracticePlanning(await prepare([
      attemptFixture('floor-a', { sessionId: 'S1', score: 0.5, speed: 0.5 }),
      attemptFixture('floor-b', { sessionId: 'S2', score: 0.5, speed: 0.5, performedAt: '2026-08-23T12:00:00.000Z' }),
    ]))
    expect(result.recommendations).toContainEqual(expect.objectContaining({ kind: 'hold-speed', sourcePracticeSpeedMultiplier: 0.5, suggestedPracticeSpeedMultiplier: 0.5 }))
    expect(result.recommendations.some((item) => item.kind === 'reduce-speed')).toBe(false)
  })

  it('keeps every speed action numerically consistent with its label and configured bounds', async () => {
    const results = await Promise.all([
      prepare(controlledSpeed(0.8, 'increase')).then((context) => derivePracticePlanning(context)),
      prepare([
        attemptFixture('reduce-a', { sessionId: 'S1', score: 0.5, speed: 0.8 }),
        attemptFixture('reduce-b', { sessionId: 'S2', score: 0.5, speed: 0.8, performedAt: '2026-08-23T12:00:00.000Z' }),
      ]).then((context) => derivePracticePlanning(context)),
      prepare([
        attemptFixture('floor-a', { sessionId: 'S1', score: 0.5, speed: 0.5 }),
        attemptFixture('floor-b', { sessionId: 'S2', score: 0.5, speed: 0.5, performedAt: '2026-08-23T12:00:00.000Z' }),
      ]).then((context) => derivePracticePlanning(context)),
      prepare([
        attemptFixture('above-target-a', { sessionId: 'S1', score: 0.5, speed: 1.25 }),
        attemptFixture('above-target-b', { sessionId: 'S2', score: 0.5, speed: 1.25, performedAt: '2026-08-23T12:00:00.000Z' }),
      ]).then((context) => derivePracticePlanning(context)),
      prepare(controlledSpeed(0.4, 'below-floor')).then((context) => derivePracticePlanning(context)),
    ])
    expect(results.flatMap((result) => result.recommendations).filter((item) => item.suggestedPracticeSpeedMultiplier !== null).every((item) => item.suggestedPracticeSpeedMultiplier! >= 0.5 && item.suggestedPracticeSpeedMultiplier! <= 1)).toBe(true)
    const actions = results.flatMap((result) => result.recommendations).filter((item) => ['increase-speed', 'hold-speed', 'reduce-speed'].includes(item.kind))
    for (const action of actions) {
      expect(action.sourcePracticeSpeedMultiplier).not.toBeNull()
      expect(action.suggestedPracticeSpeedMultiplier).not.toBeNull()
      expect(action.suggestedPracticeSpeedMultiplier!).toBeGreaterThanOrEqual(0.5)
      expect(action.suggestedPracticeSpeedMultiplier!).toBeLessThanOrEqual(1)
      if (action.kind === 'increase-speed') expect(action.suggestedPracticeSpeedMultiplier!).toBeGreaterThan(action.sourcePracticeSpeedMultiplier!)
      if (action.kind === 'reduce-speed') expect(action.suggestedPracticeSpeedMultiplier!).toBeLessThan(action.sourcePracticeSpeedMultiplier!)
      if (action.kind === 'hold-speed') expect(action.suggestedPracticeSpeedMultiplier).toBe(action.sourcePracticeSpeedMultiplier)
    }
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
    const plan = composePracticeSessionPlan(
      [
        directRecommendation('supported', 1, 'focus-section', { type: 'arrangement', arrangementId: 'arrangement-1', scoreVersionId: 'score-version-1' }),
        directRecommendation('tentative', 2, 'verify-section', { type: 'arrangement', arrangementId: 'arrangement-1', scoreVersionId: 'score-version-1' }),
      ],
      15,
      { estimatedMinutes: null, practiceSpeedMultiplier: null, evidenceAttemptIds: [], lastMeasuredAt: null },
      DEFAULT_PRACTICE_PLANNING_OPTIONS,
    )
    expect(plan.blocks[0]!.suggestedMinutes).toBeGreaterThan(plan.blocks[1]!.suggestedMinutes)
  })

  it.each([
    { label: 'severe', score: 0.5, speedKind: 'reduce-speed', expectedSpeed: 0.75 },
    { label: 'moderate', score: 0.75, speedKind: 'hold-speed', expectedSpeed: 0.8 },
  ] as const)('merges focus and $speedKind provenance into one timed section block for $label weakness', async ({ label, score, speedKind, expectedSpeed }) => {
    const result = derivePracticePlanning(await prepare([
      attemptFixture(`${label}-a`, { sessionId: 'S1', score, speed: 0.8 }),
      attemptFixture(`${label}-b`, { sessionId: 'S2', score, speed: 0.8, performedAt: '2026-08-23T12:00:00.000Z' }),
    ]), { availableMinutes: 15 })
    const focus = result.recommendations.find((item) => item.kind === 'focus-section')!
    const speed = result.recommendations.find((item) => item.kind === speedKind)!
    const sectionBlocks = result.sessionPlan!.blocks.filter((block) => block.target.type === 'section')
    expect(sectionBlocks).toHaveLength(1)
    expect(sectionBlocks[0]).toMatchObject({ recommendationIds: [focus.id, speed.id], suggestedPracticeSpeedMultiplier: expectedSpeed })
  })

  it('keeps distinct canonical sections separate even when their display text matches', () => {
    const first = createPlanningSectionIdentity('score-version-1', { startMeasureIndex: 0, endMeasureIndex: 1, sourceMeasureIds: ['source-a:0', 'source-a:1'], displayRange: 'Measures 1–2' })
    const second = createPlanningSectionIdentity('score-version-1', { startMeasureIndex: 0, endMeasureIndex: 1, sourceMeasureIds: ['source-b:0', 'source-b:1'], displayRange: 'Measures 1–2' })
    const plan = composePracticeSessionPlan([
      directRecommendation('first', 1, 'focus-section', { type: 'section', section: first }),
      directRecommendation('second', 2, 'focus-section', { type: 'section', section: second }),
    ], 15, { estimatedMinutes: null, practiceSpeedMultiplier: null, evidenceAttemptIds: [], lastMeasuredAt: null }, DEFAULT_PRACTICE_PLANNING_OPTIONS)
    expect(plan.blocks.map((block) => block.kind)).toEqual(['primary-section', 'secondary-section'])
    expect(new Set(plan.blocks.map((block) => block.target.type === 'section' ? block.target.section.id : '')).size).toBe(2)
  })

  it('does not merge section, Technique, or full-run targets', () => {
    const section = createPlanningSectionIdentity('score-version-1', { startMeasureIndex: 0, endMeasureIndex: 1, sourceMeasureIds: ['source:0', 'source:1'], displayRange: 'Measures 1–2' })
    const plan = composePracticeSessionPlan([
      directRecommendation('section', 1, 'focus-section', { type: 'section', section }),
      directRecommendation('technique', 2, 'technique-drill', { type: 'technique', moduleId: 'scales', requiresNewStimulus: false }),
      directRecommendation('run', 3, 'full-run', { type: 'arrangement', arrangementId: 'arrangement-1', scoreVersionId: 'score-version-1' }, null, 0.8),
    ], 20, { estimatedMinutes: 5, practiceSpeedMultiplier: 0.8, evidenceAttemptIds: ['run-attempt'], lastMeasuredAt: AS_OF }, DEFAULT_PRACTICE_PLANNING_OPTIONS)
    expect(plan.blocks).toHaveLength(3)
    expect(plan.blocks.map((block) => block.kind)).toEqual(['primary-section', 'technique-target', 'full-run'])
    expect(plan.blocks[2]).toMatchObject({ recommendationIds: ['run'], suggestedPracticeSpeedMultiplier: 0.8 })
  })

  it('never labels one canonical section as both primary and secondary', async () => {
    const result = derivePracticePlanning(await prepare([
      attemptFixture('poor-a', { sessionId: 'S1', score: 0.5 }),
      attemptFixture('poor-b', { sessionId: 'S2', score: 0.5, performedAt: '2026-08-23T12:00:00.000Z' }),
    ]), { availableMinutes: 15 })
    const sectionBlocks = result.sessionPlan!.blocks.filter((block) => block.target.type === 'section')
    expect(new Set(sectionBlocks.map((block) => block.target.type === 'section' ? block.target.section.id : '')).size).toBe(sectionBlocks.length)
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
