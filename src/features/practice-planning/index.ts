export { selectBoundedAttemptSummaries, extractPlanningAttemptEvidence, deriveSectionHistories, deriveFullRunDurationEvidence } from './evidence'
export { DEFAULT_PRACTICE_PLANNING_OPTIONS, resolvePracticePlanningOptions } from './options'
export type { PracticePlanningOptions, PracticePlanningPolicy } from './options'
export { preparePracticePlanningContext } from './prepareContext'
export type { PreparePracticePlanningContextInput } from './prepareContext'
export { derivePracticePlanning } from './recommendations'
export { createPlanningSectionIdentity, canonicalSourceMeasureIds, sectionOverlapRatio } from './sectionIdentity'
export { composePracticeSessionPlan } from './sessionPlan'
export { PRACTICE_PLANNING_MODEL_VERSION } from './types'
export type {
  BoundedSummarySelection,
  ExtractPlanningAttemptResult,
} from './evidence'
export type {
  FrozenSectionEvidenceProvenance,
  FullRunDurationEvidence,
  PlanningAttemptEvidence,
  PlanningDimension,
  PlanningEvidenceStrength,
  PlanningSectionIdentity,
  PlanningSectionObservation,
  PracticePlanningContext,
  PracticePlanningDiagnostics,
  PracticePlanningExclusion,
  PracticePlanningExclusionCode,
  PracticePlanningResult,
  PracticeRecommendation,
  PracticeRecommendationKind,
  PracticeRecommendationReason,
  PracticeRecommendationReasonCode,
  PracticeRecommendationTarget,
  PracticeSessionPlan,
  PracticeSessionPlanBlock,
  SectionDimensionHistory,
  SectionDimensionSpeedHistory,
  SectionHistory,
} from './types'
