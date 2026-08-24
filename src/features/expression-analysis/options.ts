export const EXPRESSION_ANALYSIS_ENGINE_VERSION = 'expression-analysis-1.0.0'

export interface ExpressionAnalysisOptions {
  readonly velocityLowQuantile: number
  readonly velocityHighQuantile: number
  readonly minimumVelocitySamples: number
  readonly minimumUniqueVelocities: number
  readonly minimumRobustVelocityRange: number
  readonly dynamicContextNotes: number
  readonly minimumDynamicWindowNotes: number
  readonly minimumWedgeNotes: number
  readonly minimumAccentBaselineNotes: number
  readonly staccatoStrongGateRatio: number
  readonly staccatoPoorGateRatio: number
  readonly staccatissimoStrongGateRatio: number
  readonly staccatissimoPoorGateRatio: number
  readonly tenutoMinimumGateRatio: number
  readonly tenutoLowPoorGateRatio: number
  readonly tenutoMaximumStrongGateRatio: number
  readonly tenutoHighPoorGateRatio: number
  readonly legatoMinimumToleranceMs: number
  readonly legatoRelativeTolerance: number
  readonly reliableMinimumTargets: number
  readonly reliableMinimumCoverage: number
}

export const DEFAULT_EXPRESSION_ANALYSIS_OPTIONS: ExpressionAnalysisOptions = Object.freeze({
  velocityLowQuantile: 0.1,
  velocityHighQuantile: 0.9,
  minimumVelocitySamples: 6,
  minimumUniqueVelocities: 4,
  minimumRobustVelocityRange: 8,
  dynamicContextNotes: 4,
  minimumDynamicWindowNotes: 2,
  minimumWedgeNotes: 4,
  minimumAccentBaselineNotes: 3,
  staccatoStrongGateRatio: 0.65,
  staccatoPoorGateRatio: 1.05,
  staccatissimoStrongGateRatio: 0.45,
  staccatissimoPoorGateRatio: 0.85,
  tenutoMinimumGateRatio: 0.85,
  tenutoLowPoorGateRatio: 0.45,
  tenutoMaximumStrongGateRatio: 1.2,
  tenutoHighPoorGateRatio: 1.8,
  legatoMinimumToleranceMs: 35,
  legatoRelativeTolerance: 0.05,
  reliableMinimumTargets: 3,
  reliableMinimumCoverage: 0.7,
})

export function resolveExpressionAnalysisOptions(partial: Partial<ExpressionAnalysisOptions> = {}): ExpressionAnalysisOptions {
  const options = { ...DEFAULT_EXPRESSION_ANALYSIS_OPTIONS, ...partial }
  for (const [key, value] of Object.entries(options)) {
    if (!Number.isFinite(value) || value < 0) throw new RangeError(`${key} must be a non-negative finite number.`)
  }
  if (options.velocityLowQuantile >= options.velocityHighQuantile || options.velocityHighQuantile > 1) throw new RangeError('Velocity quantiles must be ordered within 0–1.')
  for (const key of ['minimumVelocitySamples', 'minimumUniqueVelocities', 'dynamicContextNotes', 'minimumDynamicWindowNotes', 'minimumWedgeNotes', 'minimumAccentBaselineNotes', 'reliableMinimumTargets'] as const) {
    if (!Number.isInteger(options[key]) || options[key] < 1) throw new RangeError(`${key} must be a positive integer.`)
  }
  if (options.reliableMinimumCoverage > 1) throw new RangeError('Reliable minimum coverage cannot exceed 1.')
  return Object.freeze(options)
}
