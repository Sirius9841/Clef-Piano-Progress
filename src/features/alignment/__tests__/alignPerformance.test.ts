import { describe, expect, it } from 'vitest'
import { buildExpectedPerformancePlan } from '../../expected-performance/builder'
import { parseMusicXml } from '../../musicxml/parser'
import { graceAndRangeFixture, tiesFixture } from '../../musicxml/__tests__/fixtures'
import { alignPerformance } from '../alignPerformance'
import { deriveExpectedAlignmentGroups } from '../expectedGroups'
import { resolveAlignmentOptions } from '../options'
import { clusterPerformedOnsets, derivePerformedAttacks } from '../performedGroups'
import { alignGroupSequences } from '../sequenceAlignment'
import type { AlignmentResult, GroupCorrespondence } from '../types'
import { makePlan, makeRecording, melodyRecording } from './fixtures'

function correspondences(result: AlignmentResult): GroupCorrespondence[] {
  return result.groupAlignments.filter((step) => step.kind === 'correspondence')
}

function alignedPitchPairs(result: AlignmentResult): Array<[number[], number[]]> {
  return correspondences(result).map((step) => [[...step.expectedGroup.pitches], [...step.performedGroup.pitches]])
}

describe('alignPerformance', () => {
  it('aligns a perfect melody with fitted offset, scale, and exact attack pairs', () => {
    const plan = makePlan([[60], [62], [64], [65], [67]])
    const recording = melodyRecording([60, 62, 64, 65, 67], [1_500, 2_000, 2_500, 3_000, 3_500])
    const result = alignPerformance(plan, recording)

    expect(result.status).toBe('aligned')
    expect(result.diagnostics.groupCorrespondenceCount).toBe(5)
    expect(result.diagnostics.exactPitchPairCount).toBe(5)
    expect(result.unmatchedExpectedGroupIds).toEqual([])
    expect(result.unmatchedPerformedGroupIds).toEqual([])
    expect(result.timeTransform.offsetMs).toBeCloseTo(1_500)
    expect(result.timeTransform.scale).toBeCloseTo(1)
  })

  it('models recording-start silence as affine offset rather than sequence gaps', () => {
    const plan = makePlan([[60], [62], [64], [65]])
    const recording = melodyRecording([60, 62, 64, 65], [1_500, 2_000, 2_500, 3_000])
    const result = alignPerformance(plan, recording)

    expect(result.timeTransform.offsetMs).toBeCloseTo(1_500)
    expect(result.diagnostics.expectedOnlyGroupCount).toBe(0)
    expect(result.diagnostics.performedOnlyGroupCount).toBe(0)
  })

  it('fits a globally slower 1.2× performance timeline', () => {
    const plan = makePlan([[60], [62], [64], [65], [67]])
    const recording = melodyRecording([60, 62, 64, 65, 67], [1_000, 1_600, 2_200, 2_800, 3_400])
    const result = alignPerformance(plan, recording)
    expect(result.timeTransform.offsetMs).toBeCloseTo(1_000)
    expect(result.timeTransform.scale).toBeCloseTo(1.2)
  })

  it('keeps later groups stable around a missing middle expected group', () => {
    const plan = makePlan([[60], [62], [64], [65], [67]])
    const recording = melodyRecording([60, 62, 65, 67], [500, 1_000, 2_000, 2_500])
    const result = alignPerformance(plan, recording)

    expect(alignedPitchPairs(result)).toEqual([[[60], [60]], [[62], [62]], [[65], [65]], [[67], [67]]])
    expect(result.unmatchedExpectedGroupIds).toEqual(['expected-group:2'])
  })

  it('keeps later groups stable around an additional performed group', () => {
    const plan = makePlan([[60], [62], [64], [65]])
    const recording = melodyRecording([60, 62, 61, 64, 65], [500, 1_000, 1_250, 1_500, 2_000])
    const result = alignPerformance(plan, recording)

    expect(alignedPitchPairs(result)).toEqual([[[60], [60]], [[62], [62]], [[64], [64]], [[65], [65]]])
    expect(result.unmatchedPerformedGroupIds).toHaveLength(1)
    expect(result.groupAlignments.find((step) => step.kind === 'performed-only')?.performedGroup.pitches).toEqual([61])
  })

  it('keeps a substituted pitch structurally corresponding without inventing an exact pair', () => {
    const plan = makePlan([[60], [62], [64], [65], [67]])
    const recording = melodyRecording([60, 62, 66, 65, 67], [500, 1_000, 1_500, 2_000, 2_500])
    const result = alignPerformance(plan, recording)
    const third = correspondences(result)[2]!

    expect(alignedPitchPairs(result)).toEqual([[[60], [60]], [[62], [62]], [[64], [66]], [[65], [65]], [[67], [67]]])
    expect(third.attacks.pairs).toEqual([])
    expect(third.attacks.unpairedExpectedAttackIds).toEqual(['expected-attack:2:0'])
    expect(third.attacks.unpairedPerformedAttackIds).toHaveLength(1)
  })

  it('aligns normal and rolled chords as one group while retaining spread', () => {
    const plan = makePlan([[60, 64, 67]])
    const normal = alignPerformance(plan, makeRecording([{ midi: 60, ms: 1_000 }, { midi: 64, ms: 1_010 }, { midi: 67, ms: 1_020 }]))
    const rolled = alignPerformance(plan, makeRecording([{ midi: 60, ms: 1_000 }, { midi: 64, ms: 1_030 }, { midi: 67, ms: 1_060 }]))

    expect(normal.performedGroups).toHaveLength(1)
    expect(rolled.performedGroups).toHaveLength(1)
    expect(correspondences(rolled)[0]?.attacks.pairs).toHaveLength(3)
    expect(rolled.performedGroups[0]?.spreadMs).toBe(60)
  })

  it('preserves chord-side unpaired attacks without grading terminology', () => {
    const plan = makePlan([[60, 64, 67]])
    const missingPitch = alignPerformance(plan, makeRecording([{ midi: 60, ms: 1_000 }, { midi: 67, ms: 1_020 }]))
    const additionalPitch = alignPerformance(plan, makeRecording([{ midi: 60, ms: 1_000 }, { midi: 64, ms: 1_010 }, { midi: 67, ms: 1_020 }, { midi: 70, ms: 1_030 }]))

    expect(correspondences(missingPitch)[0]?.attacks.pairs.map((pair) => pair.midi)).toEqual([60, 67])
    expect(correspondences(missingPitch)[0]?.attacks.unpairedExpectedAttackIds).toEqual(['expected-attack:0:1'])
    expect(correspondences(additionalPitch)[0]?.attacks.pairs).toHaveLength(3)
    expect(correspondences(additionalPitch)[0]?.attacks.unpairedPerformedAttackIds).toHaveLength(1)
  })

  it('does not collapse or reorder repeated notes', () => {
    const plan = makePlan([[60], [60], [60], [60]])
    const recording = melodyRecording([60, 60, 60, 60], [500, 650, 800, 950])
    const result = alignPerformance(plan, recording)

    expect(result.performedGroups).toHaveLength(4)
    expect(correspondences(result).map((step) => step.performedGroup.attacks[0]?.sequence)).toEqual([0, 1, 2, 3])
  })

  it('aligns a repeated pattern deterministically with recording delay and timing context', () => {
    const plan = makePlan([[60], [62], [64], [60], [62], [64]])
    const recording = melodyRecording([60, 62, 64, 60, 62, 64], [1_250, 1_760, 2_240, 2_770, 3_255, 3_765])
    const first = alignPerformance(plan, recording)
    const second = alignPerformance(plan, recording)

    expect(correspondences(first).map((step) => step.expectedGroup.id)).toEqual([
      'expected-group:0', 'expected-group:1', 'expected-group:2',
      'expected-group:3', 'expected-group:4', 'expected-group:5',
    ])
    expect(first.groupAlignments).toEqual(second.groupAlignments)
    expect(first.timeTransform).toEqual(second.timeTransform)
    expect(first.timeTransform.offsetMs).toBeCloseTo(1_250, -1)
  })

  it('uses the existing piecewise tempo timeline for reference positions', () => {
    const plan = makePlan([[60], [62], [64], [65]], { tempoPoints: [{ position: 0, bpm: 120 }, { position: 2, bpm: 60 }] })
    const recording = melodyRecording([60, 62, 64, 65], [700, 1_200, 1_700, 2_700])
    const result = alignPerformance(plan, recording)

    expect(result.expectedGroups.map((group) => group.referenceMs)).toEqual([0, 500, 1_000, 2_000])
    expect(result.timeTransform.offsetMs).toBeCloseTo(700)
    expect(result.timeTransform.scale).toBeCloseTo(1)
  })

  it('uses recording practice speed once when deriving reference time', () => {
    const plan = makePlan([[60], [62], [64]])
    const recording = melodyRecording([60, 62, 64], [400, 1_066.6666667, 1_733.3333333], { speed: 0.75 })
    const result = alignPerformance(plan, recording)

    expect(result.practiceSpeedMultiplier).toBe(0.75)
    expect(result.expectedGroups[1]?.referenceMs).toBeCloseTo(666.6666667)
    expect(result.timeTransform.scale).toBeCloseTo(1)
  })

  it('retains local timing jitter and one large residual without destabilizing pitch order', () => {
    const plan = makePlan([[60], [62], [64], [65], [67], [69]])
    const jittered = melodyRecording([60, 62, 64, 65, 67, 69], [1_000, 1_515, 1_980, 3_600, 3_020, 3_490])
    const result = alignPerformance(plan, jittered)

    expect(correspondences(result).map((step) => step.attacks.pairs[0]?.midi)).toEqual([60, 62, 64, 65, 67, 69])
    expect(result.diagnostics.maximumAbsoluteTimingResidualMs).toBeGreaterThan(500)
    expect(Number.isFinite(result.timeTransform.scale)).toBe(true)
  })

  it('aligns a unique mid-piece passage without forcing the first indices together', () => {
    const plan = makePlan([[69], [71], [60], [62], [64], [65], [67], [69], [71], [60]])
    const recording = melodyRecording([64, 65, 67, 69], [800, 1_300, 1_800, 2_300])
    const result = alignPerformance(plan, recording)

    expect(correspondences(result).map((step) => step.expectedGroup.id)).toEqual(['expected-group:4', 'expected-group:5', 'expected-group:6', 'expected-group:7'])
    expect(result.unmatchedExpectedGroupIds).toHaveLength(6)
  })

  it('aligns an early prefix and leaves an expected tail neutral when ending early', () => {
    const plan = makePlan([[60], [62], [64], [65], [67], [69]])
    const recording = melodyRecording([60, 62, 64], [300, 800, 1_300])
    const result = alignPerformance(plan, recording)

    expect(correspondences(result)).toHaveLength(3)
    expect(result.unmatchedExpectedGroupIds).toEqual(['expected-group:3', 'expected-group:4', 'expected-group:5'])
  })

  it('returns typed insufficient-data results for empty inputs and stable one-anchor semantics', () => {
    const emptyRecording = alignPerformance(makePlan([[60], [62]]), makeRecording([]))
    const emptyPlan = alignPerformance(makePlan([]), makeRecording([{ midi: 60, ms: 100 }]))
    const one = alignPerformance(makePlan([[60]]), makeRecording([{ midi: 60, ms: 1_250 }]))

    expect(emptyRecording.status).toBe('insufficient-data')
    expect(emptyRecording.unmatchedExpectedGroupIds).toHaveLength(2)
    expect(emptyPlan.status).toBe('insufficient-data')
    expect(emptyPlan.unmatchedPerformedGroupIds).toHaveLength(1)
    expect(one.timeTransform).toMatchObject({ offsetMs: 1_250, scale: 1, source: 'single-anchor', scaleFitted: false })
  })

  it('consumes Phase 3 tie attacks and excludes grace, cue, and microtonal flexible events', () => {
    const tiedPlan = buildExpectedPerformancePlan(parseMusicXml(tiesFixture), { fallbackQuarterBpm: 120 })
    const tied = alignPerformance(tiedPlan, makeRecording([{ midi: 60, ms: 500 }], { planId: tiedPlan.id }))
    const flexiblePlan = buildExpectedPerformancePlan(parseMusicXml(graceAndRangeFixture), { fallbackQuarterBpm: 120 })
    const flexible = alignPerformance(flexiblePlan, makeRecording([], { planId: flexiblePlan.id }))

    expect(tiedPlan.attacks).toHaveLength(1)
    expect(correspondences(tied)).toHaveLength(1)
    expect(flexiblePlan.flexibleEvents).toHaveLength(2)
    expect(flexible.expectedGroups).toHaveLength(0)
    expect(flexible.status).toBe('insufficient-data')
  })

  it('is deterministic, immutable, and does not mutate either input', () => {
    const plan = makePlan([[60], [62], [64]])
    const recording = melodyRecording([60, 63, 64], [1_000, 1_500, 2_000])
    const planBefore = JSON.stringify(plan)
    const recordingBefore = JSON.stringify(recording)
    const first = alignPerformance(plan, recording)
    const second = alignPerformance(plan, recording)

    expect(first).toEqual(second)
    expect(JSON.stringify(plan)).toBe(planBefore)
    expect(JSON.stringify(recording)).toBe(recordingBefore)
    expect(Object.isFrozen(first)).toBe(true)
    expect(Object.isFrozen(first.groupAlignments)).toBe(true)
    expect(Object.isFrozen(first.expectedGroups[0]?.attacks[0])).toBe(true)
  })

  it('fails explicitly rather than truncating an alignment beyond matrix limits', () => {
    const plan = makePlan([[60], [62], [64], [65]])
    const recording = melodyRecording([60, 62, 64, 65], [0, 500, 1_000, 1_500])
    const result = alignPerformance(plan, recording, { maxMatrixCells: 20 })

    expect(result.status).toBe('failed')
    expect(result.unmatchedExpectedGroupIds).toHaveLength(4)
    expect(result.unmatchedPerformedGroupIds).toHaveLength(4)
    expect(result.warnings.map((warning) => warning.code)).toContain('INPUT_TOO_LARGE')
  })

  it('aligns several hundred groups with compact iterative backtracking', () => {
    const pitches = Array.from({ length: 500 }, (_, index) => [48 + index % 36])
    const plan = makePlan(pitches)
    const recording = melodyRecording(pitches.map(([pitch]) => pitch!), pitches.map((_, index) => 900 + index * 505))
    const result = alignPerformance(plan, recording)

    expect(result.status).toBe('aligned')
    expect(result.diagnostics.groupCorrespondenceCount).toBe(500)
    expect(result.diagnostics.matrixCellCount).toBe(251_001)
  })
})

