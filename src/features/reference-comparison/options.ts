export const REFERENCE_COMPARISON_ENGINE_VERSION = 'reference-comparison-1.0.0'

export interface ReferenceComparisonOptions {
  readonly similarLogTempoDifference: number
  readonly noticeableLogTempoDifference: number
  readonly similarNormalizedDifference: number
  readonly noticeableNormalizedDifference: number
  readonly reliableMinimumSharedObservations: number
  readonly reliableMinimumCoverage: number
}

export const DEFAULT_REFERENCE_COMPARISON_OPTIONS: ReferenceComparisonOptions = Object.freeze({
  similarLogTempoDifference: 0.04,
  noticeableLogTempoDifference: 0.12,
  similarNormalizedDifference: 0.05,
  noticeableNormalizedDifference: 0.15,
  reliableMinimumSharedObservations: 3,
  reliableMinimumCoverage: 0.65,
})

export function resolveReferenceComparisonOptions(partial: Partial<ReferenceComparisonOptions> = {}): ReferenceComparisonOptions {
  const options = { ...DEFAULT_REFERENCE_COMPARISON_OPTIONS, ...partial }
  Object.values(options).forEach((value) => { if (!Number.isFinite(value) || value < 0) throw new RangeError('Reference comparison options must be non-negative and finite.') })
  if (!Number.isInteger(options.reliableMinimumSharedObservations) || options.reliableMinimumSharedObservations < 1) throw new RangeError('Reference comparison minimum observations must be positive.')
  if (options.reliableMinimumCoverage > 1) throw new RangeError('Reference comparison coverage cannot exceed one.')
  return Object.freeze(options)
}
