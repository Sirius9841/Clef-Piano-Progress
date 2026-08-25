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

function setup(values: readonly { ms: number; value: number }[], pedalEvents: PedalEvent[] = [pedalEvent('start', 'start', 0), pedalEvent('stop', 'stop', 3)], overrides: Partial<PerformanceRecording> = {}, attackOffset = 1_000, speed = 1) {
  const plan = makePlan([[60], [62], [64], [65]])
  const base = makeRecording(plan.attacks.map((attack, index) => ({ midi: attack.midi, ms: attackOffset + index * 500 / speed, velocity: 50 + index * 10 })), { planId: plan.id, speed })
  const keyPresses = base.keyPresses.map((press) => ({ ...press, releaseMs: press.attackMs + 250, releaseSequence: press.attackSequence + 10 }))
  const recording: PerformanceRecording = {
    ...base, durationMs: attackOffset + 3 * 500 / speed + 600, initialSustain: { observed: true, down: false, value: 0 }, keyPresses,
    events: values.map((sample, sequence) => ({ sequence, relativeMs: sample.ms, event: { type: 'sustain' as const, channel: 0, value: sample.value, down: sample.value >= 64, timestampMs: sample.ms } })),
    statistics: { ...base.statistics, eventCount: values.length, sustainChangeCount: values.length, noteReleaseCount: keyPresses.length, openNoteCount: 0 }, ...overrides,
  }
  const score = { ...makeScore(plan), pedalEvents }
  const alignment = alignPerformance(plan, recording)
  const note = gradeNotes({ expectedPlan: plan, recording, alignment, options: { gradingScope: 'full-plan' } })
  const expression = analyzeExpression({ normalizedScore: score, expectedPlan: plan, recording, alignment, noteGrading: note })
  return { result: analyzePedal({ normalizedScore: score, expectedPlan: plan, recording, alignment, noteGrading: note, expressionAnalysis: expression }), plan, score, recording, alignment, note, expression }
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
    expect(result.coverage).toEqual({ authoredPhraseCount: 1, analyzedPhraseCount: 1, ratio: 1 })
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
  })

  it('accepts score-opening predepression with capped reliability but never uses it for a later start', () => {
    const opening = setup([{ ms: 2_500, value: 0 }], undefined, { initialSustain: { observed: true, down: true, value: 127 } }).result
    expect(opening.observations[0]).toMatchObject({ evidence: 'predepressed', score: 1 })
    expect(opening.reliability).toBe('limited')
    const later = setup([{ ms: 2_500, value: 0 }], [pedalEvent('start', 'start', 1), pedalEvent('stop', 'stop', 3)], { initialSustain: { observed: true, down: true, value: 127 } }).result
    expect(later.observations[0]).toMatchObject({ evidence: 'missing', score: 0 })
  })

  it('excludes a final release at recording stop, keeps phrase weighting equal, and deep-freezes output', () => {
    const truncated = setup([{ ms: 1_000, value: 127 }], undefined, { durationMs: 2_550 }).result
    expect(truncated.diagnostics.truncatedTargetCount).toBe(1)
    expect(truncated.observations.map((item) => item.kind)).toEqual(['start'])
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
})
