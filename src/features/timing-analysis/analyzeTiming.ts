import type { AlignmentResult, GroupCorrespondence } from '../alignment/types'
import { durationBetweenScorePositionsToMilliseconds } from '../expected-performance/tempoTimeline'
import type { ExpectedPerformancePlan, TempoTimelinePoint } from '../expected-performance/types'
import { compareTime, subtractTime, timeToNumber, type MusicalTime } from '../musicxml/musicalTime'
import type { NoteGradingResult } from '../note-grading/types'
import type { PerformanceRecording } from '../performance/types'
import { clamp01, deepFreeze, median, smoothDeviationScore, stableHash, theilSenSlope, trimmedMean } from './math'
import { resolveTimingAnalysisOptions, TIMING_ANALYSIS_ENGINE_VERSION, type TimingAnalysisOptions } from './options'
import { buildLocalTempoWindowGeometry } from './localTempoWindowGeometry'
import type {
  ChordSpreadDiagnostic,
  DirectionOutcome,
  LocalTempoSample,
  NumericTempoRegion,
  QualitativeTempoDirectionObservation,
  RhythmAnalysis,
  RhythmIntervalCategory,
  RhythmIntervalExclusionReason,
  RhythmObservation,
  RhythmRegionAggregate,
  TempoAnalysis,
  TempoTargetSummary,
  TempoTrend,
  TimingAnalysisReliability,
  TimingAnalysisResult,
  TimingAnalysisScope,
  TimingAnalysisWarning,
  TimingAnchorQuality,
  TimingCategory,
} from './types'

export interface AnalyzeTimingInput {
  readonly expectedPlan: ExpectedPerformancePlan
  readonly recording: PerformanceRecording
  readonly alignment: AlignmentResult
  readonly noteGrading: NoteGradingResult
  readonly options?: Partial<TimingAnalysisOptions>
}

interface AnchorClassification {
  quality: TimingAnchorQuality
  reason: string
}

function activeTempoPoint(plan: ExpectedPerformancePlan, position: MusicalTime): TempoTimelinePoint {
  let active = plan.tempoTimeline.points[0]!
  for (const point of plan.tempoTimeline.points) {
    if (compareTime(point.position, position) > 0) break
    active = point
  }
  return active
}

function effectiveQuarterBpm(plan: ExpectedPerformancePlan, position: MusicalTime, speed: number): { bpm: number; source: 'authored' | 'fallback' } {
  const point = activeTempoPoint(plan, position)
  return { bpm: point.quarterBpm * speed, source: point.source }
}

function scopeCopy(noteGrading: NoteGradingResult): TimingAnalysisScope {
  return { ...noteGrading.scope }
}

function scopeGroupIds(alignment: AlignmentResult, scope: TimingAnalysisScope): { expected: Set<string>; performed: Set<string> } {
  const expected = new Set<string>()
  const performed = new Set<string>()
  if (scope.expectedStartIndex !== null && scope.expectedEndIndex !== null) {
    for (let index = scope.expectedStartIndex; index <= scope.expectedEndIndex; index += 1) expected.add(alignment.expectedGroups[index]!.id)
  }
  if (scope.performedStartIndex !== null && scope.performedEndIndex !== null) {
    for (let index = scope.performedStartIndex; index <= scope.performedEndIndex; index += 1) performed.add(alignment.performedGroups[index]!.id)
  }
  return { expected, performed }
}

function classifyAnchor(
  step: GroupCorrespondence,
  wrongPitchCount: number,
  options: TimingAnalysisOptions,
): AnchorClassification {
  const exactPitchCount = step.attacks.pairs.length
  if (exactPitchCount > 0 && step.cost.pitchCost <= options.strongAnchorMaximumPitchCost && step.performedGroup.spreadMs <= options.strongAnchorMaximumSpreadMs) {
    return { quality: 'strong-anchor', reason: 'At least one exact pitch pair supplies a structurally strong timing anchor.' }
  }
  if ((exactPitchCount > 0 || wrongPitchCount > 0) && step.cost.pitchCost <= options.usableAnchorMaximumPitchCost && step.performedGroup.spreadMs <= options.usableAnchorMaximumSpreadMs) {
    return { quality: 'usable-observation', reason: wrongPitchCount > 0 && exactPitchCount === 0 ? 'A conservative Phase 5 wrong-pitch pairing preserves useful onset timing.' : 'The correspondence is usable for rhythm but not strong enough for local tempo windows.' }
  }
  return { quality: 'excluded', reason: step.performedGroup.spreadMs > options.usableAnchorMaximumSpreadMs ? 'Performed onset spread exceeds the conservative timing-observation limit.' : 'The correspondence lacks sufficient pitch structure for timing interpretation.' }
}

