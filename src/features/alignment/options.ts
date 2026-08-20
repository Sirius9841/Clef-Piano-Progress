export const ALIGNMENT_ENGINE_VERSION = '1.0.0'

export interface AlignmentOptions {
  readonly performedGroupGapMs: number
  readonly performedGroupMaxSpreadMs: number
  readonly performedGroupWarningSpreadMs: number
  readonly expectedSkipCost: number
  readonly performedSkipCost: number
  readonly unpairedExpectedPitchCost: number
  readonly unpairedPerformedPitchCost: number
  readonly pitchCostWeight: number
  readonly timingCostWeight: number
  readonly timingResidualScaleMs: number
  readonly timeFitOutlierThresholdMs: number
  readonly minTimeScale: number
  readonly maxTimeScale: number
  readonly maxTimeFitAnchors: number
  readonly maxMatrixCells: number
  readonly practiceSpeedMultiplier: number | null
}

export const DEFAULT_ALIGNMENT_OPTIONS: AlignmentOptions = Object.freeze({
  performedGroupGapMs: 45,
  performedGroupMaxSpreadMs: 90,
  performedGroupWarningSpreadMs: 75,
  expectedSkipCost: 1.25,
  performedSkipCost: 1.25,
  unpairedExpectedPitchCost: 1,
  unpairedPerformedPitchCost: 0.9,
  pitchCostWeight: 1,
  timingCostWeight: 0.35,
  timingResidualScaleMs: 180,
  timeFitOutlierThresholdMs: 250,
  minTimeScale: 0.35,
  maxTimeScale: 3,
  maxTimeFitAnchors: 256,
  maxMatrixCells: 4_000_000,
  practiceSpeedMultiplier: null,
})

export function resolveAlignmentOptions(options: Partial<AlignmentOptions> = {}): AlignmentOptions {
  const resolved = { ...DEFAULT_ALIGNMENT_OPTIONS, ...options }
  const positiveFields: Array<keyof AlignmentOptions> = [
    'performedGroupGapMs', 'performedGroupMaxSpreadMs', 'performedGroupWarningSpreadMs',
    'expectedSkipCost', 'performedSkipCost', 'unpairedExpectedPitchCost', 'unpairedPerformedPitchCost',
    'pitchCostWeight', 'timingResidualScaleMs', 'timeFitOutlierThresholdMs', 'minTimeScale', 'maxTimeScale',
    'maxTimeFitAnchors', 'maxMatrixCells',
  ]
  for (const field of positiveFields) {
    const value = resolved[field]
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw new RangeError(`${field} must be a positive finite number.`)
  }
  if (!Number.isFinite(resolved.timingCostWeight) || resolved.timingCostWeight < 0) throw new RangeError('timingCostWeight must be a non-negative finite number.')
  if (resolved.minTimeScale >= resolved.maxTimeScale) throw new RangeError('minTimeScale must be less than maxTimeScale.')
  if (!Number.isInteger(resolved.maxTimeFitAnchors) || !Number.isInteger(resolved.maxMatrixCells)) throw new RangeError('Alignment limits must be integers.')
  if (resolved.performedGroupWarningSpreadMs > resolved.performedGroupMaxSpreadMs) throw new RangeError('Performed-group warning spread cannot exceed maximum spread.')
  if (resolved.practiceSpeedMultiplier !== null && (!Number.isFinite(resolved.practiceSpeedMultiplier) || resolved.practiceSpeedMultiplier <= 0)) throw new RangeError('Practice speed must be a positive finite number.')
  return Object.freeze(resolved)
}
