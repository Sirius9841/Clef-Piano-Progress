import type { ArrangementMastery } from '../mastery-model'
import type { AttemptSummary, TechniqueAttemptSummary } from '../persistence/types'
import type { PerformanceResultsReliability, ResultConfidenceCategory, ResultDimension } from '../performance-results/types'
import type { SkillRating } from '../skill-model'
import type { TechniqueModuleId } from '../technique/types'

export const PRACTICE_PLANNING_MODEL_VERSION = 'practice-planning-1.0.0'

export type PlanningDimension = ResultDimension
export type PlanningEvidenceStrength = 'insufficient' | 'single-session' | 'tentative' | 'supported' | 'strong'
export type PlanningTrend = 'insufficient'

export type PracticePlanningExclusionCode =
  | 'arrangement-not-found'
  | 'score-version-not-found'
  | 'score-version-arrangement-mismatch'
  | 'wrong-arrangement'
  | 'different-score-version'
  | 'future-dated-evidence'
  | 'invalid-summary'
  | 'provisional-or-unavailable-attempt'
  | 'outside-bounded-history'
  | 'missing-full-attempt'
  | 'full-attempt-read-failed'
  | 'summary-full-attempt-identity-mismatch'
  | 'unsupported-result-aggregation-version'
  | 'incompatible-performance-results'
  | 'malformed-section-topology'
  | 'malformed-section-evidence'
  | 'section-outside-attempted-scope'
  | 'insufficient-section-evidence'

export interface PracticePlanningExclusion {
  readonly code: PracticePlanningExclusionCode
  readonly detail: string
  readonly attemptId: string | null
  readonly sectionResultId: string | null
}

export interface PlanningSectionIdentity {
  readonly id: string
  readonly scoreVersionId: string
  readonly startMeasureIndex: number
  readonly endMeasureIndex: number
  readonly sourceMeasureIds: readonly string[]
  readonly displayRange: string
}

export interface FrozenSectionEvidenceProvenance {
  readonly performanceResultsId: string
  readonly sectionResultId: string
  readonly measureResultIds: readonly string[]
  readonly sourceMeasureIds: readonly string[]
  readonly confidenceCategory: ResultConfidenceCategory
  readonly confidenceWeight: number
  readonly noteResultIds: readonly string[]
  readonly rhythmObservationIds: readonly string[]
  readonly tempoSampleIds: readonly string[]
}

export interface PlanningSectionObservation {
  readonly attemptId: string
  readonly practiceSessionId: string
  readonly performedAt: string
  readonly practiceSpeedMultiplier: number
  readonly reliability: Extract<PerformanceResultsReliability, 'reliable' | 'limited'>
  readonly sectionConfidenceWeight: number
  readonly sectionConfidenceCategory: ResultConfidenceCategory
  readonly section: PlanningSectionIdentity
  readonly notes: number | null
  readonly rhythm: number | null
  readonly tempo: number | null
  readonly provenance: FrozenSectionEvidenceProvenance
}

export interface PlanningAttemptEvidence {
  readonly attemptId: string
  readonly arrangementId: string
  readonly scoreVersionId: string
  readonly practiceSessionId: string
  readonly performedAt: string
  readonly practiceSpeedMultiplier: number
  readonly gradingScope: 'aligned-span' | 'full-plan'
  readonly reliability: Extract<PerformanceResultsReliability, 'reliable' | 'limited'>
  readonly durationMs: number
  readonly sectionObservations: readonly PlanningSectionObservation[]
}

export interface SectionDimensionSpeedHistory {
  readonly practiceSpeedMultiplier: number
  readonly qualityEstimate: number | null
  readonly weaknessEstimate: number | null
  readonly rawAttemptCount: number
  readonly rawSessionCount: number
  readonly effectiveAttemptSupport: number
  readonly effectiveSessionSupport: number
  readonly latestValue: number | null
  readonly lastMeasuredAt: string | null
  readonly evidenceStrength: PlanningEvidenceStrength
  readonly trend: PlanningTrend
  readonly evidenceAttemptIds: readonly string[]
  readonly evidenceSessionIds: readonly string[]
}

export interface SectionDimensionHistory {
  readonly dimension: PlanningDimension
  readonly qualityEstimate: number | null
  readonly weaknessEstimate: number | null
  readonly rawAttemptCount: number
  readonly rawSessionCount: number
  readonly effectiveAttemptSupport: number
  readonly effectiveSessionSupport: number
  readonly latestValue: number | null
  readonly lastMeasuredAt: string | null
  readonly evidenceStrength: PlanningEvidenceStrength
  readonly trend: PlanningTrend
  readonly evidenceAttemptIds: readonly string[]
  readonly evidenceSessionIds: readonly string[]
  readonly speedContexts: readonly SectionDimensionSpeedHistory[]
}

export interface SectionHistory {
  readonly section: PlanningSectionIdentity
  readonly dimensions: readonly SectionDimensionHistory[]
  readonly observationCount: number
  readonly evidenceAttemptIds: readonly string[]
  readonly evidenceSessionIds: readonly string[]
  readonly lastMeasuredAt: string
}

