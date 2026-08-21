import type { AdditionalPerformedAttackResult, ExpectedTargetResult } from '../note-grading/types'
import { calculateNoteMetrics } from '../note-grading/metrics'
import { timeToNumber } from '../musicxml/musicalTime'
import { DEFAULT_TIMING_ANALYSIS_OPTIONS } from '../timing-analysis/options'
import { clamp01, median, smoothDeviationScore, theilSenSlope, trimmedMean } from '../timing-analysis/math'
import type { LocalTempoSample, QualitativeTempoDirectionObservation, RhythmObservation, TempoTrend } from '../timing-analysis/types'
import type { PerformanceResultOptions } from './options'
import type {
  MeasureEvidence,
  MeasureNoteMetrics,
  MeasureRhythmMetrics,
  MeasureTempoMetrics,
  PracticePriority,
  PracticePriorityComponent,
  ResultConfidence,
  ResultDimension,
  ResultIssueCategory,
} from './types'

export interface TempoTargetContext {
  readonly effectiveBpms: readonly number[]
  readonly source: 'authored' | 'fallback' | 'mixed' | null
}

export function aggregateNoteMetrics(
  expectedResults: readonly ExpectedTargetResult[],
  additionalResults: readonly AdditionalPerformedAttackResult[],
): MeasureNoteMetrics {
  const graded = expectedResults.filter((result) => result.kind === 'correct' || result.kind === 'wrong-pitch' || result.kind === 'missed')
  const counts = {
    correct: graded.filter((result) => result.kind === 'correct').length,
    wrongPitch: graded.filter((result) => result.kind === 'wrong-pitch').length,
    missed: graded.filter((result) => result.kind === 'missed').length,
    additional: additionalResults.length,
  }
  return {
    ...counts,
    gradeableExpectedTargets: counts.correct + counts.wrongPitch + counts.missed,
    ...calculateNoteMetrics(counts, graded.length > 0),
    expectedResultIds: graded.map((result) => result.id),
    attributedAdditionalResultIds: additionalResults.map((result) => result.id),
  }
}

export function aggregateRhythmMetrics(
  observations: readonly RhythmObservation[],
  options: PerformanceResultOptions,
): MeasureRhythmMetrics {
  const scored = observations.filter((observation) => observation.rhythmLoss !== null)
  const losses = scored.map((observation) => observation.rhythmLoss!)
  const medianLoss = median(losses)
  const meanLoss = trimmedMean(losses, DEFAULT_TIMING_ANALYSIS_OPTIONS.rhythmTrimFraction)
  const hasMetric = scored.length >= options.minimumRhythmObservationsForMetric && medianLoss !== null && meanLoss !== null
  const rhythmScore = hasMetric ? clamp01(1 - (0.65 * medianLoss + 0.35 * meanLoss)) : null
  return {
    rhythmScore,
    observationCount: observations.filter((observation) => observation.anchorQuality !== 'excluded').length,
    scoredIntervalCount: scored.length,
    medianAbsoluteResidualMs: median(observations.filter((observation) => observation.anchorQuality !== 'excluded').map((observation) => Math.abs(observation.residualMs))),
    medianAbsoluteNormalizedError: median(scored.map((observation) => Math.abs(observation.normalizedIntervalError!))),
    proportionInsideTolerance: scored.length ? scored.filter((observation) => observation.intervalCategory === 'within-tolerance').length / scored.length : null,
    earlyCount: scored.filter((observation) => observation.timingCategory === 'early').length,
    lateCount: scored.filter((observation) => observation.timingCategory === 'late').length,
    observationIds: observations.map((observation) => observation.id),
    boundaryAttributionPolicy: 'destination-onset-measure',
  }
}

function sampleTrend(samples: readonly LocalTempoSample[]): TempoTrend {
  if (samples.length < DEFAULT_TIMING_ANALYSIS_OPTIONS.minimumTrendSamples) return 'insufficient-data'
  const positions = samples.map((sample) => timeToNumber(sample.position))
  const start = Math.min(...positions)
  const span = Math.max(...positions) - start
  if (span <= 0) return 'insufficient-data'
  const slope = theilSenSlope(samples.map((sample, index) => ({ x: (positions[index]! - start) / span, y: Math.log(sample.tempoRatio) })))
  if (slope === null) return 'insufficient-data'
  const threshold = Math.log1p(DEFAULT_TIMING_ANALYSIS_OPTIONS.trendThresholdRatio)
  return slope > threshold ? 'rushing' : slope < -threshold ? 'dragging' : 'stable'
}