function chordDiagnostic(step: GroupCorrespondence, options: TimingAnalysisOptions): ChordSpreadDiagnostic {
  const spread = step.performedGroup.spreadMs
  return {
    id: `chord-spread:${stableHash(step.id)}`,
    expectedGroupId: step.expectedGroup.id,
    performedGroupId: step.performedGroup.id,
    measureNumbers: [...step.expectedGroup.measureNumbers],
    spreadMs: spread,
    classification: spread <= options.tightChordMaximumSpreadMs ? 'tight' : spread >= options.wideChordMinimumSpreadMs ? 'wide' : 'moderate',
    affectsRhythmScore: false,
  }
}

function timingCategory(residualMs: number, toleranceMs: number): TimingCategory {
  return Math.abs(residualMs) <= toleranceMs ? 'on-time' : residualMs < 0 ? 'early' : 'late'
}

function rhythmLoss(logError: number, toleranceLog: number, scale: number): number {
  if (toleranceLog <= 0) return Math.abs(logError) === 0 ? 0 : 1
  const excess = Math.max(0, Math.abs(logError) / toleranceLog - 1)
  return clamp01(1 - Math.exp(-scale * excess * excess))
}

function buildRhythm(
  plan: ExpectedPerformancePlan,
  alignment: AlignmentResult,
  correspondences: readonly GroupCorrespondence[],
  noteGrading: NoteGradingResult,
  options: TimingAnalysisOptions,
): RhythmAnalysis {
  const expectedIndices = new Map(alignment.expectedGroups.map((group, index) => [group.id, index]))
  const performedIndices = new Map(alignment.performedGroups.map((group, index) => [group.id, index]))
  const noteGroups = new Map(noteGrading.groupResults.map((group) => [group.groupAlignmentId, group]))
  const classified = correspondences.map((step) => ({ step, classification: classifyAnchor(step, noteGroups.get(step.id)?.counts.wrongPitch ?? 0, options) }))
  const intervalScales: number[] = []
  let scalePrevious: GroupCorrespondence | null = null
  for (const { step, classification } of classified) {
    if (classification.quality === 'excluded') continue
    if (scalePrevious) {
      const expectedContiguous = expectedIndices.get(step.expectedGroup.id) === expectedIndices.get(scalePrevious.expectedGroup.id)! + 1
      const performedContiguous = performedIndices.get(step.performedGroup.id) === performedIndices.get(scalePrevious.performedGroup.id)! + 1
      const referenceInterval = step.expectedGroup.referenceMs - scalePrevious.expectedGroup.referenceMs
      const performedInterval = step.performedGroup.representativeMs - scalePrevious.performedGroup.representativeMs
      if (expectedContiguous && performedContiguous && referenceInterval > 0 && performedInterval > 0) intervalScales.push(performedInterval / referenceInterval)
    }
    scalePrevious = step
  }
  const normalizationTimeScale = median(intervalScales) ?? (alignment.timeTransform.scale > 0 ? alignment.timeTransform.scale : null)
  const observations: RhythmObservation[] = []
  const chordSpreadDiagnostics: ChordSpreadDiagnostic[] = []
  let previousUsable: GroupCorrespondence | null = null

  for (const { step, classification } of classified) {
    const beat = effectiveQuarterBpm(plan, step.expectedGroup.position, alignment.practiceSpeedMultiplier)
    const performedBeatMs = 60_000 / beat.bpm * (normalizationTimeScale ?? alignment.timeTransform.scale)
    const onsetToleranceMs = Math.max(options.minimumTimingToleranceMs, performedBeatMs * options.relativeBeatTolerance)
    let previousExpectedGroupId: string | null = null
    let previousPerformedGroupId: string | null = null
    let referenceIntervalMs: number | null = null
    let predictedIntervalMs: number | null = null
    let performedIntervalMs: number | null = null
    let intervalDifferenceMs: number | null = null
    let normalizedIntervalError: number | null = null
    let allowedDeviationMs: number | null = null
    let loss: number | null = null
    let intervalCategory: RhythmIntervalCategory | null = null
    let intervalExclusionReason: RhythmIntervalExclusionReason | null = classification.quality === 'excluded' ? 'anchor-excluded' : 'first-usable-anchor'

    if (classification.quality !== 'excluded' && previousUsable) {
      previousExpectedGroupId = previousUsable.expectedGroup.id
      previousPerformedGroupId = previousUsable.performedGroup.id
      const expectedContiguous = expectedIndices.get(step.expectedGroup.id) === expectedIndices.get(previousUsable.expectedGroup.id)! + 1
      const performedContiguous = performedIndices.get(step.performedGroup.id) === performedIndices.get(previousUsable.performedGroup.id)! + 1
      if (!expectedContiguous || !performedContiguous) {
        intervalExclusionReason = 'structural-gap'
      } else {
        referenceIntervalMs = step.expectedGroup.referenceMs - previousUsable.expectedGroup.referenceMs
        predictedIntervalMs = referenceIntervalMs * (normalizationTimeScale ?? alignment.timeTransform.scale)
        performedIntervalMs = step.performedGroup.representativeMs - previousUsable.performedGroup.representativeMs
        if (referenceIntervalMs <= 0 || predictedIntervalMs <= 0) intervalExclusionReason = 'zero-reference-interval'
        else if (performedIntervalMs <= 0) intervalExclusionReason = 'non-monotonic-performance-time'
        else {
          intervalDifferenceMs = performedIntervalMs - predictedIntervalMs
          normalizedIntervalError = Math.log(performedIntervalMs / predictedIntervalMs)
          allowedDeviationMs = Math.max(options.minimumTimingToleranceMs, performedBeatMs * options.relativeBeatTolerance, predictedIntervalMs * options.relativeIntervalTolerance)
          const toleranceLog = Math.log1p(allowedDeviationMs / predictedIntervalMs)
          loss = rhythmLoss(normalizedIntervalError, toleranceLog, options.rhythmLossScale)
          intervalCategory = Math.abs(intervalDifferenceMs) <= allowedDeviationMs ? 'within-tolerance' : intervalDifferenceMs < 0 ? 'compressed' : 'expanded'
          intervalExclusionReason = null
        }
      }
    }

    observations.push({
      id: `rhythm-observation:${stableHash(step.id)}`,
      groupAlignmentId: step.id,
      expectedGroupId: step.expectedGroup.id,
      performedGroupId: step.performedGroup.id,
      expectedPosition: { ...step.expectedGroup.position },
      measureIndices: [...step.expectedGroup.measureIndices],
      measureNumbers: [...step.expectedGroup.measureNumbers],
      referenceMs: step.expectedGroup.referenceMs,
      predictedPerformedMs: step.predictedPerformedMs,
      observedMs: step.performedGroup.representativeMs,
      residualMs: step.timingResidualMs,
      timingCategory: timingCategory(step.timingResidualMs, onsetToleranceMs),
      anchorQuality: classification.quality,
      anchorReason: classification.reason,
      chordSpreadMs: step.performedGroup.spreadMs,
      previousExpectedGroupId,
      previousPerformedGroupId,
      referenceIntervalMs,
      predictedIntervalMs,
      performedIntervalMs,
      intervalDifferenceMs,
      normalizedIntervalError,
      allowedDeviationMs,
      rhythmLoss: loss,
      intervalCategory,
      intervalExclusionReason,
    })
    chordSpreadDiagnostics.push(chordDiagnostic(step, options))
    if (classification.quality !== 'excluded') previousUsable = step
  }

  const scored = observations.filter((observation) => observation.rhythmLoss !== null)
  const losses = scored.map((observation) => observation.rhythmLoss!)
  const medianLoss = median(losses)
  const robustMeanLoss = trimmedMean(losses, options.rhythmTrimFraction)
  const score = medianLoss === null || robustMeanLoss === null ? null : clamp01(1 - (0.65 * medianLoss + 0.35 * robustMeanLoss))
  const regionGroups = new Map<string, RhythmObservation[]>()
  for (const observation of observations) {
    const measureIndex = observation.measureIndices[0] ?? -1
    const measureNumber = observation.measureNumbers[0] ?? '—'
    const key = `${measureIndex}:${measureNumber}`
    const group = regionGroups.get(key)
    if (group) group.push(observation)
    else regionGroups.set(key, [observation])
  }
  const regions: RhythmRegionAggregate[] = [...regionGroups.entries()].map(([key, group]) => {
    const [rawIndex, ...numberParts] = key.split(':')
    const regionLosses = group.flatMap((observation) => observation.rhythmLoss === null ? [] : [observation.rhythmLoss])
    const regionMedianLoss = median(regionLosses)
    const differences = group.flatMap((observation) => observation.intervalDifferenceMs === null ? [] : [Math.abs(observation.intervalDifferenceMs)])
    return {
      id: `rhythm-region:${stableHash(key)}`,
      measureIndex: Number(rawIndex),
      measureNumber: numberParts.join(':'),
      observationCount: group.length,
      scoredIntervalCount: regionLosses.length,
      rhythmScore: regionMedianLoss === null ? null : clamp01(1 - regionMedianLoss),
      medianAbsoluteResidualMs: median(group.map((observation) => Math.abs(observation.residualMs))),
      maximumAbsoluteIntervalDifferenceMs: differences.length ? Math.max(...differences) : null,
    }
  })

  return {
    rhythmScore: score,
    normalizationTimeScale,
    observations,
    chordSpreadDiagnostics,
    regions,
    usableObservationCount: observations.filter((observation) => observation.anchorQuality !== 'excluded').length,
    strongAnchorCount: observations.filter((observation) => observation.anchorQuality === 'strong-anchor').length,
    scoredIntervalCount: scored.length,
    excludedObservationCount: observations.filter((observation) => observation.anchorQuality === 'excluded').length,
    medianAbsoluteNormalizedIntervalError: median(scored.map((observation) => Math.abs(observation.normalizedIntervalError!))),
    medianAbsoluteResidualMs: median(observations.filter((observation) => observation.anchorQuality !== 'excluded').map((observation) => Math.abs(observation.residualMs))),
    proportionInsideTolerance: scored.length ? scored.filter((observation) => observation.intervalCategory === 'within-tolerance').length / scored.length : null,
  }
}

