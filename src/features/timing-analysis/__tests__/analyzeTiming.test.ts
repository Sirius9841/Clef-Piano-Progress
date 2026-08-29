import { describe, expect, it } from 'vitest'
import { alignPerformance } from '../../alignment/alignPerformance'
import { makePlan, makeRecording, melodyRecording } from '../../alignment/__tests__/fixtures'
import type { ExpectedPerformancePlan } from '../../expected-performance/types'
import { gradeNotes } from '../../note-grading/gradeNotes'
import type { GradingScopeType } from '../../note-grading/types'
import type { PerformanceRecording } from '../../performance/types'
import { analyzeTiming } from '../analyzeTiming'
import type { TimingAnalysisResult } from '../types'

function analyze(
  plan: ExpectedPerformancePlan,
  recording: PerformanceRecording,
  options: { scope?: GradingScopeType; alignment?: Parameters<typeof alignPerformance>[2] } = {},
): TimingAnalysisResult {
  const alignment = alignPerformance(plan, recording, options.alignment)
  const noteGrading = gradeNotes({ expectedPlan: plan, recording, alignment, options: { gradingScope: options.scope ?? 'aligned-span' } })
  return analyzeTiming({ expectedPlan: plan, recording, alignment, noteGrading })
}

function constantPlan(count = 6, options: Parameters<typeof makePlan>[1] = {}): ExpectedPerformancePlan {
  return makePlan(Array.from({ length: count }, (_, index) => [60 + index % 7]), options)
}

