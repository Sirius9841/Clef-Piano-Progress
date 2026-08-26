export const MASTERY_MODEL_VERSION = 'mastery-model-1.0.0'

export type MasteryConfidence = 'unestablished' | 'low' | 'medium' | 'high'
export type MasteryEvidenceExclusionCode = 'different-score-version' | 'partial-scope' | 'provisional' | 'missing-metric' | 'future-dated' | 'wrong-arrangement' | 'invalid-summary'

export interface MasteryEvidenceExclusion {
  readonly attemptId: string
  readonly code: MasteryEvidenceExclusionCode
  readonly detail: string
}

export interface MasteryMinimumDimension {
  readonly metric: 'notes' | 'rhythm' | 'tempo'
  readonly value: number
}

export interface ArrangementMastery {
  readonly arrangementId: string
  readonly scoreVersionId: string
  readonly modelVersion: typeof MASTERY_MODEL_VERSION
  readonly asOf: string
  readonly status: 'unestablished' | 'ready'
  readonly mastery: number | null
  readonly confidence: MasteryConfidence
  readonly control: number | null
  readonly minimumDimension: MasteryMinimumDimension | null
  readonly demonstratedSpeedMultiplier: number | null
  readonly demonstratedSpeedSessionCount: number
  readonly consistency: number | null
  readonly recencyFactor: number | null
  readonly eligibleAttemptCount: number
  readonly distinctSessionCount: number
  readonly lastEvidenceAt: string | null
  readonly evidenceAttemptIds: readonly string[]
  readonly exclusions: readonly MasteryEvidenceExclusion[]
}