function targetSummary(plan: ExpectedPerformancePlan, alignment: AlignmentResult, scope: TimingAnalysisScope): TempoTargetSummary {
  const startGroup = scope.expectedStartIndex === null ? alignment.expectedGroups[0] : alignment.expectedGroups[scope.expectedStartIndex]
  const endGroup = scope.expectedEndIndex === null ? alignment.expectedGroups.at(-1) : alignment.expectedGroups[scope.expectedEndIndex]
  const start = startGroup?.position ?? plan.onsetGroups[0]?.position ?? plan.tempoTimeline.points[0]!.position
  const end = endGroup?.position ?? plan.onsetGroups.at(-1)?.position ?? start
  const activeAtStart = activeTempoPoint(plan, start)
  const relevantPoints = [activeAtStart, ...plan.tempoTimeline.points.filter((point) => compareTime(point.position, start) > 0 && compareTime(point.position, end) <= 0)]
  const uniquePoints = relevantPoints.filter((point, index) => relevantPoints.findIndex((candidate) => candidate.id === point.id) === index)
  const numericRegions: NumericTempoRegion[] = uniquePoints.map((point) => ({
    id: `numeric-tempo-region:${stableHash(`${point.id}|${start.numerator}/${start.denominator}`)}`,
    position: compareTime(point.position, start) < 0 ? { ...start } : { ...point.position },
    authoredQuarterBpm: point.quarterBpm,
    effectiveQuarterBpm: point.quarterBpm * alignment.practiceSpeedMultiplier,
    source: point.source,
  }))
  const bpms = numericRegions.map((region) => region.effectiveQuarterBpm)
  const sources = new Set(numericRegions.map((region) => region.source))
  const scoreDuration = timeToNumber(subtractTime(end, start))
  const effectiveDurationMs = compareTime(end, start) > 0 ? durationBetweenScorePositionsToMilliseconds(start, end, plan.tempoTimeline, alignment.practiceSpeedMultiplier) : 0
  const averageEffectiveQuarterBpm = scoreDuration > 0 && effectiveDurationMs > 0 ? scoreDuration / (effectiveDurationMs / 60_000) : bpms[0] ?? null
  return {
    source: sources.size > 1 ? 'mixed' : sources.has('fallback') ? 'fallback' : 'authored',
    practiceSpeedMultiplier: alignment.practiceSpeedMultiplier,
    variableNumericTempo: new Set(bpms.map((bpm) => bpm.toFixed(9))).size > 1,
    constantEffectiveQuarterBpm: new Set(bpms.map((bpm) => bpm.toFixed(9))).size === 1 ? bpms[0]! : null,
    minimumEffectiveQuarterBpm: Math.min(...bpms),
    maximumEffectiveQuarterBpm: Math.max(...bpms),
    averageEffectiveQuarterBpm,
    numericRegions,
  }
}