describe('sequence alignment policy', () => {
  it('uses deterministic match-first tie breaking', () => {
    const options = resolveAlignmentOptions({
      expectedSkipCost: 1,
      performedSkipCost: 1,
      unpairedExpectedPitchCost: 1,
      unpairedPerformedPitchCost: 1,
    })
    const expected = deriveExpectedAlignmentGroups(makePlan([[60]]), 1).groups
    const recording = makeRecording([{ midi: 61, ms: 0 }])
    const performed = clusterPerformedOnsets(recording.id, derivePerformedAttacks(recording), options).groups
    const result = alignGroupSequences(expected, performed, options, null)

    expect(result.cost).toBe(2)
    expect(result.steps).toEqual([{ kind: 'correspondence', expectedIndex: 0, performedIndex: 0, cost: { pitchCost: 2, timingCost: 0, totalCost: 2 } }])
  })

  it('reports duplicate simultaneous expected pitch provenance instead of deduplicating', () => {
    const result = alignPerformance(makePlan([[60, 60, 64]]), makeRecording([{ midi: 60, ms: 0 }, { midi: 64, ms: 10 }]))
    expect(result.expectedGroups[0]?.pitches).toEqual([60, 60, 64])
    expect(result.warnings.map((warning) => warning.code)).toContain('DUPLICATE_SIMULTANEOUS_EXPECTED_PITCH')
  })

  it('marks all-substitution structural paths ambiguous rather than trustworthy', () => {
    const result = alignPerformance(makePlan([[60], [62]]), melodyRecording([61, 63], [500, 1_000]))
    expect(result.status).toBe('ambiguous')
    expect(result.warnings.map((warning) => warning.code)).toContain('AMBIGUOUS_ALIGNMENT')
  })
})
