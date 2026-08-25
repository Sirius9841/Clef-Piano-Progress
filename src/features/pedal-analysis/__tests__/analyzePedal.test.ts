import { describe, expect, it } from 'vitest'
import { alignPerformance } from '../../alignment/alignPerformance'
import { makePlan, makeRecording } from '../../alignment/__tests__/fixtures'
import { analyzeExpression } from '../../expression-analysis/analyzeExpression'
import { musicalTime } from '../../musicxml/musicalTime'
import type { PedalEvent } from '../../musicxml/types'
import { gradeNotes } from '../../note-grading/gradeNotes'
import type { PerformanceRecording } from '../../performance/types'
import { makeScore } from '../../performance-results/__tests__/fixtures'
import { aggregatePedalPhraseScores, analyzePedal } from '../analyzePedal'

function pedalEvent(id: string, type: PedalEvent['type'], position: number): PedalEvent {
  return { id, type, position: musicalTime(position), measureOnset: musicalTime(position), partId: 'P1', measureIndex: 0, measureNumber: '1', staff: null, voice: null }
}

function setup(values: readonly { ms: number; value: number; channel?: number }[], pedalEvents: PedalEvent[] = [pedalEvent('start', 'start', 0), pedalEvent('stop', 'stop', 3)], overrides: Partial<PerformanceRecording> = {}, attackOffset = 1_000, speed = 1) {
  const plan = makePlan([[60], [62], [64], [65]])
  const base = makeRecording(plan.attacks.map((attack, index) => ({ midi: attack.midi, ms: attackOffset + index * 500 / speed, velocity: 50 + index * 10 })), { planId: plan.id, speed })
  const keyPresses = base.keyPresses.map((press) => ({ ...press, releaseMs: press.attackMs + 250, releaseSequence: press.attackSequence + 10 }))
  const recording: PerformanceRecording = {
    ...base, durationMs: attackOffset + 3 * 500 / speed + 600, initialSustain: { observed: true, down: false, value: 0 }, keyPresses,
    events: values.map((sample, sequence) => ({ sequence, relativeMs: sample.ms, event: { type: 'sustain' as const, channel: sample.channel ?? 0, value: sample.value, down: sample.value >= 64, timestampMs: sample.ms } })),
    statistics: { ...base.statistics, eventCount: values.length, sustainChangeCount: values.length, noteReleaseCount: keyPresses.length, openNoteCount: 0 }, ...overrides,
  }
  const score = { ...makeScore(plan), pedalEvents }
  const alignment = alignPerformance(plan, recording)
  const note = gradeNotes({ expectedPlan: plan, recording, alignment, options: { gradingScope: 'full-plan' } })
  const expression = analyzeExpression({ normalizedScore: score, expectedPlan: plan, recording, alignment, noteGrading: note })
  return { result: analyzePedal({ normalizedScore: score, expectedPlan: plan, recording, alignment, noteGrading: note, expressionAnalysis: expression }), plan, score, recording, alignment, note, expression }
}

function customCase(options: {
  plan: ReturnType<typeof makePlan>
  attackTimes: readonly number[]
  pedalEvents: PedalEvent[]
  values: readonly { ms: number; value: number; channel?: number }[]
  durationMs?: number
  initialSustain?: PerformanceRecording['initialSustain']
  forceGlobalClock?: boolean
}) {
  const base = makeRecording(options.plan.attacks.map((attack, index) => ({ midi: attack.midi, ms: options.attackTimes[index]!, velocity: 50 + index })), { planId: options.plan.id })
  const keyPresses = base.keyPresses.map((press) => ({ ...press, releaseMs: press.attackMs + 200, releaseSequence: press.attackSequence + 100 }))
  const recording: PerformanceRecording = {
    ...base,
    durationMs: options.durationMs ?? Math.max(...options.attackTimes) + 600,
    initialSustain: options.initialSustain,
    keyPresses,
    events: options.values.map((sample, sequence) => ({ sequence, relativeMs: sample.ms, event: { type: 'sustain' as const, channel: sample.channel ?? 0, value: sample.value, down: sample.value >= 64, timestampMs: sample.ms } })),
    statistics: { ...base.statistics, eventCount: options.values.length, sustainChangeCount: options.values.length, noteReleaseCount: keyPresses.length, openNoteCount: 0 },
  }
  const score = { ...makeScore(options.plan), pedalEvents: options.pedalEvents }
  const baseAlignment = alignPerformance(options.plan, recording)
  const alignment = options.forceGlobalClock ? {
    ...baseAlignment,
    timeTransform: { ...baseAlignment.timeTransform, offsetMs: 1_000, scale: 1 },
    groupAlignments: baseAlignment.groupAlignments.map((step) => step.kind === 'correspondence' ? {
      ...step,
      predictedPerformedMs: 1_000 + step.expectedGroup.referenceMs,
      timingResidualMs: step.performedGroup.representativeMs - (1_000 + step.expectedGroup.referenceMs),
    } : step),
  } : baseAlignment
  const note = gradeNotes({ expectedPlan: options.plan, recording, alignment, options: { gradingScope: 'full-plan' } })
  const expression = analyzeExpression({ normalizedScore: score, expectedPlan: options.plan, recording, alignment, noteGrading: note })
  return analyzePedal({ normalizedScore: score, expectedPlan: options.plan, recording, alignment, noteGrading: note, expressionAnalysis: expression })
}