function tempoTrend(samples: readonly LocalTempoSample[], options: TimingAnalysisOptions): { trend: TempoTrend; change: number | null } {
  if (samples.length < options.minimumTrendSamples) return { trend: 'insufficient-data', change: null }
  const positions = samples.map((sample) => timeToNumber(sample.position))
  const start = Math.min(...positions)
  const span = Math.max(...positions) - start
  if (span <= 0) return { trend: 'insufficient-data', change: null }
  const change = theilSenSlope(samples.map((sample, index) => ({ x: (positions[index]! - start) / span, y: Math.log(sample.tempoRatio) })))
  if (change === null) return { trend: 'insufficient-data', change: null }
  const threshold = Math.log1p(options.trendThresholdRatio)
  return { trend: change > threshold ? 'rushing' : change < -threshold ? 'dragging' : 'stable', change }
}

function localTempoSamples(
  plan: ExpectedPerformancePlan,
  alignment: AlignmentResult,
  strong: readonly GroupCorrespondence[],
  options: TimingAnalysisOptions,
): LocalTempoSample[] {
  const samples: LocalTempoSample[] = []
  const windows = buildLocalTempoWindowGeometry(
    strong.map((step) => ({ id: step.id, position: step.expectedGroup.position, step })),
    options.localTempoWindowBeats,
    options.minimumTempoWindowAnchors,
  )
  for (const window of windows) {
    const start = window.start.step
    const end = window.end.step
    const referenceIntervalMs = end.expectedGroup.referenceMs - start.expectedGroup.referenceMs
    const performedIntervalMs = end.performedGroup.representativeMs - start.performedGroup.representativeMs
    if (referenceIntervalMs <= 0 || performedIntervalMs <= 0) continue
    const target = effectiveQuarterBpm(plan, end.expectedGroup.position, alignment.practiceSpeedMultiplier)
    const localTimeScale = performedIntervalMs / referenceIntervalMs
    const tempoRatio = 1 / localTimeScale
    samples.push({
      id: `local-tempo:${stableHash(`${start.id}|${end.id}`)}`,
      startExpectedGroupId: start.expectedGroup.id,
      endExpectedGroupId: end.expectedGroup.id,
      position: { ...end.expectedGroup.position },
      measureNumbers: [...end.expectedGroup.measureNumbers],
      windowScoreDuration: { ...window.windowScoreDuration },
      anchorCount: window.anchorCount,
      referenceIntervalMs,
      performedIntervalMs,
      localTimeScale,
      tempoRatio,
      targetQuarterBpm: target.bpm,
      performedQuarterBpm: target.bpm * tempoRatio,
      targetSource: target.source,
    })
  }
  return samples
}

