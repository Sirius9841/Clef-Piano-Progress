import { compareTime, musicalTime, ZERO_TIME, type MusicalTime } from '../musicxml/musicalTime'

export const TIMING_ANALYSIS_ENGINE_VERSION = '1.1.0'

export interface TimingAnalysisOptions {
  readonly minimumTimingToleranceMs: number
  readonly relativeBeatTolerance: number
  readonly relativeIntervalTolerance: number
  readonly rhythmLossScale: number
  readonly rhythmTrimFraction: number
  readonly strongAnchorMaximumPitchCost: number
  readonly usableAnchorMaximumPitchCost: number
  readonly strongAnchorMaximumSpreadMs: number
  readonly usableAnchorMaximumSpreadMs: number
  readonly tightChordMaximumSpreadMs: number
  readonly wideChordMinimumSpreadMs: number
  readonly localTempoWindowBeats: MusicalTime
  readonly minimumTempoWindowAnchors: number
  readonly tempoToleranceRatio: number
  readonly tempoAccuracyFalloffRatio: number
  readonly tempoStabilityToleranceRatio: number
  readonly tempoStabilityFalloffRatio: number
  readonly targetAccuracyWeight: number
  readonly stabilityWeight: number
  readonly trendThresholdRatio: number
  readonly minimumTrendSamples: number
  readonly minimumDirectionSamples: number
  readonly aTempoReturnToleranceRatio: number
}

export const DEFAULT_TIMING_ANALYSIS_OPTIONS: TimingAnalysisOptions = Object.freeze({
  minimumTimingToleranceMs: 22,
  relativeBeatTolerance: 0.04,
  relativeIntervalTolerance: 0.035,
  rhythmLossScale: 1.25,
  rhythmTrimFraction: 0.1,
  strongAnchorMaximumPitchCost: 2.5,
  usableAnchorMaximumPitchCost: 4,
  strongAnchorMaximumSpreadMs: 90,
  usableAnchorMaximumSpreadMs: 250,
  tightChordMaximumSpreadMs: 30,
  wideChordMinimumSpreadMs: 75,
  localTempoWindowBeats: musicalTime(1),
  minimumTempoWindowAnchors: 2,
  tempoToleranceRatio: 0.03,
  tempoAccuracyFalloffRatio: 0.18,
  tempoStabilityToleranceRatio: 0.035,
  tempoStabilityFalloffRatio: 0.15,
  targetAccuracyWeight: 0.6,
  stabilityWeight: 0.4,
  trendThresholdRatio: 0.06,
  minimumTrendSamples: 4,
  minimumDirectionSamples: 3,
  aTempoReturnToleranceRatio: 0.08,
})

function positiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} must be a positive finite number.`)
}

function nonNegativeFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${label} must be a non-negative finite number.`)
}

export function resolveTimingAnalysisOptions(options: Partial<TimingAnalysisOptions> = {}): TimingAnalysisOptions {
  const resolved = { ...DEFAULT_TIMING_ANALYSIS_OPTIONS, ...options }
  positiveFinite(resolved.minimumTimingToleranceMs, 'Minimum timing tolerance')
  positiveFinite(resolved.rhythmLossScale, 'Rhythm loss scale')
  positiveFinite(resolved.strongAnchorMaximumSpreadMs, 'Strong-anchor spread limit')
  positiveFinite(resolved.usableAnchorMaximumSpreadMs, 'Usable-anchor spread limit')
  positiveFinite(resolved.wideChordMinimumSpreadMs, 'Wide-chord spread threshold')
  positiveFinite(resolved.tempoAccuracyFalloffRatio, 'Tempo accuracy falloff')
  positiveFinite(resolved.tempoStabilityFalloffRatio, 'Tempo stability falloff')
  ;['relativeBeatTolerance', 'relativeIntervalTolerance', 'strongAnchorMaximumPitchCost', 'usableAnchorMaximumPitchCost', 'tightChordMaximumSpreadMs', 'tempoToleranceRatio', 'tempoStabilityToleranceRatio', 'trendThresholdRatio', 'aTempoReturnToleranceRatio'].forEach((key) => nonNegativeFinite(resolved[key as keyof TimingAnalysisOptions] as number, key))
  if (resolved.rhythmTrimFraction < 0 || resolved.rhythmTrimFraction >= 0.5) throw new RangeError('Rhythm trim fraction must be from 0 up to, but not including, 0.5.')
  if (resolved.strongAnchorMaximumSpreadMs > resolved.usableAnchorMaximumSpreadMs) throw new RangeError('Strong-anchor spread limit cannot exceed the usable-anchor limit.')
  if (resolved.tightChordMaximumSpreadMs > resolved.wideChordMinimumSpreadMs) throw new RangeError('Tight-chord threshold cannot exceed the wide-chord threshold.')
  if (compareTime(resolved.localTempoWindowBeats, ZERO_TIME) <= 0) throw new RangeError('Local tempo window must be a positive MusicalTime.')
  if (!Number.isInteger(resolved.minimumTempoWindowAnchors) || resolved.minimumTempoWindowAnchors < 2) throw new RangeError('Minimum tempo-window anchors must be an integer of at least 2.')
  if (!Number.isInteger(resolved.minimumTrendSamples) || resolved.minimumTrendSamples < 2) throw new RangeError('Minimum trend samples must be an integer of at least 2.')
  if (!Number.isInteger(resolved.minimumDirectionSamples) || resolved.minimumDirectionSamples < 2) throw new RangeError('Minimum direction samples must be an integer of at least 2.')
  positiveFinite(resolved.targetAccuracyWeight + resolved.stabilityWeight, 'Combined tempo component weight')
  return Object.freeze({ ...resolved, localTempoWindowBeats: musicalTime(resolved.localTempoWindowBeats.numerator, resolved.localTempoWindowBeats.denominator) })
}
