import type { ScoreRegionLocalizationHint } from './types'

export const ALIGNMENT_ENGINE_VERSION = '2.0.1'

export function scoreRegionLocalizationHintKey(hint: ScoreRegionLocalizationHint): string {
  if (hint.mode === 'auto' || hint.mode === 'beginning') return JSON.stringify([hint.mode])
  if (hint.mode === 'confirmed') return JSON.stringify([hint.mode, hint.expectedStartIndex, hint.expectedEndIndex])
  return JSON.stringify([hint.mode, hint.scoreVersionId, hint.startMeasureIndex, hint.endMeasureIndex, [...hint.sourceMeasureIds].sort()])
}

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
  readonly localizationHint: ScoreRegionLocalizationHint
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
  localizationHint: Object.freeze({ mode: 'auto' }),
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
  const hint = resolved.localizationHint
  if (hint.mode === 'section') {
    if (!Number.isInteger(hint.startMeasureIndex) || !Number.isInteger(hint.endMeasureIndex) || hint.startMeasureIndex < 0 || hint.endMeasureIndex < hint.startMeasureIndex || !hint.scoreVersionId || !Array.isArray(hint.sourceMeasureIds)) throw new RangeError('Section localization hints require a valid exact PlanningSectionIdentity.')
  } else if (hint.mode === 'confirmed') {
    if (!Number.isInteger(hint.expectedStartIndex) || !Number.isInteger(hint.expectedEndIndex) || hint.expectedStartIndex < 0 || hint.expectedEndIndex < hint.expectedStartIndex) throw new RangeError('Confirmed localization bounds must be ordered non-negative group indexes.')
  } else if (hint.mode !== 'auto' && hint.mode !== 'beginning') throw new RangeError('Unsupported score-region localization hint.')
  const localizationHint = hint.mode === 'section'
    ? Object.freeze({ ...hint, sourceMeasureIds: Object.freeze([...hint.sourceMeasureIds]) })
    : Object.freeze({ ...hint })
  return Object.freeze({ ...resolved, localizationHint })
}