function directionObservations(
  plan: ExpectedPerformancePlan,
  alignment: AlignmentResult,
  scope: TimingAnalysisScope,
  samples: readonly LocalTempoSample[],
  options: TimingAnalysisOptions,
): QualitativeTempoDirectionObservation[] {
  if (scope.expectedStartIndex === null || scope.expectedEndIndex === null) return []
  const scopeStart = alignment.expectedGroups[scope.expectedStartIndex]!.position
  const scopeEnd = alignment.expectedGroups[scope.expectedEndIndex]!.position
  const directions = plan.tempoDirections.filter((direction) => compareTime(direction.position, scopeStart) >= 0 && compareTime(direction.position, scopeEnd) <= 0)
  return directions.map((direction, index) => {
    const nextDirection = directions[index + 1]
    const regionEnd = nextDirection?.position ?? scopeEnd
    const regionSamples = samples.filter((sample) => {
      if (compareTime(sample.position, direction.position) < 0) return false
      const endComparison = compareTime(sample.position, regionEnd)
      return nextDirection ? endComparison < 0 : endComparison <= 0
    })
    const directionTrend = tempoTrend(regionSamples, { ...options, minimumTrendSamples: options.minimumDirectionSamples })
    let outcome: DirectionOutcome = 'insufficient-data'
    if (regionSamples.length >= options.minimumDirectionSamples) {
      if (direction.kind === 'a-tempo') {
        const localMedian = median(regionSamples.map((sample) => sample.tempoRatio))!
        outcome = Math.abs(Math.log(localMedian)) <= Math.log1p(options.aTempoReturnToleranceRatio) ? 'followed' : 'not-followed'
      } else if (direction.kind === 'ritardando') outcome = directionTrend.trend === 'dragging' ? 'followed' : 'not-followed'
      else outcome = directionTrend.trend === 'rushing' ? 'followed' : 'not-followed'
    }
    return {
      id: `tempo-direction-observation:${stableHash(`${direction.id}|${alignment.id}`)}`,
      sourceEventId: direction.id,
      kind: direction.kind,
      text: direction.text,
      position: { ...direction.position },
      measureIndex: direction.measureIndex,
      measureNumber: direction.measureNumber,
      regionEnd: { ...regionEnd },
      sampleCount: regionSamples.length,
      observedTrend: directionTrend.trend,
      outcome,
      effectiveBaseQuarterBpm: effectiveQuarterBpm(plan, direction.position, alignment.practiceSpeedMultiplier).bpm,
      exactNumericCurveAvailable: false,
    }
  })
}