describe('analyzeTiming', () => {
  it('scores exact target timing as perfect rhythm and tempo', () => {
    const plan = constantPlan()
    const result = analyze(plan, melodyRecording([60, 61, 62, 63, 64, 65], [1_000, 1_500, 2_000, 2_500, 3_000, 3_500]))

    expect(result.status).toBe('ready')
    expect(result.rhythm.rhythmScore).toBeCloseTo(1)
    expect(result.tempo.tempoScore).toBeCloseTo(1)
    expect(result.tempo.globalTempoRatio).toBeCloseTo(1)
  })

  it('keeps consistently 20% slower proportions rhythmic while lowering tempo', () => {
    const plan = constantPlan()
    const result = analyze(plan, melodyRecording([60, 61, 62, 63, 64, 65], [800, 1_400, 2_000, 2_600, 3_200, 3_800]))

    expect(result.rhythm.rhythmScore).toBeGreaterThan(0.98)
    expect(result.tempo.globalTempoRatio).toBeCloseTo(1 / 1.2)
    expect(result.tempo.tempoScore).toBeLessThan(0.8)
  })

  it('keeps consistently faster proportions rhythmic while lowering target-tempo adherence', () => {
    const plan = constantPlan()
    const result = analyze(plan, melodyRecording([60, 61, 62, 63, 64, 65], [700, 1_100, 1_500, 1_900, 2_300, 2_700]))

    expect(result.rhythm.rhythmScore).toBeGreaterThan(0.98)
    expect(result.tempo.globalTempoRatio).toBeCloseTo(1.25)
    expect(result.tempo.targetTempoAccuracyScore).toBeLessThan(0.8)
  })

  it('respects a 75% effective practice target exactly once', () => {
    const plan = makePlan([[60], [62], [64], [65], [67]])
    const recording = melodyRecording([60, 62, 64, 65, 67], [500, 1_166.6666667, 1_833.3333333, 2_500, 3_166.6666667], { speed: 0.75 })
    const result = analyze(plan, recording)

    expect(result.tempo.target.constantEffectiveQuarterBpm).toBe(90)
    expect(result.tempo.globalTempoRatio).toBeCloseTo(1)
    expect(result.tempo.tempoScore).toBeCloseTo(1)
  })

  it('detects playing original speed against a slower selected practice target', () => {
    const plan = makePlan([[60], [62], [64], [65], [67]])
    const recording = melodyRecording([60, 62, 64, 65, 67], [500, 1_000, 1_500, 2_000, 2_500], { speed: 0.75 })
    const result = analyze(plan, recording)

    expect(result.tempo.globalTempoRatio).toBeCloseTo(4 / 3)
    expect(result.rhythm.rhythmScore).toBeGreaterThan(0.98)
    expect(result.tempo.tempoScore).toBeLessThan(0.5)
  })

  it('separates correct average tempo from uneven local rhythm', () => {
    const plan = constantPlan(7)
    const result = analyze(plan, melodyRecording([60, 61, 62, 63, 64, 65, 66], [1_000, 1_300, 2_000, 2_300, 3_000, 3_300, 4_000]))

    expect(result.tempo.globalTempoRatio).toBeCloseTo(1, 1)
    expect(result.rhythm.rhythmScore).toBeLessThan(0.75)
    expect(result.tempo.tempoStabilityScore).toBeLessThan(0.75)
  })

  it('detects gradual rushing from a meaningful local-tempo trend', () => {
    const plan = constantPlan(8)
    const result = analyze(plan, melodyRecording([60, 61, 62, 63, 64, 65, 66, 60], [500, 1_050, 1_580, 2_090, 2_580, 3_050, 3_500, 3_930]))
    expect(result.tempo.trend).toBe('rushing')
  })

  it('detects gradual dragging from a meaningful local-tempo trend', () => {
    const plan = constantPlan(8)
    const result = analyze(plan, melodyRecording([60, 61, 62, 63, 64, 65, 66, 60], [500, 930, 1_380, 1_850, 2_340, 2_850, 3_380, 3_930]))
    expect(result.tempo.trend).toBe('dragging')
  })

  it('tolerates deterministic human-scale jitter', () => {
    const plan = constantPlan()
    const result = analyze(plan, melodyRecording([60, 61, 62, 63, 64, 65], [1_000, 1_508, 1_994, 2_511, 3_002, 3_496]))
    expect(result.rhythm.rhythmScore).toBeGreaterThan(0.95)
  })

  it('keeps one severe pause visible without letting it collapse robust rhythm aggregation', () => {
    const plan = constantPlan(10)
    const times = [500, 1_000, 1_500, 2_000, 2_500, 4_500, 5_000, 5_500, 6_000, 6_500]
    const pitches = [60, 61, 62, 63, 64, 65, 66, 60, 61, 62]
    const result = analyze(plan, melodyRecording(pitches, times))

    expect(result.rhythm.rhythmScore).toBeGreaterThan(0.7)
    expect(Math.max(...result.rhythm.observations.map((observation) => Math.abs(observation.intervalDifferenceMs ?? 0)))).toBeGreaterThan(1_000)
  })

  it('follows authored numeric tempo changes in the effective reference timeline', () => {
    const plan = makePlan([[60], [62], [64], [65], [67], [69]], { tempoPoints: [{ position: 0, bpm: 120 }, { position: 3, bpm: 60 }] })
    const result = analyze(plan, melodyRecording([60, 62, 64, 65, 67, 69], [500, 1_000, 1_500, 2_000, 3_000, 4_000]))

    expect(result.tempo.target.variableNumericTempo).toBe(true)
    expect(result.tempo.tempoScore).toBeGreaterThan(0.95)
    expect(result.tempo.localSamples.at(-1)?.targetQuarterBpm).toBe(60)
  })

  it('detects when an authored slower tempo region is ignored', () => {
    const plan = makePlan([[60], [62], [64], [65], [67], [69]], { tempoPoints: [{ position: 0, bpm: 120 }, { position: 3, bpm: 60 }] })
    const result = analyze(plan, melodyRecording([60, 62, 64, 65, 67, 69], [500, 1_000, 1_500, 2_000, 2_500, 3_000]))
    expect(result.tempo.tempoScore).toBeLessThan(0.8)
    expect(result.tempo.localSamples.at(-1)?.tempoRatio).toBeCloseTo(2)
  })

  it('recognizes qualitative ritardando without inventing a numeric curve', () => {
    const plan = constantPlan(9, { tempoDirections: [{ position: 2, kind: 'ritardando', text: 'rit.' }] })
    const times = [500, 1_000, 1_500, 2_020, 2_570, 3_150, 3_760, 4_400, 5_070]
    const result = analyze(plan, melodyRecording([60, 61, 62, 63, 64, 65, 66, 60, 61], times))
    const direction = result.tempo.directionObservations[0]

    expect(direction).toMatchObject({ kind: 'ritardando', outcome: 'followed', exactNumericCurveAvailable: false })
    expect(result.warnings.map((warning) => warning.code)).toContain('QUALITATIVE_TEMPO_ONLY')
  })

  it('reports a stable performance as not following a qualitative ritardando', () => {
    const plan = constantPlan(8, { tempoDirections: [{ position: 1, kind: 'ritardando', text: 'rall.' }] })
    const result = analyze(plan, melodyRecording([60, 61, 62, 63, 64, 65, 66, 60], [500, 1_000, 1_500, 2_000, 2_500, 3_000, 3_500, 4_000]))
    expect(result.tempo.directionObservations[0]).toMatchObject({ observedTrend: 'stable', outcome: 'not-followed' })
  })

  it('recognizes a tempo return after a qualitative slowing region', () => {
    const plan = constantPlan(11, { tempoDirections: [{ position: 2, kind: 'ritardando', text: 'rit.' }, { position: 6, kind: 'a-tempo', text: 'a tempo' }] })
    const times = [500, 1_000, 1_500, 2_040, 2_630, 3_270, 3_770, 4_270, 4_770, 5_270, 5_770]
    const pitches = [60, 61, 62, 63, 64, 65, 66, 60, 61, 62, 63]
    const result = analyze(plan, melodyRecording(pitches, times))
    expect(result.tempo.directionObservations.find((direction) => direction.kind === 'a-tempo')?.outcome).toBe('followed')
  })

  it('uses one chord representative onset and reports spread separately', () => {
    const plan = makePlan([[60, 64, 67], [62], [65], [67]])
    const recording = makeRecording([{ midi: 60, ms: 500 }, { midi: 64, ms: 525 }, { midi: 67, ms: 550 }, { midi: 62, ms: 1_000 }, { midi: 65, ms: 1_500 }, { midi: 67, ms: 2_000 }])
    const result = analyze(plan, recording)

    expect(result.rhythm.observations).toHaveLength(4)
    expect(result.rhythm.observations[0]?.chordSpreadMs).toBe(50)
    expect(result.rhythm.chordSpreadDiagnostics[0]?.affectsRhythmScore).toBe(false)
  })

  it('flags very wide chord spread without creating additional expected beats', () => {
    const plan = makePlan([[60, 64, 67], [62], [65]])
    const recording = makeRecording([{ midi: 60, ms: 500 }, { midi: 64, ms: 540 }, { midi: 67, ms: 580 }, { midi: 62, ms: 1_000 }, { midi: 65, ms: 1_500 }])
    const result = analyze(plan, recording)
    expect(result.rhythm.observations).toHaveLength(3)
    expect(result.rhythm.chordSpreadDiagnostics[0]?.classification).toBe('wide')
    expect(result.warnings.map((warning) => warning.code)).toContain('WIDE_CHORD_SPREAD')
  })

  it('uses an aligned wrong pitch as valid onset timing evidence', () => {
    const plan = makePlan([[60], [62], [64], [65], [67]])
    const recording = melodyRecording([60, 62, 66, 65, 67], [500, 1_000, 1_505, 2_000, 2_500])
    const result = analyze(plan, recording)
    expect(result.rhythm.observations.find((observation) => observation.expectedGroupId === 'expected-group:2')?.anchorQuality).toBe('usable-observation')
    expect(result.rhythm.rhythmScore).toBeGreaterThan(0.95)
  })

  it('breaks intervals around a missed note instead of double-penalizing it', () => {
    const plan = makePlan([[60], [62], [64], [65], [67], [69]])
    const result = analyze(plan, melodyRecording([60, 62, 65, 67, 69], [500, 1_000, 2_000, 2_500, 3_000]))
    expect(result.rhythm.observations.some((observation) => observation.intervalExclusionReason === 'structural-gap')).toBe(true)
    expect(result.rhythm.rhythmScore).toBeGreaterThan(0.95)
  })

  it('rejects structurally mismatched local tempo windows instead of emitting an absurd finite BPM point', () => {
    const plan = makePlan([[60], [62], [64], [65], [67]])
    const result = analyze(plan, melodyRecording([60, 62, 65, 67], [500, 1_000, 1_010, 1_510]), { alignment: { localizationHint: { mode: 'confirmed', expectedStartIndex: 0, expectedEndIndex: 4 } } })

    expect(result.diagnostics.rejectedLocalTempoWindowCount).toBeGreaterThan(0)
    expect(result.warnings.map((warning) => warning.code)).toContain('REJECTED_LOCAL_TEMPO_GEOMETRY')
    expect(result.tempo.localSamples.every((sample) => sample.performedQuarterBpm < 500)).toBe(true)
  })

  it('breaks one interval around an additional group without shifting later timing', () => {
    const plan = makePlan([[60], [62], [64], [65], [67]])
    const result = analyze(plan, melodyRecording([60, 62, 61, 64, 65, 67], [500, 1_000, 1_250, 1_500, 2_000, 2_500]))
    expect(result.rhythm.observations.some((observation) => observation.intervalExclusionReason === 'structural-gap')).toBe(true)
    expect(result.rhythm.observations.at(-1)?.intervalCategory).toBe('within-tolerance')
  })

  it('limits aligned-span timing to a unique mid-piece section', () => {
    const plan = makePlan([[69], [71], [60], [62], [64], [65], [67], [69], [71], [60]])
    const result = analyze(plan, melodyRecording([64, 65, 67, 69], [800, 1_300, 1_800, 2_300]))
    expect(result.scope.expectedStartGroupId).toBe('expected-group:4')
    expect(result.rhythm.observations.map((observation) => observation.expectedGroupId)).toEqual(['expected-group:4', 'expected-group:5', 'expected-group:6', 'expected-group:7'])
  })

  it('does not penalize recording-start silence', () => {
    const plan = constantPlan(5)
    const result = analyze(plan, melodyRecording([60, 61, 62, 63, 64], [2_500, 3_000, 3_500, 4_000, 4_500]))
    expect(result.rhythm.rhythmScore).toBeCloseTo(1)
    expect(result.tempo.tempoScore).toBeCloseTo(1)
  })

  it('returns unavailable for one correspondence and limited evidence for two', () => {
    const onePlan = makePlan([[60]])
    const one = analyze(onePlan, melodyRecording([60], [1_000]))
    const twoPlan = makePlan([[60], [62]])
    const two = analyze(twoPlan, melodyRecording([60, 62], [1_000, 1_500]))

    expect(one.status).toBe('unavailable')
    expect(one.rhythm.rhythmScore).toBeNull()
    expect(two.status).toBe('ready')
    expect(two.reliability).toBe('limited')
    expect(two.tempo.tempoStabilityScore).toBeNull()
  })

  it('keeps timing unavailable when score-region localization is unresolved', () => {
    const plan = makePlan([[60], [62], [64]])
    const result = analyze(plan, melodyRecording([61, 63, 65], [500, 1_000, 1_500]))
    expect(result.reliability).toBe('unavailable')
  })

  it('preserves residual sign and exact score positions', () => {
    const plan = constantPlan(5, { positions: [0, 1, 2, 3, 4] })
    const result = analyze(plan, melodyRecording([60, 61, 62, 63, 64], [500, 1_020, 1_500, 1_980, 2_500]))
    expect(result.rhythm.observations[1]?.residualMs).toBeGreaterThan(0)
    expect(result.rhythm.observations[3]?.residualMs).toBeLessThan(0)
    expect(result.rhythm.observations[2]?.expectedPosition).toEqual({ numerator: 2, denominator: 1 })
  })

  it('inverts Phase 4 time scale when converting target BPM', () => {
    const plan = constantPlan(5, { tempoPoints: [{ position: 0, bpm: 80 }] })
    const result = analyze(plan, melodyRecording([60, 61, 62, 63, 64], [500, 1_437.5, 2_375, 3_312.5, 4_250]))
    expect(result.tempo.globalTimeScale).toBeCloseTo(1.25)
    expect(result.tempo.globalTempoRatio).toBeCloseTo(0.8)
    expect(result.tempo.estimatedAverageQuarterBpm).toBeCloseTo(64)
  })

  it('avoids NaN and Infinity for duplicate score positions and tiny intervals', () => {
    const plan = makePlan([[60], [62], [64]], { positions: [0, 0, 1] })
    const result = analyze(plan, melodyRecording([60, 62, 64], [500, 510, 1_000]))
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain('NaN')
    expect(serialized).not.toContain('Infinity')
  })

  it('is deterministic, immutable, bounded, and does not mutate inputs', () => {
    const plan = constantPlan()
    const recording = melodyRecording([60, 61, 62, 63, 64, 65], [700, 1_210, 1_690, 2_220, 2_680, 3_230])
    const alignment = alignPerformance(plan, recording)
    const noteGrading = gradeNotes({ expectedPlan: plan, recording, alignment })
    const before = JSON.stringify({ plan, recording, alignment, noteGrading })
    const first = analyzeTiming({ expectedPlan: plan, recording, alignment, noteGrading })
    const second = analyzeTiming({ expectedPlan: plan, recording, alignment, noteGrading })

    expect(first).toEqual(second)
    expect(JSON.stringify({ plan, recording, alignment, noteGrading })).toBe(before)
    expect(Object.isFrozen(first)).toBe(true)
    expect(Object.isFrozen(first.rhythm.observations)).toBe(true)
    expect(first.rhythm.rhythmScore).toBeGreaterThanOrEqual(0)
    expect(first.rhythm.rhythmScore).toBeLessThanOrEqual(1)
    expect(first.tempo.tempoScore).toBeGreaterThanOrEqual(0)
    expect(first.tempo.tempoScore).toBeLessThanOrEqual(1)
  })

  it('handles several hundred correspondences without whole-score quadratic matching', () => {
    const pitches = Array.from({ length: 500 }, (_, index) => [48 + index % 36])
    const plan = makePlan(pitches)
    const recording = melodyRecording(pitches.map(([midi]) => midi!), pitches.map((_, index) => 800 + index * 505))
    const result = analyze(plan, recording)
    expect(result.rhythm.observations).toHaveLength(500)
    expect(result.tempo.localSamples.length).toBeGreaterThan(400)
  })
})