function rubatoCase(harmonyMs: number, pedalChangeMs: number) {
  const plan = makePlan(Array.from({ length: 9 }, (_, index) => [60 + index]))
  const times = [1_000, 1_500, 2_000, 2_500, 3_000, 3_500, harmonyMs, harmonyMs + 500, harmonyMs + 1_000]
  return customCase({
    plan, attackTimes: times, forceGlobalClock: true,
    pedalEvents: [pedalEvent('rubato-start', 'start', 0), pedalEvent('rubato-change', 'change', 6), pedalEvent('rubato-stop', 'stop', 8)],
    values: [{ ms: 1_000, value: 127 }, { ms: pedalChangeMs - 20, value: 0 }, { ms: pedalChangeMs + 20, value: 127 }, { ms: harmonyMs + 1_000, value: 0 }],
    initialSustain: { observed: true, down: false, value: 0 },
  })
}

describe('pedal analysis', () => {
  it('uses an equal arithmetic mean across authored phrases rather than event density', () => {
    expect(aggregatePedalPhraseScores([{ score: 1 }, { score: 0.8 }, { score: 0.4 }])).toBeCloseTo(0.7333333333, 8)
    expect(aggregatePedalPhraseScores([])).toBeNull()
  })
  it('scores well-aligned starts and stops and remains invariant to recording-start offset', () => {
    const result = setup([{ ms: 1_020, value: 127 }, { ms: 2_520, value: 0 }]).result
    expect(result.score).toBe(1)
    expect(result.observations.map((item) => item.timingErrorMs)).toEqual([20, 20])
    expect(result.coverage).toMatchObject({ authoredPhraseCount: 1, analyzedPhraseCount: 1, ratio: 1, fullyAnalyzedPhraseCount: 1, partiallyAnalyzedPhraseCount: 0, unanalyzedPhraseCount: 0, authoredEventCount: 2, analyzedEventCount: 2, eventCoverageRatio: 1 })
    const shifted = setup([{ ms: 2_020, value: 127 }, { ms: 3_520, value: 0 }], undefined, {}, 2_000).result
    expect(shifted.score).toBe(result.score)
  })

  it('applies practice speed exactly once through the canonical score clock', () => {
    const halfSpeed = setup([{ ms: 1_020, value: 127 }, { ms: 4_020, value: 0 }], undefined, {}, 1_000, 0.5).result
    expect(halfSpeed.score).toBe(1)
    expect(halfSpeed.targets[0]?.events.map((event) => event.expectedPerformedMs)).toEqual([1_000, 4_000])
  })

  it('uses continuous asymmetric timing loss and treats a real missing event as zero', () => {
    const early = setup([{ ms: 650, value: 127 }, { ms: 2_500, value: 0 }]).result
    const late = setup([{ ms: 1_350, value: 127 }, { ms: 2_500, value: 0 }]).result
    expect(late.observations[0]!.score).toBeGreaterThan(early.observations[0]!.score)
    const missing = setup([{ ms: 1_000, value: 127 }]).result
    expect(missing.observations.find((item) => item.kind === 'stop')).toMatchObject({ score: 0, evidence: 'missing' })
    expect(missing.phraseResults[0]).toMatchObject({ completeness: 'complete', analyzedEventCount: 2, coverageRatio: 1 })
  })

  it('grades one composite re-pedal change without reusing transitions', () => {
    const events = [pedalEvent('start', 'start', 0), pedalEvent('change', 'change', 2), pedalEvent('stop', 'stop', 3)]
    const result = setup([{ ms: 1_000, value: 127 }, { ms: 1_990, value: 0 }, { ms: 2_060, value: 127 }, { ms: 2_500, value: 0 }], events).result
    expect(result.observations.find((item) => item.kind === 'change')).toMatchObject({ score: expect.closeTo(1, 8), releaseRedownGapMs: 70 })
    expect(new Set(result.observations.flatMap((item) => item.transitionIds)).size).toBe(4)
  })

  it('retains partial provenance when a re-pedal release has no following depression', () => {
    const events = [pedalEvent('start', 'start', 0), pedalEvent('change', 'change', 2), pedalEvent('stop', 'stop', 3)]
    const result = setup([{ ms: 1_000, value: 127 }, { ms: 2_000, value: 0 }], events).result
    expect(result.observations.find((item) => item.kind === 'change')).toMatchObject({ score: 0, evidence: 'missing', transitionIds: ['pedal-transition:1'], performedMs: 2_000 })
  })

  it('distinguishes no controller evidence from a performed miss and retains extra transitions as diagnostics', () => {
    const unavailable = setup([], undefined, { initialSustain: undefined }).result
    expect(unavailable).toMatchObject({ status: 'unavailable', score: null, reliability: 'unavailable' })
    const extra = setup([{ ms: 500, value: 127 }, { ms: 700, value: 0 }, { ms: 1_000, value: 127 }, { ms: 2_500, value: 0 }]).result
    expect(extra.controllerEvidence.extraUnassignedTransitionCount).toBe(2)
  })

  it('retains controller diagnostics but no fake score when no authored pedal exists', () => {
    const result = setup([{ ms: 1_000, value: 127 }, { ms: 2_500, value: 0 }], []).result
    expect(result).toMatchObject({ status: 'unavailable', score: null, coverage: { authoredPhraseCount: 0, analyzedPhraseCount: 0 } })
    expect(result.controllerEvidence.rawSampleCount).toBe(2)
  })

  it('does not turn an unknown initial state into a missed score-opening pedal', () => {
    const result = setup([{ ms: 1_200, value: 0 }, { ms: 2_500, value: 0 }], undefined, { initialSustain: undefined }).result
    expect(result.observations.some((item) => item.kind === 'start')).toBe(false)
    expect(result.exclusions).toContainEqual(expect.objectContaining({ sourceEventId: 'start', reason: expect.stringContaining('unknown') }))
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: 'UNKNOWN_INITIAL_STATE' }))
    expect(result.phraseResults[0]).toMatchObject({ completeness: 'partial', analyzedEventCount: 1, unavailableEventCount: 1, coverageRatio: 0.5 })
  })

  it('accepts score-opening predepression with capped reliability but never uses it for a later start', () => {
    const opening = setup([{ ms: 2_500, value: 0 }], undefined, { initialSustain: { observed: true, down: true, value: 127 } }).result
    expect(opening.observations[0]).toMatchObject({ evidence: 'predepressed', score: 1 })
    expect(opening.reliability).toBe('limited')
    const later = setup([{ ms: 2_500, value: 0 }], [pedalEvent('start', 'start', 1), pedalEvent('stop', 'stop', 3)], { initialSustain: { observed: true, down: true, value: 127 } }).result
    expect(later.observations[0]).toMatchObject({ evidence: 'missing', score: 0 })
    const delayedOpening = customCase({
      plan: makePlan([[60], [62], [64]]), attackTimes: [1_500, 2_000, 2_500], forceGlobalClock: true,
      pedalEvents: [pedalEvent('delayed-start', 'start', 0), pedalEvent('delayed-stop', 'stop', 2)],
      values: [{ ms: 2_500, value: 0 }], initialSustain: { observed: true, down: true, value: 127 },
    })
    expect(delayedOpening.observations[0]).toMatchObject({ evidence: 'predepressed', score: 1, globalExpectedMs: 1_000, anchoredExpectedMs: 1_500 })
  })

  it('excludes a final release at recording stop, keeps phrase weighting equal, and deep-freezes output', () => {
    const truncated = setup([{ ms: 1_000, value: 127 }], undefined, { durationMs: 2_550 }).result
    expect(truncated.diagnostics.truncatedTargetCount).toBe(1)
    expect(truncated.observations.map((item) => item.kind)).toEqual(['start'])
    expect(truncated.phraseResults[0]).toMatchObject({ completeness: 'partial', analyzedEventCount: 1, truncatedEventCount: 1, coverageRatio: 0.5 })
    expect(Object.isFrozen(truncated) && Object.isFrozen(truncated.timeline.transitions)).toBe(true)
  })

  it('derives damper release intervals without changing the frozen articulation score', () => {
    const data = setup([{ ms: 1_000, value: 127 }, { ms: 2_500, value: 0 }])
    const before = data.expression.articulation.score
    expect(data.result.damperHolds.some((hold) => hold.pedalExtensionMs !== null && hold.pedalExtensionMs > 0)).toBe(true)
    expect(data.expression.articulation.score).toBe(before)
  })

  it('returns unavailable on exact provenance mismatch rather than guessing', () => {
    const data = setup([{ ms: 1_000, value: 127 }, { ms: 2_500, value: 0 }])
    const wrongExpression = { ...data.expression, recordingId: 'wrong' }
    expect(analyzePedal({ normalizedScore: data.score, expectedPlan: data.plan, recording: data.recording, alignment: data.alignment, noteGrading: data.note, expressionAnalysis: wrongExpression })).toMatchObject({ status: 'unavailable', score: null, reliability: 'unavailable' })
  })

  it('keeps reliable and provisional labels independent from the numeric pedal score', () => {
    const data = setup([{ ms: 1_000, value: 127 }, { ms: 2_500, value: 0 }])
    const reliable = analyzePedal({ normalizedScore: data.score, expectedPlan: data.plan, recording: data.recording, alignment: data.alignment, noteGrading: data.note, expressionAnalysis: data.expression, options: { reliableMinimumPhrases: 1 } })
    expect(reliable.reliability).toBe('reliable')
    const ambiguous = { ...data.alignment, status: 'ambiguous' as const }
    expect(analyzePedal({ normalizedScore: data.score, expectedPlan: data.plan, recording: data.recording, alignment: ambiguous, noteGrading: data.note, expressionAnalysis: data.expression, options: { reliableMinimumPhrases: 1 } }).reliability).toBe('provisional')
  })

  it('rewards musical coordination equally through local delay or acceleration rather than metronomic conformity', () => {
    const metronomic = rubatoCase(4_000, 4_020)
    const delayed = rubatoCase(4_500, 4_520)
    const accelerated = rubatoCase(3_500, 3_520)
    expect(delayed.observations.find((item) => item.kind === 'change')).toMatchObject({
      timingAnchorSource: 'local-performed', globalExpectedMs: 4_000, anchoredExpectedMs: 4_500, timingErrorMs: 20,
    })
    expect(delayed.score).toBeCloseTo(metronomic.score!, 8)
    expect(accelerated.score).toBeCloseTo(metronomic.score!, 8)
  })

  it('still scores poor pedal coordination badly relative to a rubato-delayed harmony', () => {
    const good = rubatoCase(4_500, 4_520)
    const bad = rubatoCase(4_500, 5_100)
    expect(good.score).toBeGreaterThan(bad.score! + 0.1)
    expect(good.observations.find((item) => item.kind === 'change')!.score).toBeGreaterThan(bad.observations.find((item) => item.kind === 'change')!.score + 0.4)
  })

  it('marks multi-channel authored-pedal evidence unavailable rather than merging CC64 state', () => {
    const result = setup([{ ms: 1_000, value: 127, channel: 0 }, { ms: 2_500, value: 0, channel: 1 }]).result
    expect(result).toMatchObject({ status: 'unavailable', score: null, reliability: 'unavailable', controllerEvidence: { channelMode: 'multi-channel-ambiguous', authoritativeChannel: null } })
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: 'MULTI_CHANNEL_CC64_AMBIGUOUS' }))
  })

  it('reports complete, partial, and unanalyzed phrases from authored-event evidence exactly', () => {
    const plan = makePlan(Array.from({ length: 9 }, (_, index) => [60 + index]))
    const event = (id: string, type: PedalEvent['type'], position: number, staff: number, voice: string): PedalEvent => ({
      ...pedalEvent(id, type, position), staff, voice,
    })
    const result = customCase({
      plan,
      attackTimes: Array.from({ length: 9 }, (_, index) => 1_000 + index * 500),
      durationMs: 5_050,
      initialSustain: undefined,
      pedalEvents: [
        event('outer-start', 'start', 0, 2, '2'), event('complete-1-start', 'start', 2, 1, '1'), event('complete-1-stop', 'stop', 3, 1, '1'),
        event('complete-2-start', 'start', 4, 1, '1'), event('complete-2-stop', 'stop', 5, 1, '1'), event('partial-start', 'start', 6, 1, '1'),
        event('outer-stop', 'stop', 8, 2, '2'), event('partial-stop', 'stop', 8, 1, '1'),
      ],
      values: [{ ms: 2_000, value: 127 }, { ms: 2_500, value: 0 }, { ms: 3_000, value: 127 }, { ms: 3_500, value: 0 }, { ms: 4_000, value: 127 }],
    })
    expect(result.coverage).toMatchObject({
      authoredPhraseCount: 4, fullyAnalyzedPhraseCount: 2, partiallyAnalyzedPhraseCount: 1, unanalyzedPhraseCount: 1,
      authoredEventCount: 8, analyzedEventCount: 5, truncatedEventCount: 2, unavailableEventCount: 1, eventCoverageRatio: 0.625,
    })
    expect(result.phraseResults.map((phrase) => phrase.completeness).sort()).toEqual(['complete', 'complete', 'partial', 'unanalyzed'])
    expect(result.reliability).toBe('limited')
  })
})