function buildTempo(
  plan: ExpectedPerformancePlan,
  alignment: AlignmentResult,
  scope: TimingAnalysisScope,
  correspondences: readonly GroupCorrespondence[],
  noteGrading: NoteGradingResult,
  options: TimingAnalysisOptions,
): TempoAnalysis {
  const noteGroups = new Map(noteGrading.groupResults.map((group) => [group.groupAlignmentId, group]))
  const strong = correspondences.filter((step) => classifyAnchor(step, noteGroups.get(step.id)?.counts.wrongPitch ?? 0, options).quality === 'strong-anchor')
  const samples = localTempoSamples(plan, alignment, strong, options)
  const target = targetSummary(plan, alignment, scope)
  const canUseGlobalScale = strong.length >= 2 && alignment.timeTransform.scaleFitted && alignment.timeTransform.scale > 0
  const globalTimeScale = canUseGlobalScale ? alignment.timeTransform.scale : null
  const globalTempoRatio = globalTimeScale === null ? null : 1 / globalTimeScale
  const accuracy = globalTempoRatio === null ? null : smoothDeviationScore(Math.abs(Math.log(globalTempoRatio)), options.tempoToleranceRatio, options.tempoAccuracyFalloffRatio)
  const medianRatio = median(samples.map((sample) => sample.tempoRatio))
  const medianAbsoluteLocalLogDeviation = medianRatio === null ? null : median(samples.map((sample) => Math.abs(Math.log(sample.tempoRatio / medianRatio))))
  const stability = medianAbsoluteLocalLogDeviation === null || samples.length < 2 ? null : smoothDeviationScore(medianAbsoluteLocalLogDeviation, options.tempoStabilityToleranceRatio, options.tempoStabilityFalloffRatio)
  const availableComponents = [[accuracy, options.targetAccuracyWeight], [stability, options.stabilityWeight]] as const
  const availableWeight = availableComponents.reduce((sum, [score, weight]) => sum + (score === null ? 0 : weight), 0)
  const tempoScore = availableWeight === 0 ? null : clamp01(availableComponents.reduce((sum, [score, weight]) => sum + (score === null ? 0 : score * weight), 0) / availableWeight)
  const trend = tempoTrend(samples, options)
  return {
    tempoScore,
    targetTempoAccuracyScore: accuracy,
    tempoStabilityScore: stability,
    globalTimeScale,
    globalTempoRatio,
    estimatedAverageQuarterBpm: globalTempoRatio === null || target.averageEffectiveQuarterBpm === null ? null : target.averageEffectiveQuarterBpm * globalTempoRatio,
    target,
    localSamples: samples,
    trend: trend.trend,
    trendLogRatioChange: trend.change,
    medianLocalTempoRatio: medianRatio,
    medianAbsoluteLocalLogDeviation,
    directionObservations: directionObservations(plan, alignment, scope, samples, options),
  }
}

