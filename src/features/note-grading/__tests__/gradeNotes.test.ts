import { describe, expect, it } from 'vitest'
import { alignPerformance } from '../../alignment/alignPerformance'
import { makePlan, makeRecording, melodyRecording } from '../../alignment/__tests__/fixtures'
import { buildExpectedPerformancePlan } from '../../expected-performance/builder'
import { parseMusicXml } from '../../musicxml/parser'
import { graceAndRangeFixture, tiesFixture } from '../../musicxml/__tests__/fixtures'
import { gradeNotes } from '../gradeNotes'
import type { NoteGradingResult } from '../types'

function grade(pitchGroups: readonly (readonly number[])[], performedPitches: readonly number[], times?: readonly number[], scope: 'aligned-span' | 'full-plan' = 'aligned-span') {
  const plan = makePlan(pitchGroups)
  const recording = melodyRecording(performedPitches, times ?? performedPitches.map((_, index) => 500 + index * 500))
  const alignment = alignPerformance(plan, recording)
  return gradeNotes({ expectedPlan: plan, recording, alignment, options: { gradingScope: scope } })
}

function expectedKinds(result: NoteGradingResult) {
  return result.expectedResults.map((item) => item.kind)
}

describe('gradeNotes', () => {
  it('grades a perfect melody with perfect precision, recall, and note score', () => {
    const result = grade([[60], [62], [64], [65], [67]], [60, 62, 64, 65, 67])
    expect(result.status).toBe('ready')
    expect(result.reliability).toBe('reliable')
    expect(result.counts).toMatchObject({ correct: 5, wrongPitch: 0, missed: 0, additional: 0, gradeableExpectedTargets: 5, gradedPerformedAttacks: 5 })
    expect(result.metrics).toEqual({ precision: 1, recall: 1, noteScore: 1 })
  })

  it('grades an internal missing group as missed inside the aligned span', () => {
    const result = grade([[60], [62], [64], [65], [67]], [60, 62, 65, 67], [500, 1_000, 2_000, 2_500])
    expect(result.counts).toMatchObject({ correct: 4, wrongPitch: 0, missed: 1, additional: 0 })
    expect(result.metrics.precision).toBe(1)
    expect(result.metrics.recall).toBeCloseTo(4 / 5)
    expect(result.metrics.noteScore).toBeCloseTo(8 / 9)
  })

  it('grades an internal additional group and reduces precision', () => {
    const result = grade([[60], [62], [64], [65]], [60, 62, 61, 64, 65], [500, 1_000, 1_250, 1_500, 2_000])
    expect(result.counts).toMatchObject({ correct: 4, wrongPitch: 0, missed: 0, additional: 1 })
    expect(result.metrics.precision).toBeCloseTo(4 / 5)
    expect(result.metrics.recall).toBe(1)
    expect(result.metrics.noteScore).toBeCloseTo(8 / 9)
  })

  it('interprets a nearby structural substitution as wrong pitch', () => {
    const result = grade([[60], [62], [64], [65], [67]], [60, 62, 66, 65, 67])
    const wrong = result.wrongPitchCorrespondences[0]
    expect(result.counts).toMatchObject({ correct: 4, wrongPitch: 1, missed: 0, additional: 0 })
    expect(result.metrics).toMatchObject({ precision: 0.8, recall: 0.8, noteScore: 0.8 })
    expect(wrong).toMatchObject({ expectedMidi: 64, performedMidi: 66, semitoneDelta: 2, absoluteSemitoneDistance: 2 })
  })

  it('grades a mixed chord conservatively after exact matches', () => {
    const plan = makePlan([[60, 64, 67]])
    const recording = makeRecording([{ midi: 60, ms: 1_000 }, { midi: 65, ms: 1_010 }, { midi: 67, ms: 1_020 }, { midi: 70, ms: 1_030 }])
    const alignment = alignPerformance(plan, recording, { expectedSkipCost: 1.6, performedSkipCost: 1.6 })
    const result = gradeNotes({ expectedPlan: plan, recording, alignment })

    expect(result.counts).toMatchObject({ correct: 2, wrongPitch: 1, missed: 0, additional: 1 })
    expect(result.wrongPitchCorrespondences[0]).toMatchObject({ expectedMidi: 64, performedMidi: 65, semitoneDelta: 1 })
    expect(result.performedResults.find((item) => item.kind === 'additional')?.midi).toBe(70)
  })

  it('does not turn a distant unrelated leftover into a substitution', () => {
    const result = grade([[60]], [95], [500], 'full-plan')
    expect(result.counts).toMatchObject({ correct: 0, wrongPitch: 0, missed: 1, additional: 1 })
    expect(result.wrongPitchCorrespondences).toEqual([])
  })

  it('records wrong-octave metadata without partial correctness credit', () => {
    const result = grade([[60]], [72])
    expect(result.counts.wrongPitch).toBe(1)
    expect(result.metrics.noteScore).toBe(0)
    expect(result.wrongPitchCorrespondences[0]).toMatchObject({ semitoneDelta: 12, octaveDisplacement: 1 })
  })

  it('gives exact pitch matches priority over leftover substitution assignment', () => {
    const plan = makePlan([[60, 64, 67]])
    const recording = makeRecording([{ midi: 60, ms: 100 }, { midi: 62, ms: 110 }, { midi: 64, ms: 120 }])
    const alignment = alignPerformance(plan, recording)
    const result = gradeNotes({ expectedPlan: plan, recording, alignment })
    expect(result.expectedResults.filter((item) => item.kind === 'correct').map((item) => item.target.midi)).toEqual([60, 64])
    expect(result.expectedResults.find((item) => item.target.midi === 67)?.kind).toBe('missed')
    expect(result.performedResults.find((item) => item.midi === 62)?.kind).toBe('additional')
  })

  it('grades duplicate simultaneous expected notation as one physical key target', () => {
    const plan = makePlan([[60, 60, 64]])
    const recording = makeRecording([{ midi: 60, ms: 100 }, { midi: 64, ms: 110 }])
    const alignment = alignPerformance(plan, recording)
    const result = gradeNotes({ expectedPlan: plan, recording, alignment })
    expect(result.expectedTargets).toHaveLength(2)
    expect(result.counts).toMatchObject({ correct: 2, missed: 0, additional: 0 })
    expect(result.expectedTargets.find((target) => target.midi === 60)?.sourceExpectedAttackIds).toHaveLength(2)
  })

  it('keeps a duplicate performed key as one correct and one additional in full-plan scope', () => {
    const result = grade([[60]], [60, 60], [100, 100], 'full-plan')
    expect(result.counts).toMatchObject({ correct: 1, wrongPitch: 0, missed: 0, additional: 1 })
    expect(result.performedResults).toHaveLength(2)
  })

  it('leaves an unplayed tail outside aligned-span scoring', () => {
    const groups = Array.from({ length: 10 }, (_, index) => [48 + index])
    const result = grade(groups, [48, 49, 50, 51])
    expect(result.counts).toMatchObject({ correct: 4, missed: 0, outsideScopeExpectedTargets: 6 })
    expect(result.scope).toMatchObject({ type: 'aligned-span', expectedStartIndex: 0, expectedEndIndex: 3, outsideScopeExpectedGroupCount: 6 })
  })

  it('identifies a unique mid-piece aligned span without penalizing either side', () => {
    const groups = [[69], [71], [60], [62], [64], [65], [67], [69], [71], [60]]
    const result = grade(groups, [64, 65, 67, 69], [800, 1_300, 1_800, 2_300])
    expect(result.counts).toMatchObject({ correct: 4, missed: 0, outsideScopeExpectedTargets: 6 })
    expect(result.scope).toMatchObject({ expectedStartIndex: 4, expectedEndIndex: 7 })
  })

  it('intentionally counts unplayed material as missed under full-plan scope', () => {
    const groups = [[69], [71], [60], [62], [64], [65], [67], [69], [71], [60]]
    const result = grade(groups, [64, 65, 67, 69], [800, 1_300, 1_800, 2_300], 'full-plan')
    expect(result.counts).toMatchObject({ correct: 4, missed: 6, outsideScopeExpectedTargets: 0 })
  })

  it('leaves a stray attack before the played section outside aligned-span scoring', () => {
    const groups = [[69], [71], [60], [62], [64], [65], [67], [69], [71], [60]]
    const result = grade(groups, [55, 64, 65, 67, 69], [100, 800, 1_300, 1_800, 2_300])
    expect(result.counts.additional).toBe(0)
    expect(result.counts.outsideScopePerformedAttacks).toBe(1)
  })

  it('returns unavailable rather than a fake zero for aligned-span grading with no correspondences', () => {
    const plan = makePlan([[60], [62]])
    const recording = makeRecording([])
    const alignment = alignPerformance(plan, recording)
    const result = gradeNotes({ expectedPlan: plan, recording, alignment })
    expect(result.status).toBe('unavailable')
    expect(result.reliability).toBe('unavailable')
    expect(result.metrics.noteScore).toBeNull()
    expect(result.counts.outsideScopeExpectedTargets).toBe(2)
  })

  it('grades an empty full-plan take as all missed without NaN', () => {
    const plan = makePlan([[60], [62], [64], [65], [67]])
    const recording = makeRecording([])
    const alignment = alignPerformance(plan, recording)
    const result = gradeNotes({ expectedPlan: plan, recording, alignment, options: { gradingScope: 'full-plan' } })
    expect(result.status).toBe('ready')
    expect(result.reliability).toBe('provisional')
    expect(result.counts).toMatchObject({ correct: 0, missed: 5, additional: 0 })
    expect(result.metrics).toEqual({ precision: null, recall: 0, noteScore: 0 })
  })

  it('returns unavailable for only performed attacks with no gradeable expected target', () => {
    const plan = makePlan([])
    const recording = makeRecording([{ midi: 60, ms: 100 }, { midi: 64, ms: 200 }])
    const alignment = alignPerformance(plan, recording)
    const result = gradeNotes({ expectedPlan: plan, recording, alignment, options: { gradingScope: 'full-plan' } })
    expect(result.status).toBe('unavailable')
    expect(result.metrics).toEqual({ precision: null, recall: null, noteScore: null })
    expect(result.counts.outsideScopePerformedAttacks).toBe(2)
  })

  it('penalizes many additional attacks even when every expected target is correct', () => {
    const result = grade([[60], [62], [64], [65]], [60, 80, 62, 81, 64, 82, 65], [100, 250, 600, 750, 1_100, 1_250, 1_600], 'full-plan')
    expect(result.counts.correct).toBe(4)
    expect(result.counts.additional).toBe(3)
    expect(result.metrics.recall).toBe(1)
    expect(result.metrics.noteScore).toBeLessThan(1)
  })

  it('reflects playing only half of a full plan through recall and F1', () => {
    const result = grade([[60], [62], [64], [65], [67], [69]], [60, 62, 64], [100, 600, 1_100], 'full-plan')
    expect(result.counts).toMatchObject({ correct: 3, missed: 3, additional: 0 })
    expect(result.metrics.precision).toBe(1)
    expect(result.metrics.recall).toBe(0.5)
    expect(result.metrics.noteScore).toBeCloseTo(2 / 3)
  })

  it('fails aligned-span grading closed when modern score-region localization is unresolved', () => {
    const result = grade([[60], [62]], [61, 63])
    expect(result.status).toBe('unavailable')
    expect(result.reliability).toBe('unavailable')
    expect(result.metrics.noteScore).toBeNull()
  })

  it('excludes outside-standard-range targets from score denominators', () => {
    const plan = makePlan([[20]])
    const recording = makeRecording([])
    const alignment = alignPerformance(plan, recording)
    const result = gradeNotes({ expectedPlan: plan, recording, alignment, options: { gradingScope: 'full-plan' } })
    expect(result.status).toBe('unavailable')
    expect(result.counts).toMatchObject({ excludedExpectedTargets: 1, missed: 0, gradeableExpectedTargets: 0 })
    expect(result.metrics.noteScore).toBeNull()
  })

  it('preserves grace, cue, and microtonal exclusions without counting them missed', () => {
    const plan = buildExpectedPerformancePlan(parseMusicXml(graceAndRangeFixture), { fallbackQuarterBpm: 120 })
    const recording = makeRecording([], { planId: plan.id })
    const alignment = alignPerformance(plan, recording)
    const result = gradeNotes({ expectedPlan: plan, recording, alignment, options: { gradingScope: 'full-plan' } })
    expect(result.counts).toMatchObject({ missed: 0, gradeableExpectedTargets: 0, excludedFlexibleEvents: 2 })
    expect(result.expectedExclusions.map((exclusion) => exclusion.reason)).toEqual(['GRACE_TIMING_FLEXIBLE', 'CUE_EXCLUDED'])
  })

  it('does not reintroduce tie continuations into grading', () => {
    const plan = buildExpectedPerformancePlan(parseMusicXml(tiesFixture), { fallbackQuarterBpm: 120 })
    const recording = makeRecording([{ midi: 60, ms: 500 }], { planId: plan.id })
    const alignment = alignPerformance(plan, recording)
    const result = gradeNotes({ expectedPlan: plan, recording, alignment })
    expect(result.expectedTargets).toHaveLength(1)
    expect(result.counts.correct).toBe(1)
  })

  it('satisfies expected and performed count invariants', () => {
    const result = grade([[60, 64, 67], [69], [71]], [60, 65, 67, 70, 71], [100, 110, 120, 600, 1_100], 'full-plan')
    expect(result.counts.correct + result.counts.wrongPitch + result.counts.missed).toBe(result.counts.gradeableExpectedTargets)
    expect(result.counts.correct + result.counts.wrongPitch + result.counts.additional).toBe(result.counts.gradedPerformedAttacks)
  })

  it('is deterministic, immutable, and does not mutate Phase 3 or Phase 4 inputs', () => {
    const plan = makePlan([[60], [62], [64]])
    const recording = melodyRecording([60, 63, 64], [500, 1_000, 1_500])
    const alignment = alignPerformance(plan, recording)
    const planBefore = JSON.stringify(plan)
    const recordingBefore = JSON.stringify(recording)
    const alignmentBefore = JSON.stringify(alignment)
    const first = gradeNotes({ expectedPlan: plan, recording, alignment })
    const second = gradeNotes({ expectedPlan: plan, recording, alignment })
    expect(first).toEqual(second)
    expect(Object.isFrozen(first)).toBe(true)
    expect(Object.isFrozen(first.expectedTargets[0])).toBe(true)
    expect(JSON.stringify(plan)).toBe(planBefore)
    expect(JSON.stringify(recording)).toBe(recordingBefore)
    expect(JSON.stringify(alignment)).toBe(alignmentBefore)
  })

  it('refuses to grade mismatched plan, recording, and alignment identities', () => {
    const alignedPlan = makePlan([[60]], { id: 'plan:aligned' })
    const otherPlan = makePlan([[60]], { id: 'plan:other' })
    const recording = makeRecording([{ midi: 60, ms: 100 }], { planId: alignedPlan.id })
    const alignment = alignPerformance(alignedPlan, recording)
    const result = gradeNotes({ expectedPlan: otherPlan, recording, alignment, options: { gradingScope: 'full-plan' } })
    expect(result.status).toBe('unavailable')
    expect(result.warnings.map((warning) => warning.code)).toContain('INPUT_ID_MISMATCH')
  })

  it('grades several hundred aligned groups without whole-piece rematching', () => {
    const groups = Array.from({ length: 500 }, (_, index) => [48 + index % 36])
    const plan = makePlan(groups)
    const recording = melodyRecording(groups.map(([midi]) => midi!), groups.map((_, index) => 700 + index * 505))
    const alignment = alignPerformance(plan, recording)
    const result = gradeNotes({ expectedPlan: plan, recording, alignment })
    expect(result.status).toBe('ready')
    expect(result.counts.correct).toBe(500)
    expect(result.metrics.noteScore).toBe(1)
  })

  it('does not use velocity or release data as note correctness evidence', () => {
    const plan = makePlan([[60]])
    const quiet = makeRecording([{ midi: 60, ms: 500, velocity: 1 }])
    const loud = makeRecording([{ midi: 60, ms: 5_000, velocity: 127 }])
    const quietResult = gradeNotes({ expectedPlan: plan, recording: quiet, alignment: alignPerformance(plan, quiet) })
    const loudResult = gradeNotes({ expectedPlan: plan, recording: loud, alignment: alignPerformance(plan, loud) })
    expect(quietResult.metrics).toEqual(loudResult.metrics)
    expect(expectedKinds(quietResult)).toEqual(['correct'])
    expect(expectedKinds(loudResult)).toEqual(['correct'])
  })
})
