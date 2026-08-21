export const RESULT_AGGREGATION_VERSION = '1.0.0'

export interface PerformanceResultOptions {
  readonly sectionLengthMeasures: number
  readonly sectionStepMeasures: number
  readonly minimumSectionLengthMeasures: number
  readonly maxWeakSections: number
  readonly maxStrongSections: number
  readonly overlapSuppressionRatio: number
  readonly notePriorityWeight: number
  readonly rhythmPriorityWeight: number
  readonly tempoPriorityWeight: number
  readonly confidencePriorityFloor: number
  readonly highPriorityThreshold: number
  readonly mediumPriorityThreshold: number
  readonly minimumWeaknessForRecommendation: number
  readonly minimumConfidenceForWeakSection: number
  readonly minimumConfidenceForStrongSection: number
  readonly minimumStrongMetric: number
  readonly minimumStrongExpectedTargets: number
  readonly minimumRhythmObservationsForMetric: number
  readonly minimumTempoSamplesForMetric: number
  readonly noteEvidenceSaturation: number
  readonly rhythmEvidenceSaturation: number
  readonly tempoEvidenceSaturation: number
  readonly alignmentEvidenceSaturation: number
  readonly highConfidenceThreshold: number
  readonly mediumConfidenceThreshold: number
  readonly lowConfidenceThreshold: number
  readonly significantRhythmLoss: number
  readonly tempoIssueScoreThreshold: number
}

export const DEFAULT_PERFORMANCE_RESULT_OPTIONS: PerformanceResultOptions = Object.freeze({
  sectionLengthMeasures: 4,
  sectionStepMeasures: 1,
  minimumSectionLengthMeasures: 2,
  maxWeakSections: 3,
  maxStrongSections: 3,
  overlapSuppressionRatio: 0.5,
  notePriorityWeight: 0.45,
  rhythmPriorityWeight: 0.35,
  tempoPriorityWeight: 0.2,
  confidencePriorityFloor: 0.3,
  highPriorityThreshold: 0.42,
  mediumPriorityThreshold: 0.2,
  minimumWeaknessForRecommendation: 0.1,
  minimumConfidenceForWeakSection: 0.25,
  minimumConfidenceForStrongSection: 0.5,
  minimumStrongMetric: 0.86,
  minimumStrongExpectedTargets: 4,
  minimumRhythmObservationsForMetric: 2,
  minimumTempoSamplesForMetric: 2,
  noteEvidenceSaturation: 8,
  rhythmEvidenceSaturation: 6,
  tempoEvidenceSaturation: 4,
  alignmentEvidenceSaturation: 6,
  highConfidenceThreshold: 0.75,
  mediumConfidenceThreshold: 0.5,
  lowConfidenceThreshold: 0.25,
  significantRhythmLoss: 0.18,
  tempoIssueScoreThreshold: 0.72,
})

function positiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) throw new RangeError(`${label} must be a positive integer.`)
}

function unitInterval(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new RangeError(`${label} must be between 0 and 1.`)
}

export function resolvePerformanceResultOptions(options: Partial<PerformanceResultOptions> = {}): PerformanceResultOptions {
  const resolved = { ...DEFAULT_PERFORMANCE_RESULT_OPTIONS, ...options }
  positiveInteger(resolved.sectionLengthMeasures, 'Section length')
  positiveInteger(resolved.sectionStepMeasures, 'Section step')
  positiveInteger(resolved.minimumSectionLengthMeasures, 'Minimum section length')
  positiveInteger(resolved.maxWeakSections, 'Maximum weak sections')
  positiveInteger(resolved.maxStrongSections, 'Maximum strong sections')
  ;['overlapSuppressionRatio', 'confidencePriorityFloor', 'highPriorityThreshold', 'mediumPriorityThreshold', 'minimumWeaknessForRecommendation', 'minimumConfidenceForWeakSection', 'minimumConfidenceForStrongSection', 'minimumStrongMetric', 'highConfidenceThreshold', 'mediumConfidenceThreshold', 'lowConfidenceThreshold', 'significantRhythmLoss', 'tempoIssueScoreThreshold'].forEach((key) => unitInterval(resolved[key as keyof PerformanceResultOptions] as number, key))
  ;['noteEvidenceSaturation', 'rhythmEvidenceSaturation', 'tempoEvidenceSaturation', 'alignmentEvidenceSaturation'].forEach((key) => {
    const value = resolved[key as keyof PerformanceResultOptions] as number
    if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${key} must be positive.`)
  })
  positiveInteger(resolved.minimumStrongExpectedTargets, 'Minimum strong expected targets')
  positiveInteger(resolved.minimumRhythmObservationsForMetric, 'Minimum rhythm observations')
  positiveInteger(resolved.minimumTempoSamplesForMetric, 'Minimum tempo samples')
  const totalWeight = resolved.notePriorityWeight + resolved.rhythmPriorityWeight + resolved.tempoPriorityWeight
  if (![resolved.notePriorityWeight, resolved.rhythmPriorityWeight, resolved.tempoPriorityWeight, totalWeight].every((value) => Number.isFinite(value) && value > 0)) throw new RangeError('Practice-priority weights must be positive finite numbers.')
  if (resolved.minimumSectionLengthMeasures > resolved.sectionLengthMeasures) throw new RangeError('Minimum section length cannot exceed the default section length.')
  if (resolved.highPriorityThreshold < resolved.mediumPriorityThreshold) throw new RangeError('High-priority threshold cannot be lower than medium priority.')
  if (!(resolved.highConfidenceThreshold >= resolved.mediumConfidenceThreshold && resolved.mediumConfidenceThreshold >= resolved.lowConfidenceThreshold)) throw new RangeError('Confidence thresholds must be ordered high to low.')
  return Object.freeze(resolved)
}