function emptyRhythm(): RhythmAnalysis {
  return { rhythmScore: null, normalizationTimeScale: null, observations: [], chordSpreadDiagnostics: [], regions: [], usableObservationCount: 0, strongAnchorCount: 0, scoredIntervalCount: 0, excludedObservationCount: 0, medianAbsoluteNormalizedIntervalError: null, medianAbsoluteResidualMs: null, proportionInsideTolerance: null }
}

function emptyTempo(plan: ExpectedPerformancePlan, alignment: AlignmentResult, scope: TimingAnalysisScope): TempoAnalysis {
  return { tempoScore: null, targetTempoAccuracyScore: null, tempoStabilityScore: null, globalTimeScale: null, globalTempoRatio: null, estimatedAverageQuarterBpm: null, target: targetSummary(plan, alignment, scope), localSamples: [], trend: 'insufficient-data', trendLogRatioChange: null, medianLocalTempoRatio: null, medianAbsoluteLocalLogDeviation: null, directionObservations: [] }
}

export function analyzeTiming({ expectedPlan, recording, alignment, noteGrading, options: partialOptions = {} }: AnalyzeTimingInput): TimingAnalysisResult {
  const options = resolveTimingAnalysisOptions(partialOptions)
  const scope = scopeCopy(noteGrading)
  const inputMatches = alignment.expectedPlanId === expectedPlan.id && alignment.recordingId === recording.id && noteGrading.expectedPlanId === expectedPlan.id && noteGrading.recordingId === recording.id && noteGrading.alignmentId === alignment.id
  const warnings: TimingAnalysisWarning[] = []
  let unavailableReason: string | null = null
  if (!inputMatches) {
    unavailableReason = 'The plan, recording, alignment, and note-grading identities do not describe the same take.'
    warnings.push({ code: 'INPUT_ID_MISMATCH', severity: 'warning', message: unavailableReason })
  } else if (alignment.status === 'failed' || alignment.status === 'insufficient-data') {
    unavailableReason = 'The alignment does not contain enough trustworthy correspondence for rhythm or tempo analysis.'
    warnings.push({ code: 'ALIGNMENT_UNAVAILABLE', severity: 'warning', message: unavailableReason })
  } else if (noteGrading.status === 'unavailable') {
    unavailableReason = 'The selected note-grading scope is unavailable, so its timing scope cannot be interpreted safely.'
    warnings.push({ code: 'NOTE_GRADING_UNAVAILABLE', severity: 'warning', message: unavailableReason })
  }

  const ids = scopeGroupIds(alignment, scope)
  const correspondences = alignment.groupAlignments.filter((step): step is GroupCorrespondence => step.kind === 'correspondence' && ids.expected.has(step.expectedGroup.id) && ids.performed.has(step.performedGroup.id))
  const rhythm = unavailableReason ? emptyRhythm() : buildRhythm(expectedPlan, alignment, correspondences, noteGrading, options)
  const tempo = unavailableReason ? emptyTempo(expectedPlan, alignment, scope) : buildTempo(expectedPlan, alignment, scope, correspondences, noteGrading, options)
  if (!unavailableReason && rhythm.rhythmScore === null && tempo.tempoScore === null) {
    unavailableReason = 'At least two usable matched onsets are required for timing-interval analysis.'
    warnings.push({ code: 'INSUFFICIENT_TIMING_OBSERVATIONS', severity: 'warning', message: unavailableReason })
  }
  const evidenceCount = Math.max(rhythm.usableObservationCount, rhythm.strongAnchorCount)
  let reliability: TimingAnalysisReliability = unavailableReason ? 'unavailable' : alignment.status === 'ambiguous' || noteGrading.reliability === 'provisional' ? 'provisional' : evidenceCount < 3 ? 'limited' : 'reliable'
  if (!unavailableReason && reliability === 'limited') warnings.push({ code: 'LIMITED_TIMING_EVIDENCE', severity: 'info', message: 'Only one timing interval is available; scores are useful but tempo stability and trend remain limited.' })
  if (!unavailableReason && reliability === 'provisional') warnings.push({ code: 'PROVISIONAL_ALIGNMENT', severity: 'warning', message: 'Timing results are provisional because the underlying correspondence is ambiguous.' })
  for (const diagnostic of rhythm.chordSpreadDiagnostics.filter((item) => item.classification === 'wide')) warnings.push({ code: 'WIDE_CHORD_SPREAD', severity: 'info', message: `A performed onset spans ${diagnostic.spreadMs.toFixed(1)} ms. Chord spread is reported separately and does not reduce the rhythm score.`, groupAlignmentId: correspondences.find((step) => step.expectedGroup.id === diagnostic.expectedGroupId)?.id })
  for (const direction of tempo.directionObservations) warnings.push({ code: 'QUALITATIVE_TEMPO_ONLY', severity: 'info', sourceEventId: direction.sourceEventId, message: `${direction.text} is interpreted as qualitative direction only; no exact BPM curve was invented.` })
  if (unavailableReason) reliability = 'unavailable'
  const status = unavailableReason ? 'unavailable' as const : 'ready' as const
  const result: TimingAnalysisResult = {
    id: `timing-analysis:${stableHash(JSON.stringify({ planId: expectedPlan.id, recordingId: recording.id, alignmentId: alignment.id, noteGradingId: noteGrading.id, version: TIMING_ANALYSIS_ENGINE_VERSION, options }))}`,
    status,
    reliability,
    unavailableReason,
    expectedPlanId: expectedPlan.id,
    recordingId: recording.id,
    alignmentId: alignment.id,
    noteGradingId: noteGrading.id,
    scope,
    rhythm,
    tempo,
    warnings,
    diagnostics: {
      timingAnalysisEngineVersion: TIMING_ANALYSIS_ENGINE_VERSION,
      alignmentEngineVersion: alignment.diagnostics.alignmentEngineVersion,
      correspondenceCount: alignment.diagnostics.groupCorrespondenceCount,
      inScopeCorrespondenceCount: correspondences.length,
      strongAnchorCount: rhythm.strongAnchorCount,
      usableObservationCount: rhythm.usableObservationCount,
      scoredRhythmIntervalCount: rhythm.scoredIntervalCount,
      localTempoSampleCount: tempo.localSamples.length,
      qualitativeDirectionCount: tempo.directionObservations.length,
      wideChordCount: rhythm.chordSpreadDiagnostics.filter((diagnostic) => diagnostic.classification === 'wide').length,
    },
  }
  return deepFreeze(result)
}
