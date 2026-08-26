import type { TechniqueFacetId, TechniqueModuleId } from '../technique/types'

export const SKILL_MODEL_VERSION = 'skill-model-1.0.0'

export type SkillConfidence = 'unestablished' | 'low' | 'medium' | 'high'

export type SkillEvidenceExclusionCode =
  | 'legacy-engine'
  | 'wrong-module'
  | 'repeat-sight-reading'
  | 'missing-required-facet'
  | 'provisional-facet'
  | 'insufficient-coverage'
  | 'future-dated'
  | 'invalid-summary'

export interface SkillEvidenceExclusion {
  readonly attemptId: string
  readonly code: SkillEvidenceExclusionCode
  readonly detail: string
}

export interface TechniqueSkillEvidence {
  readonly attemptId: string
  readonly exerciseInstanceId: string
  readonly moduleId: TechniqueModuleId
  readonly performedAt: string
  readonly contextId: string
  readonly quality: number
  readonly reliability: 'reliable' | 'limited'
  readonly coverage: number
  readonly facetIds: readonly TechniqueFacetId[]
}

export interface SkillContextRating {
  readonly contextId: string
  readonly qualityEstimate: number
  readonly attemptCount: number
  readonly evidenceAttemptIds: readonly string[]
  readonly lastMeasuredAt: string
  readonly averageCoverage: number
  readonly reliableAttemptFraction: number
}

export interface SkillChallengeEnvelope {
  readonly attemptCount: number
  readonly distinctChallengeContexts: number
  readonly targetTempoBpm: Readonly<{ minimum: number; maximum: number }> | null
  readonly declaredHandContexts: readonly ('left' | 'right' | 'both')[]
  readonly lastMeasuredAt: string | null
  readonly tonics: readonly number[]
  readonly modes: readonly ('major' | 'natural-minor')[]
  readonly octaveSpans: readonly number[]
  readonly directions: readonly ('ascending' | 'descending' | 'both')[]
  readonly chordInversions: readonly number[]
  readonly jumpDistancesSemitones: readonly number[]
  readonly maximumJumpDistanceSemitones: number | null
  readonly tempoShapes: readonly ('steady' | 'accelerate' | 'decelerate' | 'arch')[]
  readonly subdivisions: readonly number[]
  readonly distinctFirstPassExerciseInstances: number
}

export interface SkillRating {
  readonly moduleId: TechniqueModuleId
  readonly modelVersion: typeof SKILL_MODEL_VERSION
  readonly asOf: string
  readonly status: 'unestablished' | 'established'
  readonly qualityEstimate: number | null
  readonly confidence: SkillConfidence
  readonly consistency: number | null
  readonly eligibleAttemptCount: number
  readonly eligibleContextCount: number
  readonly lastMeasuredAt: string | null
  readonly challengeEnvelope: SkillChallengeEnvelope
  readonly contextRatings: readonly SkillContextRating[]
  readonly evidenceAttemptIds: readonly string[]
  readonly exclusions: readonly SkillEvidenceExclusion[]
}