export function aggregateTempoMetrics(
  samples: readonly LocalTempoSample[],
  directions: readonly QualitativeTempoDirectionObservation[],
  target: TempoTargetContext,
  options: PerformanceResultOptions,
): MeasureTempoMetrics {
  const medianRatio = median(samples.map((sample) => sample.tempoRatio))
  const enoughEvidence = samples.length >= options.minimumTempoSamplesForMetric && medianRatio !== null
  const accuracy = enoughEvidence ? smoothDeviationScore(Math.abs(Math.log(medianRatio)), DEFAULT_TIMING_ANALYSIS_OPTIONS.tempoToleranceRatio, DEFAULT_TIMING_ANALYSIS_OPTIONS.tempoAccuracyFalloffRatio) : null
  const localDeviation = medianRatio === null ? null : median(samples.map((sample) => Math.abs(Math.log(sample.tempoRatio / medianRatio))))
  const stability = enoughEvidence && localDeviation !== null
    ? smoothDeviationScore(localDeviation, DEFAULT_TIMING_ANALYSIS_OPTIONS.tempoStabilityToleranceRatio, DEFAULT_TIMING_ANALYSIS_OPTIONS.tempoStabilityFalloffRatio)
    : null
  const weighted = [[accuracy, DEFAULT_TIMING_ANALYSIS_OPTIONS.targetAccuracyWeight], [stability, DEFAULT_TIMING_ANALYSIS_OPTIONS.stabilityWeight]] as const
  const availableWeight = weighted.reduce((sum, [value, weight]) => sum + (value === null ? 0 : weight), 0)
  const tempoScore = availableWeight === 0 ? null : clamp01(weighted.reduce((sum, [value, weight]) => sum + (value === null ? 0 : value * weight), 0) / availableWeight)
  const distinctBpms = [...new Set(target.effectiveBpms.map((bpm) => bpm.toFixed(9)))].map(Number)
  const targetVaries = distinctBpms.length > 1
  return {
    tempoScore,
    targetTempoAccuracyScore: accuracy,
    tempoStabilityScore: stability,
    sampleCount: samples.length,
    medianTempoRatio: enoughEvidence ? medianRatio : null,
    estimatedPerformedQuarterBpm: enoughEvidence ? median(samples.map((sample) => sample.performedQuarterBpm)) : null,
    effectiveTargetQuarterBpm: distinctBpms.length === 1 ? distinctBpms[0]! : null,
    minimumEffectiveTargetQuarterBpm: distinctBpms.length ? Math.min(...distinctBpms) : null,
    maximumEffectiveTargetQuarterBpm: distinctBpms.length ? Math.max(...distinctBpms) : null,
    targetVaries,
    targetSource: target.source,
    trend: sampleTrend(samples),
    sampleIds: samples.map((sample) => sample.id),
    qualitativeDirectionObservationIds: directions.map((direction) => direction.id),
  }
}

export function buildEvidence(note: MeasureNoteMetrics, rhythm: MeasureRhythmMetrics, tempo: MeasureTempoMetrics, alignmentCorrespondenceCount: number): MeasureEvidence {
  return {
    expectedNoteTargets: note.gradeableExpectedTargets,
    gradedNoteTargets: note.gradeableExpectedTargets,
    attributedAdditionalAttacks: note.additional,
    rhythmObservationCount: rhythm.observationCount,
    scoredRhythmIntervalCount: rhythm.scoredIntervalCount,
    tempoSampleCount: tempo.sampleCount,
    alignmentCorrespondenceCount,
  }
}

function saturation(value: number, target: number): number {
  return clamp01(value / target)
}

