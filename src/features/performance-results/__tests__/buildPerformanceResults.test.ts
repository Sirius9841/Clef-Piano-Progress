import { describe, expect, it } from 'vitest'
import { alignPerformance } from '../../alignment/alignPerformance'
import { makePlan, makeRecording } from '../../alignment/__tests__/fixtures'
import { gradeNotes } from '../../note-grading/gradeNotes'
import { analyzeTiming } from '../../timing-analysis/analyzeTiming'
import { buildPerformanceResults } from '../buildPerformanceResults'
import { aggregateNoteMetrics, buildConfidence, buildEvidence, buildPracticePriority } from '../metrics'
import { DEFAULT_PERFORMANCE_RESULT_OPTIONS } from '../options'
import { analyzeResult, makeResultPlan, makeScore, recordingForPlan } from './fixtures'

describe('buildPerformanceResults', () => {
  it('aggregates a perfect multi-measure take without inventing mistakes', () => {
    const plan = makeResultPlan(4)
    const { results } = analyzeResult(plan, recordingForPlan(plan))

    expect(results.status).toBe('ready')
    expect(results.measures).toHaveLength(4)
    expect(results.summary.notes).toBe(1)
    expect(results.summary.rhythm).toBeCloseTo(1)
    expect(results.summary.tempo).toBeCloseTo(1)
    expect(results.mistakes).toEqual([])
    expect(results.strongestSections).toHaveLength(1)
  })

  it('recalculates measure note F1 from correct, wrong, missed, and additional counts', () => {
    const plan = makePlan([[60, 64, 67], [62], [65]], { measureIndices: [0, 0, 0] })
    const recording = makeRecording([{ ms: 1_000, midi: 60 }, { ms: 1_000, midi: 63 }, { ms: 1_000, midi: 70 }, { ms: 1_500, midi: 62 }], { planId: plan.id })
    const { results } = analyzeResult(plan, recording)
    const measure = results.measures[0]!

    expect(measure.note.correct).toBeGreaterThan(0)
    expect(measure.note.wrongPitch + measure.note.missed).toBeGreaterThan(0)
    expect(measure.note.additional).toBeGreaterThanOrEqual(0)
    expect(measure.note.noteScore).toBeCloseTo(2 * measure.note.precision! * measure.note.recall! / (measure.note.precision! + measure.note.recall!))
  })

  it('attributes a cross-measure rhythm interval to its destination onset once', () => {
    const plan = makeResultPlan(2, 3)
    const recording = recordingForPlan(plan, (attack, index) => ({ ...attack, ms: attack.ms + (index >= 3 ? 230 : 0) }))
    const { timingAnalysis, results } = analyzeResult(plan, recording)
    const boundary = timingAnalysis.rhythm.observations.find((observation) => observation.expectedGroupId === 'expected-group:3')!

    expect(results.measures[1]!.rhythm.observationIds).toContain(boundary.id)
    expect(results.measures[0]!.rhythm.observationIds).not.toContain(boundary.id)
    expect(results.measures.reduce((sum, measure) => sum + measure.rhythm.observationIds.filter((id) => id === boundary.id).length, 0)).toBe(1)
  })

  it('aggregates rhythm from underlying interval losses rather than averaging displayed scores', () => {
    const plan = makeResultPlan(2, 4)
    const recording = recordingForPlan(plan, (attack, index) => ({ ...attack, ms: attack.ms + (index === 2 ? 180 : index >= 5 ? 55 : 0) }))
    const { results } = analyzeResult(plan, recording)
    const section = results.sections[0]!

    expect(section.rhythm.scoredIntervalCount).toBe(results.measures.reduce((sum, measure) => sum + measure.rhythm.scoredIntervalCount, 0))
    expect(section.rhythm.observationIds).toHaveLength(new Set(section.rhythm.observationIds).size)
  })

  it('preserves authored tempo changes without presenting one false numeric target', () => {
    const plan = makeResultPlan(3, 4, { tempoPoints: [{ position: 0, bpm: 120 }, { position: 5, bpm: 90 }] })
    const { results } = analyzeResult(plan, recordingForPlan(plan))

    expect(results.measures[1]!.tempo.targetVaries).toBe(true)
    expect(results.measures[1]!.tempo.effectiveTargetQuarterBpm).toBeNull()
    expect(results.measures[1]!.tempo.minimumEffectiveTargetQuarterBpm).toBe(90)
    expect(results.measures[1]!.tempo.maximumEffectiveTargetQuarterBpm).toBe(120)
  })

  it('preserves qualitative tempo-direction evidence without inventing numeric data', () => {
    const plan = makePlan(Array.from({ length: 8 }, (_, index) => [60 + index % 7]), { positions: Array.from({ length: 8 }, (_, index) => index), measureIndices: Array.from({ length: 8 }, (_, index) => Math.floor(index / 4)), tempoDirections: [{ position: 1, kind: 'ritardando', text: 'rall.' }] })
    const { results, timingAnalysis } = analyzeResult(plan, recordingForPlan(plan))

    expect(timingAnalysis.tempo.directionObservations[0]?.outcome).toBe('not-followed')
    expect(results.measures[1]!.tempo.qualitativeDirectionObservationIds).toContain(timingAnalysis.tempo.directionObservations[0]!.id)
    expect(results.mistakes.some((mistake) => mistake.type === 'tempo-direction' && mistake.measureIndex === 1)).toBe(true)
  })

  it('keeps one coherent measure result across included score parts and staves', () => {
    const plan = { ...makeResultPlan(2, 3), includedPartIds: ['P1', 'P2'] }
    const base = makeScore(plan)
    const secondPart = { id: 'P2', name: 'Second staff source', abbreviation: null, measures: base.parts[0]!.measures.map((measure) => ({ ...measure, id: measure.id.replace('P1', 'P2'), events: [] })) }
    const score = { ...base, parts: [...base.parts, secondPart] }
    const recording = recordingForPlan(plan)
    const alignment = alignPerformance(plan, recording)
    const noteGrading = gradeNotes({ expectedPlan: plan, recording, alignment, options: { gradingScope: 'full-plan' } })
    const timingAnalysis = analyzeTiming({ expectedPlan: plan, recording, alignment, noteGrading })
    const results = buildPerformanceResults({ normalizedScore: score, expectedPlan: plan, alignment, noteGrading, timingAnalysis })

    expect(results.measures).toHaveLength(2)
    expect(results.measures[0]!.partIds).toEqual(['P1', 'P2'])
    expect(results.measures[0]!.sourceMeasureIds).toEqual(['measure:P1:0', 'measure:P2:0'])
    expect(results.mapping.bySourceMeasureId['measure:P2:0']?.measureResultId).toBe(results.measures[0]!.id)
  })

  it('marks timing dimensions unavailable instead of zero when evidence is sparse', () => {
    const plan = makePlan([[60]], { measureIndices: [0] })
    const { results } = analyzeResult(plan, recordingForPlan(plan))
    const measure = results.measures[0]!

    expect(results.reliability).toBe('limited')
    expect(measure.note.noteScore).toBe(1)
    expect(measure.rhythm.rhythmScore).toBeNull()
    expect(measure.tempo.tempoScore).toBeNull()
    expect(results.sections).toEqual([])
    expect(results.warnings.some((warning) => warning.code === 'TIMING_RESULTS_UNAVAILABLE')).toBe(true)
  })

  it('honors aligned-span scope without penalizing unplayed surrounding measures', () => {
    const plan = makeResultPlan(6, 2)
    const recording = makeRecording(plan.attacks.slice(4, 8).map((attack, index) => ({ ms: 1_000 + index * 500, midi: attack.midi })), { planId: plan.id })
    const { results } = analyzeResult(plan, recording, 'aligned-span')

    expect(results.scope).toBe('aligned-span')
    expect(results.measures.some((measure) => measure.analysisState === 'outside-scope')).toBe(true)
    expect(results.measures.filter((measure) => measure.analysisState === 'outside-scope').every((measure) => measure.note.missed === 0)).toBe(true)
  })

  it('maps wrong and missed targets back to deterministic expected and source-note IDs', () => {
    const plan = makePlan([[60, 64, 67], [62], [65]], { positions: [0, 1, 2], measureIndices: [0, 0, 1] })
    const recording = makeRecording([{ ms: 1_000, midi: 60 }, { ms: 1_000, midi: 63 }, { ms: 1_000, midi: 67 }, { ms: 1_500, midi: 62 }], { planId: plan.id })
    const { results } = analyzeResult(plan, recording)
    const problems = results.mistakes.filter((mistake) => mistake.type === 'wrong-pitch' || mistake.type === 'missed')

    expect(problems.length).toBeGreaterThanOrEqual(1)
    for (const mistake of problems) {
      expect(mistake.sourceExpectedAttackIds.length).toBeGreaterThan(0)
      expect(mistake.sourceNoteIds.length).toBeGreaterThan(0)
      expect(results.mapping.bySourceNoteId[mistake.sourceNoteIds[0]!]?.mistakeIds).toContain(mistake.id)
    }
  })

  it('maps simultaneous duplicate notation pitches to one physical target while retaining both sources', () => {
    const plan = makePlan([[60, 60], [62], [64]], { measureIndices: [0, 0, 0], sourceNoteIds: [['voice-one-c4', 'voice-two-c4'], ['d4'], ['e4']] })
    const recording = makeRecording([{ ms: 1_000, midi: 62 }, { ms: 1_500, midi: 64 }], { planId: plan.id })
    const { results } = analyzeResult(plan, recording)

    expect(results.measures[0]!.note.missed).toBe(1)
    expect(results.mapping.bySourceNoteId['voice-one-c4']!.expectedTargetResultIds).toEqual(results.mapping.bySourceNoteId['voice-two-c4']!.expectedTargetResultIds)
  })

  it('never fabricates notation provenance for an unattributed performed-only attack', () => {
    const plan = makeResultPlan(2, 3)
    const recording = makeRecording([{ ms: 400, midi: 88 }, ...plan.attacks.map((attack, index) => ({ ms: 1_000 + index * 500, midi: attack.midi }))], { planId: plan.id })
    const { results } = analyzeResult(plan, recording)
    const extra = results.mistakes.find((mistake) => mistake.type === 'additional' && mistake.measureResultId === null)

    expect(extra).toBeDefined()
    expect(extra!.sourceNoteIds).toEqual([])
    expect(extra!.sourceExpectedAttackIds).toEqual([])
    expect(results.mapping.unattributedMistakeIds).toContain(extra!.id)
  })

  it('attributes an extra between two measures to the following score region without source-note IDs', () => {
    const plan = makePlan([[60], [62], [64], [65]], { positions: [0, 1, 2, 3], measureIndices: [0, 0, 1, 1] })
    const recording = makeRecording([{ ms: 1_000, midi: 60 }, { ms: 1_500, midi: 62 }, { ms: 1_750, midi: 90 }, { ms: 2_000, midi: 64 }, { ms: 2_500, midi: 65 }], { planId: plan.id })
    const { results } = analyzeResult(plan, recording)
    const extra = results.mistakes.find((mistake) => mistake.type === 'additional')

    expect(extra).toMatchObject({ attribution: 'bracketed-region', measureIndex: 1 })
    expect(extra!.sourceNoteIds).toEqual([])
    expect(results.measures[1]!.note.additional).toBe(1)
  })

  it('preserves excluded expected-target provenance without counting an excluded key as missed', () => {
    const plan = makePlan([[60, 109], [62], [64]], { measureIndices: [0, 0, 0] })
    const recording = makeRecording([{ ms: 1_000, midi: 60 }, { ms: 1_500, midi: 62 }, { ms: 2_000, midi: 64 }], { planId: plan.id })
    const { results, noteGrading } = analyzeResult(plan, recording)
    const excluded = noteGrading.expectedResults.find((result) => result.kind === 'excluded')!

    expect(results.measures[0]!.note.missed).toBe(0)
    const reference = results.mapping.byExpectedAttackId[excluded.target.sourceExpectedAttackIds[0]!]!
    expect(reference.resultKinds).toContain('excluded')
    expect(reference.measureResultIds).toEqual([results.measures[0]!.id])
  })

  it('builds section note metrics from combined counts, not a mean of measure percentages', () => {
    const plan = makePlan([[60], Array.from({ length: 8 }, (_, index) => 62 + index)], { positions: [0, 1], measureIndices: [0, 1] })
    const recording = makeRecording([{ ms: 1_000, midi: 60 }, { ms: 1_500, midi: 62 }], { planId: plan.id })
    const { results } = analyzeResult(plan, recording)
    const section = results.sections[0]!
    const counts = results.measures.reduce((sum, measure) => ({ correct: sum.correct + measure.note.correct, wrongPitch: sum.wrongPitch + measure.note.wrongPitch, missed: sum.missed + measure.note.missed, additional: sum.additional + measure.note.additional }), { correct: 0, wrongPitch: 0, missed: 0, additional: 0 })

    expect(section.note.correct).toBe(counts.correct)
    expect(section.note.missed).toBe(counts.missed)
    expect(section.note.noteScore).not.toBeCloseTo(results.measures.reduce((sum, measure) => sum + (measure.note.noteScore ?? 0), 0) / 2)
  })

  it('renormalizes Practice Priority over available dimensions using the documented 45/35/20 weights', () => {
    const note = aggregateNoteMetrics([], [])
    const rhythm = { rhythmScore: 0.5, observationCount: 4, scoredIntervalCount: 4, medianAbsoluteResidualMs: 20, medianAbsoluteNormalizedError: 0.2, proportionInsideTolerance: 0.5, earlyCount: 1, lateCount: 1, observationIds: [], boundaryAttributionPolicy: 'destination-onset-measure' as const }
    const tempo = { tempoScore: null, targetTempoAccuracyScore: null, tempoStabilityScore: null, sampleCount: 0, medianTempoRatio: null, estimatedPerformedQuarterBpm: null, effectiveTargetQuarterBpm: null, minimumEffectiveTargetQuarterBpm: null, maximumEffectiveTargetQuarterBpm: null, targetVaries: false, targetSource: null, trend: 'insufficient-data' as const, sampleIds: [], qualitativeDirectionObservationIds: [] }
    const evidence = buildEvidence({ ...note, noteScore: 0.5, precision: 0.5, recall: 0.5 }, rhythm, tempo, 4)
    const confidence = buildConfidence(evidence, true, true, false, false, DEFAULT_PERFORMANCE_RESULT_OPTIONS)
    const priority = buildPracticePriority({ notes: 0.5, rhythm: 0.5, tempo: null }, evidence, confidence, DEFAULT_PERFORMANCE_RESULT_OPTIONS)

    expect(priority.components.map((component) => component.configuredWeight)).toEqual([0.45, 0.35])
    expect(priority.rawWeakness).toBeCloseTo(0.5)
  })

  it('confidence-adjusts equal weaknesses so sparse evidence is ranked more cautiously', () => {
    const options = DEFAULT_PERFORMANCE_RESULT_OPTIONS
    const low = buildPracticePriority({ notes: 0.5, rhythm: null, tempo: null }, { expectedNoteTargets: 1, gradedNoteTargets: 1, attributedAdditionalAttacks: 0, rhythmObservationCount: 0, scoredRhythmIntervalCount: 0, tempoSampleCount: 0, alignmentCorrespondenceCount: 1 }, { category: 'low', weight: 0.2, provisional: false, reasons: [] }, options)
    const high = buildPracticePriority({ notes: 0.5, rhythm: null, tempo: null }, { expectedNoteTargets: 8, gradedNoteTargets: 8, attributedAdditionalAttacks: 0, rhythmObservationCount: 0, scoredRhythmIntervalCount: 0, tempoSampleCount: 0, alignmentCorrespondenceCount: 6 }, { category: 'high', weight: 1, provisional: false, reasons: [] }, options)

    expect(low.rawWeakness).toBe(high.rawWeakness)
    expect(low.confidenceAdjustedPriority!).toBeLessThan(high.confidenceAdjustedPriority!)
  })

  it('finds two distinct weak regions and suppresses overlapping near-duplicates', () => {
    const plan = makePlan(Array.from({ length: 36 }, (_, index) => [30 + index]), { positions: Array.from({ length: 36 }, (_, index) => index), measureIndices: Array.from({ length: 36 }, (_, index) => Math.floor(index / 3)) })
    const recording = recordingForPlan(plan, (attack, index) => {
      const measure = Math.floor(index / 3)
      return (measure >= 1 && measure <= 3) || (measure >= 8 && measure <= 10) ? null : attack
    })
    const { results } = analyzeResult(plan, recording)
    expect(results.weakestSections.length).toBeGreaterThanOrEqual(2)
    const ranges = results.weakestSections.map((section) => [section.startMeasureIndex, section.endMeasureIndex] as const)
    expect(ranges.some(([start, end]) => start <= 1 && end >= 1)).toBe(true)
    expect(ranges.some(([start, end]) => start <= 8 && end >= 8)).toBe(true)
  })

  it('orders mistakes by musical position deterministically', () => {
    const plan = makeResultPlan(4, 3)
    const recording = recordingForPlan(plan, (attack, index) => index === 2 || index === 9 ? { ...attack, midi: attack.midi + 2 } : attack)
    const first = analyzeResult(plan, recording).results
    const second = analyzeResult(plan, recording).results

    expect(first.id).toBe(second.id)
    expect(first.mistakes.map((mistake) => mistake.id)).toEqual(second.mistakes.map((mistake) => mistake.id))
    expect(first.mistakes.map((mistake) => mistake.measureIndex ?? Number.MAX_SAFE_INTEGER)).toEqual([...first.mistakes].sort((left, right) => (left.measureIndex ?? Number.MAX_SAFE_INTEGER) - (right.measureIndex ?? Number.MAX_SAFE_INTEGER)).map((mistake) => mistake.measureIndex ?? Number.MAX_SAFE_INTEGER))
  })

  it('returns an explicit unavailable result for mismatched snapshots', () => {
    const plan = makeResultPlan(2)
    const recording = recordingForPlan(plan)
    const alignment = alignPerformance(plan, recording)
    const noteGrading = gradeNotes({ expectedPlan: plan, recording, alignment, options: { gradingScope: 'full-plan' } })
    const timingAnalysis = analyzeTiming({ expectedPlan: plan, recording, alignment, noteGrading })
    const wrongScore = { ...makeScore(plan), id: 'score:other' }
    const result = buildPerformanceResults({ normalizedScore: wrongScore, expectedPlan: plan, alignment, noteGrading, timingAnalysis })

    expect(result.status).toBe('unavailable')
    expect(result.measures).toEqual([])
    expect(result.warnings[0]?.code).toBe('INPUT_ID_MISMATCH')
  })

  it('propagates provisional correspondence reliability into confidence and warnings', () => {
    const plan = makeResultPlan(2, 3)
    const recording = recordingForPlan(plan, (attack) => ({ ...attack, midi: attack.midi + 12 }))
    const { alignment, results } = analyzeResult(plan, recording)

    expect(alignment.status).toBe('ambiguous')
    expect(results.reliability).toBe('provisional')
    expect(results.measures.filter((measure) => measure.analysisState === 'analyzed').every((measure) => measure.confidence.provisional)).toBe(true)
    expect(results.warnings.some((warning) => warning.code === 'PROVISIONAL_SOURCE_ANALYSIS')).toBe(true)
  })

  it('does not mutate its source analysis snapshots and deeply freezes its output', () => {
    const plan = makeResultPlan(3)
    const recording = recordingForPlan(plan)
    const alignment = alignPerformance(plan, recording)
    const noteGrading = gradeNotes({ expectedPlan: plan, recording, alignment, options: { gradingScope: 'full-plan' } })
    const timingAnalysis = analyzeTiming({ expectedPlan: plan, recording, alignment, noteGrading })
    const score = makeScore(plan)
    const before = JSON.stringify({ plan, recording, alignment, noteGrading, timingAnalysis, score })
    const result = buildPerformanceResults({ normalizedScore: score, expectedPlan: plan, alignment, noteGrading, timingAnalysis })

    expect(JSON.stringify({ plan, recording, alignment, noteGrading, timingAnalysis, score })).toBe(before)
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.measures[0])).toBe(true)
    expect(Object.isFrozen(result.mapping.bySourceNoteId)).toBe(true)
  })

  it('handles a long score with bounded section windows and complete deterministic output', () => {
    const plan = makeResultPlan(160, 1)
    const { results } = analyzeResult(plan, recordingForPlan(plan))

    expect(results.measures).toHaveLength(160)
    expect(results.sections).toHaveLength(157)
    expect(results.heatmap).toHaveLength(160)
    expect(results.sections.every((section) => section.measureResultIds.length === 4)).toBe(true)
  })
})
