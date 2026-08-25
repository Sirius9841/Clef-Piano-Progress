export const PEDAL_ANALYSIS_ENGINE_VERSION = 'pedal-analysis-1.1.0'

export interface PedalAnalysisOptions {
  readonly timingToleranceQuarterFraction: number
  readonly minimumTimingToleranceMs: number
  readonly earlyStartPoorMultiplier: number
  readonly lateStartPoorMultiplier: number
  readonly stopPoorMultiplier: number
  readonly changeGapStrongQuarterFraction: number
  readonly minimumChangeGapStrongMs: number
  readonly changeGapPoorMs: number
  readonly recordingBoundaryToleranceMs: number
  readonly initialStartToleranceMs: number
  readonly reliableMinimumPhrases: number
  readonly reliableMinimumCoverage: number
  readonly reliableKnownStateCoverage: number
  readonly localAnchorMaximumScoreDistanceQuarters: number
  readonly localAnchorMaximumPerformedSpreadMs: number
  readonly reliableMinimumLocalAnchorCoverage: number
  readonly associationWindowQuarterMultiplier: number
  readonly minimumAssociationWindowMs: number
  readonly missingEventCost: number
  readonly extraTransitionCost: number
}

export const DEFAULT_PEDAL_ANALYSIS_OPTIONS: PedalAnalysisOptions = Object.freeze({
  timingToleranceQuarterFraction: 0.15,
  minimumTimingToleranceMs: 100,
  earlyStartPoorMultiplier: 3,
  lateStartPoorMultiplier: 4,
  stopPoorMultiplier: 3.5,
  changeGapStrongQuarterFraction: 0.2,
  minimumChangeGapStrongMs: 100,
  changeGapPoorMs: 650,
  recordingBoundaryToleranceMs: 180,
  initialStartToleranceMs: 180,
  reliableMinimumPhrases: 3,
  reliableMinimumCoverage: 0.7,
  reliableKnownStateCoverage: 0.8,
  localAnchorMaximumScoreDistanceQuarters: 2,
  localAnchorMaximumPerformedSpreadMs: 90,
  reliableMinimumLocalAnchorCoverage: 0.5,
  associationWindowQuarterMultiplier: 1.25,
  minimumAssociationWindowMs: 450,
  missingEventCost: 1,
  extraTransitionCost: 0.2,
})

export function resolvePedalAnalysisOptions(partial: Partial<PedalAnalysisOptions> = {}): PedalAnalysisOptions {
  const options = { ...DEFAULT_PEDAL_ANALYSIS_OPTIONS, ...partial }
  for (const [key, value] of Object.entries(options)) {
    if (!Number.isFinite(value) || value < 0) throw new RangeError(`${key} must be a non-negative finite number.`)
  }
  if (!Number.isInteger(options.reliableMinimumPhrases) || options.reliableMinimumPhrases < 1) throw new RangeError('Reliable minimum phrases must be a positive integer.')
  for (const key of ['timingToleranceQuarterFraction', 'reliableMinimumCoverage', 'reliableKnownStateCoverage', 'reliableMinimumLocalAnchorCoverage'] as const) {
    if (options[key] > 1) throw new RangeError(`${key} cannot exceed 1.`)
  }
  return Object.freeze(options)
}
