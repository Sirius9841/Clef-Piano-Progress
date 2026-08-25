export const VOICING_ANALYSIS_ENGINE_VERSION = 'voicing-analysis-1.0.0'

export interface VoicingAnalysisOptions {
  readonly poorAdvantage: number
  readonly clearAdvantage: number
  readonly reliableMinimumTargets: number
  readonly reliableMinimumCoverage: number
}

export const DEFAULT_VOICING_ANALYSIS_OPTIONS: VoicingAnalysisOptions = Object.freeze({
  poorAdvantage: -0.08,
  clearAdvantage: 0.08,
  reliableMinimumTargets: 3,
  reliableMinimumCoverage: 0.7,
})

export function resolveVoicingAnalysisOptions(partial: Partial<VoicingAnalysisOptions> = {}): VoicingAnalysisOptions {
  const options = { ...DEFAULT_VOICING_ANALYSIS_OPTIONS, ...partial }
  if (!Number.isFinite(options.poorAdvantage) || !Number.isFinite(options.clearAdvantage) || options.poorAdvantage >= 0 || options.clearAdvantage <= 0) throw new RangeError('Voicing advantage thresholds must straddle zero.')
  if (!Number.isInteger(options.reliableMinimumTargets) || options.reliableMinimumTargets < 1) throw new RangeError('Voicing reliable target count must be positive.')
  if (!Number.isFinite(options.reliableMinimumCoverage) || options.reliableMinimumCoverage < 0 || options.reliableMinimumCoverage > 1) throw new RangeError('Voicing reliable coverage must be between zero and one.')
  return Object.freeze(options)
}
