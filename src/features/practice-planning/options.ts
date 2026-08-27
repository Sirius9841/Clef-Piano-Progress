export interface PracticePlanningPolicy {
  readonly latestSessionLimit: number
  readonly attemptsPerSessionLimit: number
  readonly sectionDimensionAttemptsPerSessionLimit: number
  readonly reliableWeight: number
  readonly limitedWeight: number
  readonly recencyHalfLifeDays: number
  readonly persistentWeaknessMinimumSessions: number
  readonly persistentWeaknessMinimumEffectiveSessionSupport: number
  readonly strongEvidenceMinimumSessions: number
  readonly strongEvidenceMinimumEffectiveSessionSupport: number
  readonly meaningfulWeaknessThreshold: number
  readonly severeWeaknessThreshold: number
  readonly progressionMinimumSessions: number
  readonly progressionMinimumEffectiveSessionSupport: number
  readonly progressionControlThresholds: Readonly<{ notes: number; rhythm: number; tempo: number }>
  readonly speedBucketPrecision: number
  readonly speedStep: number
  readonly maximumSuggestedSpeed: number
  readonly minimumSuggestedSpeed: number
  readonly maximumRecommendations: number
  readonly overlapSuppressionRatio: number
  readonly supportedSkillOpportunityThreshold: number
  readonly maximumSessionPlanBlocks: number
  readonly minimumNonRunBlockMinutes: number
}

export type PracticePlanningOptions = PracticePlanningPolicy

/** Product planning heuristics, not universal piano-pedagogy laws. */
export const DEFAULT_PRACTICE_PLANNING_OPTIONS: PracticePlanningPolicy = Object.freeze({
  latestSessionLimit: 8,
  attemptsPerSessionLimit: 3,
  sectionDimensionAttemptsPerSessionLimit: 3,
  reliableWeight: 1,
  limitedWeight: 0.65,
  recencyHalfLifeDays: 45,
  persistentWeaknessMinimumSessions: 2,
  persistentWeaknessMinimumEffectiveSessionSupport: 1.25,
  strongEvidenceMinimumSessions: 3,
  strongEvidenceMinimumEffectiveSessionSupport: 2.25,
  meaningfulWeaknessThreshold: 0.2,
  severeWeaknessThreshold: 0.3,
  progressionMinimumSessions: 2,
  progressionMinimumEffectiveSessionSupport: 1.5,
  progressionControlThresholds: Object.freeze({ notes: 0.9, rhythm: 0.85, tempo: 0.85 }),
  speedBucketPrecision: 100,
  speedStep: 0.05,
  maximumSuggestedSpeed: 1,
  minimumSuggestedSpeed: 0.5,
  maximumRecommendations: 8,
  overlapSuppressionRatio: 0.5,
  supportedSkillOpportunityThreshold: 75,
  maximumSessionPlanBlocks: 4,
  minimumNonRunBlockMinutes: 4,
})

function positiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) throw new RangeError(`${label} must be a positive integer.`)
}

function positive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} must be positive.`)
}

function unit(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new RangeError(`${label} must be between 0 and 1.`)
}

function percentage(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 100) throw new RangeError(`${label} must be between 0 and 100.`)
}

export function resolvePracticePlanningOptions(partial: Partial<PracticePlanningPolicy> = {}): PracticePlanningPolicy {
  const options = { ...DEFAULT_PRACTICE_PLANNING_OPTIONS, ...partial, progressionControlThresholds: { ...DEFAULT_PRACTICE_PLANNING_OPTIONS.progressionControlThresholds, ...partial.progressionControlThresholds } }
  positiveInteger(options.latestSessionLimit, 'Latest session limit')
  positiveInteger(options.attemptsPerSessionLimit, 'Attempts per session limit')
  positiveInteger(options.sectionDimensionAttemptsPerSessionLimit, 'Section attempts per session limit')
  positiveInteger(options.persistentWeaknessMinimumSessions, 'Persistent weakness session minimum')
  positiveInteger(options.strongEvidenceMinimumSessions, 'Strong evidence session minimum')
  positiveInteger(options.progressionMinimumSessions, 'Progression session minimum')
  positiveInteger(options.speedBucketPrecision, 'Speed bucket precision')
  positiveInteger(options.maximumRecommendations, 'Maximum recommendations')
  positiveInteger(options.maximumSessionPlanBlocks, 'Maximum session-plan blocks')
  positiveInteger(options.minimumNonRunBlockMinutes, 'Minimum block minutes')
  positive(options.recencyHalfLifeDays, 'Recency half-life')
  positive(options.persistentWeaknessMinimumEffectiveSessionSupport, 'Persistent weakness session support')
  positive(options.strongEvidenceMinimumEffectiveSessionSupport, 'Strong evidence session support')
  positive(options.progressionMinimumEffectiveSessionSupport, 'Progression session support')
  positive(options.speedStep, 'Speed step')
  for (const key of ['reliableWeight', 'limitedWeight', 'meaningfulWeaknessThreshold', 'severeWeaknessThreshold', 'maximumSuggestedSpeed', 'minimumSuggestedSpeed', 'overlapSuppressionRatio'] as const) unit(options[key], key)
  for (const value of Object.values(options.progressionControlThresholds)) unit(value, 'Progression control threshold')
  percentage(options.supportedSkillOpportunityThreshold, 'Supported Skill opportunity threshold')
  if (options.minimumSuggestedSpeed > options.maximumSuggestedSpeed) throw new RangeError('Minimum suggested speed cannot exceed maximum suggested speed.')
  if (options.severeWeaknessThreshold < options.meaningfulWeaknessThreshold) throw new RangeError('Severe weakness must not be lower than meaningful weakness.')
  return Object.freeze({ ...options, progressionControlThresholds: Object.freeze(options.progressionControlThresholds) })
}