export type PracticeRecommendationKind =
  | 'focus-section'
  | 'verify-section'
  | 'increase-speed'
  | 'hold-speed'
  | 'reduce-speed'
  | 'widen-scope'
  | 'full-run'
  | 'technique-drill'
  | 'refresh-technique-evidence'

export type PracticeRecommendationReasonCode =
  | 'single-session-section-weakness'
  | 'supported-section-weakness'
  | 'strong-section-control-at-speed'
  | 'supported-section-weakness-at-speed'
  | 'mastery-needs-repetition'
  | 'mastery-needs-current-support'
  | 'supported-technique-opportunity'
  | 'technique-evidence-needs-refresh'

export interface PracticeRecommendationReason {
  readonly code: PracticeRecommendationReasonCode
  readonly dimension: PlanningDimension | null
  readonly observedValue: number | null
  readonly weakness: number | null
  readonly rawSessionCount: number | null
  readonly effectiveSessionSupport: number | null
  readonly lastEvidenceAt: string | null
  readonly masteryStatus: ArrangementMastery['demonstratedSpeedStatus'] | null
  readonly skillModuleId: TechniqueModuleId | null
  readonly skillConfidence: SkillRating['confidence'] | null
  readonly evidenceAttemptIds: readonly string[]
  readonly evidenceSessionIds: readonly string[]
}

export type PracticeRecommendationTarget =
  | Readonly<{ type: 'section'; section: PlanningSectionIdentity }>
  | Readonly<{ type: 'arrangement'; arrangementId: string; scoreVersionId: string }>
  | Readonly<{ type: 'technique'; moduleId: TechniqueModuleId; requiresNewStimulus: boolean }>

export interface PracticeRecommendation {
  readonly id: string
  readonly rank: number
  readonly kind: PracticeRecommendationKind
  readonly target: PracticeRecommendationTarget
  readonly suggestedPracticeSpeedMultiplier: number | null
  readonly evidenceStrength: PlanningEvidenceStrength
  readonly reasons: readonly PracticeRecommendationReason[]
  readonly evidenceAttemptIds: readonly string[]
  readonly evidenceSessionIds: readonly string[]
  readonly lastEvidenceAt: string | null
}

export interface FullRunDurationEvidence {
  readonly estimatedMinutes: number | null
  readonly practiceSpeedMultiplier: number | null
  readonly evidenceAttemptIds: readonly string[]
  readonly lastMeasuredAt: string | null
}

export type PracticeSessionBlockKind = 'technique-target' | 'primary-section' | 'secondary-section' | 'wider-context' | 'full-run'

export interface PracticeSessionPlanBlock {
  readonly order: number
  readonly kind: PracticeSessionBlockKind
  readonly suggestedMinutes: number
  readonly recommendationId: string
  readonly target: PracticeRecommendationTarget
}

export interface PracticeSessionPlan {
  readonly availableMinutes: number
  readonly totalSuggestedMinutes: number
  readonly blocks: readonly PracticeSessionPlanBlock[]
  readonly heuristic: 'product-heuristic-not-universal-pedagogy'
}

export interface PracticePlanningDiagnostics {
  readonly summaryCount: number
  readonly selectedSessionCount: number
  readonly selectedSummaryCount: number
  readonly fullAttemptReadCount: number
  readonly acceptedAttemptCount: number
  readonly acceptedSectionObservationCount: number
  readonly selectedSummaryIds: readonly string[]
  readonly loadedAttemptIds: readonly string[]
}

export interface PracticePlanningContext {
  readonly modelVersion: typeof PRACTICE_PLANNING_MODEL_VERSION
  readonly arrangementId: string
  readonly scoreVersionId: string
  readonly asOf: string
  readonly attempts: readonly PlanningAttemptEvidence[]
  readonly attemptSummaries: readonly AttemptSummary[]
  readonly techniqueSummaries: readonly TechniqueAttemptSummary[]
  readonly mastery: ArrangementMastery
  readonly skills: readonly SkillRating[]
  readonly fullRunDuration: FullRunDurationEvidence
  readonly exclusions: readonly PracticePlanningExclusion[]
  readonly diagnostics: PracticePlanningDiagnostics
}

export interface PracticePlanningResult {
  readonly modelVersion: typeof PRACTICE_PLANNING_MODEL_VERSION
  readonly arrangementId: string
  readonly scoreVersionId: string
  readonly asOf: string
  readonly status: 'ready' | 'insufficient-evidence'
  readonly sectionHistories: readonly SectionHistory[]
  readonly recommendations: readonly PracticeRecommendation[]
  readonly sessionPlan: PracticeSessionPlan | null
  readonly mastery: ArrangementMastery
  readonly skills: readonly SkillRating[]
  readonly fullRunDuration: FullRunDurationEvidence
  readonly exclusions: readonly PracticePlanningExclusion[]
  readonly diagnostics: PracticePlanningDiagnostics
}