export function buildConfidence(
  evidence: MeasureEvidence,
  noteAvailable: boolean,
  rhythmAvailable: boolean,
  tempoAvailable: boolean,
  provisional: boolean,
  options: PerformanceResultOptions,
): ResultConfidence {
  const dimensionWeights: number[] = []
  if (noteAvailable) dimensionWeights.push(saturation(evidence.gradedNoteTargets, options.noteEvidenceSaturation))
  if (rhythmAvailable || evidence.rhythmObservationCount > 0) dimensionWeights.push(saturation(evidence.scoredRhythmIntervalCount, options.rhythmEvidenceSaturation))
  if (tempoAvailable || evidence.tempoSampleCount > 0) dimensionWeights.push(saturation(evidence.tempoSampleCount, options.tempoEvidenceSaturation))
  if (dimensionWeights.length === 0 && evidence.alignmentCorrespondenceCount === 0) return { category: 'insufficient', weight: 0, provisional, reasons: ['No gradeable or timing evidence is available.'] }
  const dimensionWeight = dimensionWeights.length ? dimensionWeights.reduce((sum, value) => sum + value, 0) / dimensionWeights.length : 0
  const alignmentWeight = saturation(evidence.alignmentCorrespondenceCount, options.alignmentEvidenceSaturation)
  const weight = clamp01((dimensionWeight * 0.85 + alignmentWeight * 0.15) * (provisional ? 0.72 : 1))
  const category = weight >= options.highConfidenceThreshold ? 'high' : weight >= options.mediumConfidenceThreshold ? 'medium' : weight >= options.lowConfidenceThreshold ? 'low' : 'insufficient'
  const reasons = [
    `${evidence.gradedNoteTargets} graded note target${evidence.gradedNoteTargets === 1 ? '' : 's'}`,
    `${evidence.scoredRhythmIntervalCount} scored rhythm interval${evidence.scoredRhythmIntervalCount === 1 ? '' : 's'}`,
    `${evidence.tempoSampleCount} local tempo sample${evidence.tempoSampleCount === 1 ? '' : 's'}`,
  ]
  if (provisional) reasons.push('Source correspondence is provisional.')
  return { category, weight, provisional, reasons }
}

function configuredWeight(dimension: ResultDimension, options: PerformanceResultOptions): number {
  if (dimension === 'notes') return options.notePriorityWeight
  if (dimension === 'rhythm') return options.rhythmPriorityWeight
  return options.tempoPriorityWeight
}

export function buildPracticePriority(
  scores: Readonly<{ notes: number | null; rhythm: number | null; tempo: number | null }>,
  evidence: MeasureEvidence,
  confidence: ResultConfidence,
  options: PerformanceResultOptions,
): PracticePriority {
  const evidenceByDimension: Record<ResultDimension, number> = {
    notes: saturation(evidence.gradedNoteTargets, options.noteEvidenceSaturation),
    rhythm: saturation(evidence.scoredRhythmIntervalCount, options.rhythmEvidenceSaturation),
    tempo: saturation(evidence.tempoSampleCount, options.tempoEvidenceSaturation),
  }
  const components = (Object.entries(scores) as [ResultDimension, number | null][]).flatMap(([dimension, score]) => score === null ? [] : [{
    dimension,
    score,
    deficit: clamp01(1 - score),
    configuredWeight: configuredWeight(dimension, options),
    evidenceWeight: evidenceByDimension[dimension],
  } satisfies PracticePriorityComponent])
  const totalConfiguredWeight = components.reduce((sum, component) => sum + component.configuredWeight, 0)
  if (totalConfiguredWeight === 0) return { rawWeakness: null, confidenceAdjustedPriority: null, label: 'unavailable', components }
  const rawWeakness = clamp01(components.reduce((sum, component) => sum + component.deficit * component.configuredWeight, 0) / totalConfiguredWeight)
  const confidenceFactor = options.confidencePriorityFloor + (1 - options.confidencePriorityFloor) * confidence.weight
  const adjusted = clamp01(rawWeakness * confidenceFactor)
  const label = adjusted >= options.highPriorityThreshold ? 'high' : adjusted >= options.mediumPriorityThreshold ? 'medium' : 'low'
  return { rawWeakness, confidenceAdjustedPriority: adjusted, label, components }
}

export function deriveIssueCategories(note: MeasureNoteMetrics, rhythm: MeasureRhythmMetrics, tempo: MeasureTempoMetrics, hasUnfollowedDirection: boolean): ResultIssueCategory[] {
  const issues: ResultIssueCategory[] = []
  if (note.wrongPitch > 0) issues.push('pitch-accuracy')
  if (note.missed > 0) issues.push('missed-notes')
  if (note.additional > 0) issues.push('additional-notes')
  if (rhythm.rhythmScore !== null && rhythm.rhythmScore < 0.82) issues.push('rhythm-consistency')
  if (tempo.tempoScore !== null && tempo.tempoScore < 0.82) issues.push('tempo-control')
  if (hasUnfollowedDirection) issues.push('tempo-direction')
  return issues
}

export function strengthIndex(scores: Readonly<{ notes: number | null; rhythm: number | null; tempo: number | null }>, options: PerformanceResultOptions): number | null {
  const entries = (Object.entries(scores) as [ResultDimension, number | null][]).filter((entry): entry is [ResultDimension, number] => entry[1] !== null)
  const weight = entries.reduce((sum, [dimension]) => sum + configuredWeight(dimension, options), 0)
  return weight === 0 ? null : clamp01(entries.reduce((sum, [dimension, score]) => sum + score * configuredWeight(dimension, options), 0) / weight)
}
