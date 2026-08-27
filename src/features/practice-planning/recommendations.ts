import { MASTERY_MODEL_VERSION } from '../mastery-model'
import { SKILL_MODEL_VERSION } from '../skill-model'
import type { TechniqueModuleId } from '../technique/types'
import { deriveSectionHistories } from './evidence'
import type { PracticePlanningPolicy } from './options'
import { resolvePracticePlanningOptions } from './options'
import { sectionOverlapRatio } from './sectionIdentity'
import { composePracticeSessionPlan } from './sessionPlan'
import {
  PRACTICE_PLANNING_MODEL_VERSION,
  type PlanningDimension,
  type PlanningEvidenceStrength,
  type PracticePlanningContext,
  type PracticePlanningResult,
  type PracticeRecommendation,
  type PracticeRecommendationKind,
  type PracticeRecommendationReason,
  type PracticeRecommendationReasonCode,
  type PracticeRecommendationTarget,
  type SectionDimensionHistory,
  type SectionDimensionSpeedHistory,
  type SectionHistory,
} from './types'
import { deepFreeze, uniqueSorted } from './utils'

interface RecommendationCandidate {
  readonly kind: PracticeRecommendationKind
  readonly target: PracticeRecommendationTarget
  readonly sourcePracticeSpeedMultiplier: number | null
  readonly suggestedPracticeSpeedMultiplier: number | null
  readonly evidenceStrength: PlanningEvidenceStrength
  readonly reasons: readonly PracticeRecommendationReason[]
  readonly maximumWeakness: number
  readonly effectiveSessionSupport: number
  readonly lastEvidenceAt: string | null
  readonly musicalOrder: number
  readonly suppressionFamily: 'section-focus' | 'section-speed' | 'none'
}

const DIMENSIONS: readonly PlanningDimension[] = ['notes', 'rhythm', 'tempo']

const KIND_PRIORITY: Readonly<Record<PracticeRecommendationKind, number>> = Object.freeze({
  'focus-section': 0,
  'reduce-speed': 1,
  'hold-speed': 2,
  'verify-section': 3,
  'increase-speed': 4,
  'full-run': 5,
  'technique-drill': 6,
  'refresh-technique-evidence': 7,
  'widen-scope': 8,
})

function reason(
  code: PracticeRecommendationReasonCode,
  values: Partial<Omit<PracticeRecommendationReason, 'code' | 'evidenceAttemptIds' | 'evidenceSessionIds'>> & Pick<PracticeRecommendationReason, 'evidenceAttemptIds' | 'evidenceSessionIds'>,
): PracticeRecommendationReason {
  return {
    code,
    dimension: null,
    observedValue: null,
    weakness: null,
    rawSessionCount: null,
    effectiveSessionSupport: null,
    lastEvidenceAt: null,
    masteryStatus: null,
    skillModuleId: null,
    skillConfidence: null,
    ...values,
  }
}

function dimensionReason(code: PracticeRecommendationReasonCode, history: SectionDimensionHistory | SectionDimensionSpeedHistory, dimension: PlanningDimension): PracticeRecommendationReason {
  return reason(code, {
    dimension,
    observedValue: history.qualityEstimate,
    weakness: history.weaknessEstimate,
    rawSessionCount: history.rawSessionCount,
    effectiveSessionSupport: history.effectiveSessionSupport,
    lastEvidenceAt: history.lastMeasuredAt,
    evidenceAttemptIds: history.evidenceAttemptIds,
    evidenceSessionIds: history.evidenceSessionIds,
  })
}

function latest(values: readonly (string | null)[]): string | null {
  return values.filter((value): value is string => value !== null).sort().at(-1) ?? null
}

function evidenceStrength(values: readonly PlanningEvidenceStrength[]): PlanningEvidenceStrength {
  if (values.includes('strong')) return 'strong'
  if (values.includes('supported')) return 'supported'
  if (values.includes('tentative')) return 'tentative'
  if (values.includes('single-session')) return 'single-session'
  return 'insufficient'
}

function sectionCandidates(history: SectionHistory, options: PracticePlanningPolicy): readonly RecommendationCandidate[] {
  const weak = history.dimensions.filter((dimension) => dimension.weaknessEstimate !== null && dimension.weaknessEstimate >= options.meaningfulWeaknessThreshold)
  const persistent = weak.filter((dimension) => dimension.rawSessionCount >= options.persistentWeaknessMinimumSessions && dimension.effectiveSessionSupport >= options.persistentWeaknessMinimumEffectiveSessionSupport)
  const candidates: RecommendationCandidate[] = []
  if (persistent.length > 0) {
    const reasons = persistent.map((dimension) => dimensionReason('supported-section-weakness', dimension, dimension.dimension))
    candidates.push({
      kind: 'focus-section',
      target: { type: 'section', section: history.section },
      sourcePracticeSpeedMultiplier: null,
      suggestedPracticeSpeedMultiplier: null,
      evidenceStrength: evidenceStrength(persistent.map((dimension) => dimension.evidenceStrength)),
      reasons,
      maximumWeakness: Math.max(...persistent.map((dimension) => dimension.weaknessEstimate!)),
      effectiveSessionSupport: Math.max(...persistent.map((dimension) => dimension.effectiveSessionSupport)),
      lastEvidenceAt: latest(persistent.map((dimension) => dimension.lastMeasuredAt)),
      musicalOrder: history.section.startMeasureIndex,
      suppressionFamily: 'section-focus',
    })
  } else if (weak.length > 0) {
    const reasons = weak.map((dimension) => dimensionReason('single-session-section-weakness', dimension, dimension.dimension))
    candidates.push({
      kind: 'verify-section',
      target: { type: 'section', section: history.section },
      sourcePracticeSpeedMultiplier: null,
      suggestedPracticeSpeedMultiplier: null,
      evidenceStrength: evidenceStrength(weak.map((dimension) => dimension.evidenceStrength)),
      reasons,
      maximumWeakness: Math.max(...weak.map((dimension) => dimension.weaknessEstimate!)),
      effectiveSessionSupport: Math.max(...weak.map((dimension) => dimension.effectiveSessionSupport)),
      lastEvidenceAt: latest(weak.map((dimension) => dimension.lastMeasuredAt)),
      musicalOrder: history.section.startMeasureIndex,
      suppressionFamily: 'section-focus',
    })
  }

  const bySpeed = new Map<number, Map<PlanningDimension, SectionDimensionSpeedHistory>>()
  for (const dimension of history.dimensions) for (const speed of dimension.speedContexts) {
    const values = bySpeed.get(speed.practiceSpeedMultiplier) ?? new Map<PlanningDimension, SectionDimensionSpeedHistory>()
    values.set(dimension.dimension, speed)
    bySpeed.set(speed.practiceSpeedMultiplier, values)
  }
  const speedBuckets = [...bySpeed.entries()].sort((left, right) => right[0] - left[0])
  const isControlled = (dimensions: ReadonlyMap<PlanningDimension, SectionDimensionSpeedHistory>): boolean => DIMENSIONS.every((dimension) => {
    const value = dimensions.get(dimension)
    return value !== undefined
      && value.qualityEstimate !== null
      && value.qualityEstimate >= options.progressionControlThresholds[dimension]
      && value.rawSessionCount >= options.progressionMinimumSessions
      && value.effectiveSessionSupport >= options.progressionMinimumEffectiveSessionSupport
  })
  const highestControlled = speedBuckets.find(([, dimensions]) => isControlled(dimensions))
  const frontier = speedBuckets[0]
  if (frontier) {
    const [practiceSpeedMultiplier, dimensions] = frontier
    const values = DIMENSIONS.map((dimension) => dimensions.get(dimension)).filter((value): value is SectionDimensionSpeedHistory => value !== undefined)
    const frontierWithinSuggestionBounds = practiceSpeedMultiplier >= options.minimumSuggestedSpeed && practiceSpeedMultiplier <= options.maximumSuggestedSpeed
    if (isControlled(dimensions)) {
      const suggested = Math.min(options.maximumSuggestedSpeed, Math.round((practiceSpeedMultiplier + options.speedStep) * options.speedBucketPrecision) / options.speedBucketPrecision)
      if (frontierWithinSuggestionBounds && suggested > practiceSpeedMultiplier) {
        const reasons = DIMENSIONS.map((dimension) => dimensionReason('strong-section-control-at-speed', dimensions.get(dimension)!, dimension))
        candidates.push({
          kind: 'increase-speed',
          target: { type: 'section', section: history.section },
          sourcePracticeSpeedMultiplier: practiceSpeedMultiplier,
          suggestedPracticeSpeedMultiplier: suggested,
          evidenceStrength: evidenceStrength(values.map((value) => value.evidenceStrength)),
          reasons,
          maximumWeakness: 0,
          effectiveSessionSupport: Math.min(...values.map((value) => value.effectiveSessionSupport)),
          lastEvidenceAt: latest(values.map((value) => value.lastMeasuredAt)),
          musicalOrder: history.section.startMeasureIndex,
          suppressionFamily: 'section-speed',
        })
      }
    } else {
      const persistentWeak = [...dimensions.entries()].filter((entry): entry is [PlanningDimension, SectionDimensionSpeedHistory] => {
        const value = entry[1]
        return value.weaknessEstimate !== null
          && value.weaknessEstimate >= options.meaningfulWeaknessThreshold
          && value.rawSessionCount >= options.persistentWeaknessMinimumSessions
          && value.effectiveSessionSupport >= options.persistentWeaknessMinimumEffectiveSessionSupport
      })
      if (persistentWeak.length > 0) {
        const severe = persistentWeak.some(([, value]) => value.weaknessEstimate! >= options.severeWeaknessThreshold && value.effectiveSessionSupport >= options.progressionMinimumEffectiveSessionSupport)
        const reducedSpeed = Math.max(options.minimumSuggestedSpeed, Math.round((practiceSpeedMultiplier - options.speedStep) * options.speedBucketPrecision) / options.speedBucketPrecision)
        const canReduce = frontierWithinSuggestionBounds && severe && reducedSpeed < practiceSpeedMultiplier
        const reasons = persistentWeak.map(([dimension, value]) => dimensionReason('supported-section-weakness-at-speed', value, dimension))
        candidates.push({
          kind: frontierWithinSuggestionBounds ? (canReduce ? 'reduce-speed' : 'hold-speed') : 'verify-section',
          target: { type: 'section', section: history.section },
          sourcePracticeSpeedMultiplier: practiceSpeedMultiplier,
          suggestedPracticeSpeedMultiplier: frontierWithinSuggestionBounds ? (canReduce ? reducedSpeed : practiceSpeedMultiplier) : null,
          evidenceStrength: evidenceStrength(persistentWeak.map(([, value]) => value.evidenceStrength)),
          reasons,
          maximumWeakness: Math.max(...persistentWeak.map(([, value]) => value.weaknessEstimate!)),
          effectiveSessionSupport: Math.max(...persistentWeak.map(([, value]) => value.effectiveSessionSupport)),
          lastEvidenceAt: latest(persistentWeak.map(([, value]) => value.lastMeasuredAt)),
          musicalOrder: history.section.startMeasureIndex,
          suppressionFamily: 'section-speed',
        })
      } else if (highestControlled && practiceSpeedMultiplier > highestControlled[0]) {
        candidates.push({
          kind: frontierWithinSuggestionBounds ? 'hold-speed' : 'verify-section',
          target: { type: 'section', section: history.section },
          sourcePracticeSpeedMultiplier: practiceSpeedMultiplier,
          suggestedPracticeSpeedMultiplier: frontierWithinSuggestionBounds ? practiceSpeedMultiplier : null,
          evidenceStrength: evidenceStrength(values.map((value) => value.evidenceStrength)),
          reasons: [...dimensions.entries()].map(([dimension, value]) => dimensionReason('frontier-needs-verification', value, dimension)),
          maximumWeakness: Math.max(0, ...values.map((value) => value.weaknessEstimate ?? 0)),
          effectiveSessionSupport: Math.max(0, ...values.map((value) => value.effectiveSessionSupport)),
          lastEvidenceAt: latest(values.map((value) => value.lastMeasuredAt)),
          musicalOrder: history.section.startMeasureIndex,
          suppressionFamily: 'section-speed',
        })
      }
    }
  }
  return candidates
}

function masteryCandidate(context: PracticePlanningContext): RecommendationCandidate | null {
  const mastery = context.mastery
  if (mastery.demonstratedSpeedStatus !== 'needs-repetition' && mastery.demonstratedSpeedStatus !== 'needs-current-support') return null
  const code = mastery.demonstratedSpeedStatus === 'needs-repetition' ? 'mastery-needs-repetition' : 'mastery-needs-current-support'
  const evidenceStrength: PlanningEvidenceStrength = mastery.confidence === 'high' ? 'strong' : mastery.confidence === 'medium' ? 'supported' : mastery.confidence === 'low' ? 'single-session' : 'insufficient'
  return {
    kind: 'full-run',
    target: { type: 'arrangement', arrangementId: context.arrangementId, scoreVersionId: context.scoreVersionId },
    sourcePracticeSpeedMultiplier: null,
    suggestedPracticeSpeedMultiplier: mastery.demonstratedSpeedCandidateMultiplier,
    evidenceStrength,
    reasons: [reason(code, {
      masteryStatus: mastery.demonstratedSpeedStatus,
      rawSessionCount: mastery.demonstratedSpeedSessionCount,
      effectiveSessionSupport: mastery.demonstratedSpeedEffectiveSessionSupport,
      lastEvidenceAt: mastery.demonstratedSpeedLastEvidenceAt,
      evidenceAttemptIds: mastery.demonstratedSpeedEvidenceAttemptIds,
      evidenceSessionIds: mastery.demonstratedSpeedSupportingSessionIds,
    })],
    maximumWeakness: 0,
    effectiveSessionSupport: mastery.demonstratedSpeedEffectiveSessionSupport ?? 0,
    lastEvidenceAt: mastery.demonstratedSpeedLastEvidenceAt,
    musicalOrder: Number.MAX_SAFE_INTEGER - 2,
    suppressionFamily: 'none',
  }
}

function skillCandidates(context: PracticePlanningContext, options: PracticePlanningPolicy): readonly RecommendationCandidate[] {
  return context.skills.flatMap((skill): RecommendationCandidate[] => {
    if (skill.status !== 'established' || skill.qualityEstimate === null || skill.qualityEstimate >= options.supportedSkillOpportunityThreshold) return []
    const supported = skill.confidence === 'medium' || skill.confidence === 'high'
    const kind = supported ? 'technique-drill' : 'refresh-technique-evidence'
    const code = supported ? 'supported-technique-opportunity' : 'technique-evidence-needs-refresh'
    const target: PracticeRecommendationTarget = { type: 'technique', moduleId: skill.moduleId, requiresNewStimulus: skill.moduleId === 'sight-reading' }
    return [{
      kind,
      target,
      sourcePracticeSpeedMultiplier: null,
      suggestedPracticeSpeedMultiplier: null,
      evidenceStrength: supported ? (skill.confidence === 'high' ? 'strong' : 'supported') : 'single-session',
      reasons: [reason(code, {
        observedValue: skill.qualityEstimate / 100,
        weakness: 1 - skill.qualityEstimate / 100,
        lastEvidenceAt: skill.lastMeasuredAt,
        skillModuleId: skill.moduleId,
        skillConfidence: skill.confidence,
        evidenceAttemptIds: skill.modelEvidenceAttemptIds,
        evidenceSessionIds: [],
      })],
      maximumWeakness: 1 - skill.qualityEstimate / 100,
      effectiveSessionSupport: skill.effectiveEvidenceSupport ?? 0,
      lastEvidenceAt: skill.lastMeasuredAt,
      musicalOrder: 1_000_000 + techniqueOrder(skill.moduleId),
      suppressionFamily: 'none',
    }]
  })
}

function techniqueOrder(moduleId: TechniqueModuleId): number {
  return ['sight-reading', 'rhythm', 'chord-fluency', 'scales', 'arpeggios', 'octaves', 'keyboard-jumps', 'tempo-control'].indexOf(moduleId)
}

function compareCandidates(left: RecommendationCandidate, right: RecommendationCandidate): number {
  return KIND_PRIORITY[left.kind] - KIND_PRIORITY[right.kind]
    || right.maximumWeakness - left.maximumWeakness
    || right.effectiveSessionSupport - left.effectiveSessionSupport
    || (right.lastEvidenceAt ?? '').localeCompare(left.lastEvidenceAt ?? '')
    || left.musicalOrder - right.musicalOrder
    || JSON.stringify(left.target).localeCompare(JSON.stringify(right.target))
}

function suppressOverlaps(candidates: readonly RecommendationCandidate[], options: PracticePlanningPolicy): readonly RecommendationCandidate[] {
  const kept: RecommendationCandidate[] = []
  for (const candidate of [...candidates].sort(compareCandidates)) {
    if (candidate.target.type !== 'section' || candidate.suppressionFamily === 'none') {
      kept.push(candidate)
      continue
    }
    const candidateSection = candidate.target.section
    const overlaps = kept.some((existing) => existing.target.type === 'section'
      && existing.suppressionFamily === candidate.suppressionFamily
      && sectionOverlapRatio(existing.target.section, candidateSection) >= options.overlapSuppressionRatio)
    if (!overlaps) kept.push(candidate)
  }
  return kept
}

function materialize(candidates: readonly RecommendationCandidate[], options: PracticePlanningPolicy): readonly PracticeRecommendation[] {
  return [...suppressOverlaps(candidates, options)].sort(compareCandidates).slice(0, options.maximumRecommendations).map((candidate, index) => {
    const evidenceAttemptIds = uniqueSorted(candidate.reasons.flatMap((item) => item.evidenceAttemptIds))
    const evidenceSessionIds = uniqueSorted(candidate.reasons.flatMap((item) => item.evidenceSessionIds))
    return {
      id: JSON.stringify([PRACTICE_PLANNING_MODEL_VERSION, candidate.kind, candidate.target, candidate.sourcePracticeSpeedMultiplier, candidate.suggestedPracticeSpeedMultiplier, evidenceAttemptIds]),
      rank: index + 1,
      kind: candidate.kind,
      target: candidate.target,
      sourcePracticeSpeedMultiplier: candidate.sourcePracticeSpeedMultiplier,
      suggestedPracticeSpeedMultiplier: candidate.suggestedPracticeSpeedMultiplier,
      evidenceStrength: candidate.evidenceStrength,
      reasons: candidate.reasons,
      evidenceAttemptIds,
      evidenceSessionIds,
      lastEvidenceAt: candidate.lastEvidenceAt,
    }
  })
}

function validateContext(context: PracticePlanningContext): void {
  if (context.modelVersion !== PRACTICE_PLANNING_MODEL_VERSION) throw new RangeError('Practice Planning context uses an incompatible model version.')
  if (context.mastery.modelVersion !== MASTERY_MODEL_VERSION || context.mastery.arrangementId !== context.arrangementId || context.mastery.scoreVersionId !== context.scoreVersionId || context.mastery.asOf !== context.asOf) {
    throw new RangeError('Mastery provenance must exactly match the Practice Planning context.')
  }
  if (context.skills.some((skill) => skill.modelVersion !== SKILL_MODEL_VERSION || skill.asOf !== context.asOf)) throw new RangeError('Skill provenance must use the exact current model and asOf.')
  const resolvedPolicy = resolvePracticePlanningOptions(context.policy)
  if (!Object.isFrozen(context.policy) || !Object.isFrozen(context.policy.progressionControlThresholds) || JSON.stringify(resolvedPolicy) !== JSON.stringify(context.policy)) throw new RangeError('Practice Planning context policy must be an exact frozen resolved policy.')
}

export function derivePracticePlanning(
  context: PracticePlanningContext,
  input: Readonly<{ availableMinutes?: number }> = {},
): PracticePlanningResult {
  validateContext(context)
  if ('options' in input) throw new RangeError('Practice Planning policy is locked by context preparation and cannot be overridden during derivation.')
  const policy = context.policy
  const sectionHistories = deriveSectionHistories(context.attempts, context.asOf, policy)
  const candidates = sectionHistories.flatMap((history) => sectionCandidates(history, policy))
  const mastery = masteryCandidate(context)
  if (mastery) candidates.push(mastery)
  candidates.push(...skillCandidates(context, policy))
  const recommendations = materialize(candidates, policy)
  const sessionPlan = input.availableMinutes === undefined ? null : composePracticeSessionPlan(recommendations, input.availableMinutes, context.fullRunDuration, policy)
  return deepFreeze({
    modelVersion: PRACTICE_PLANNING_MODEL_VERSION,
    arrangementId: context.arrangementId,
    scoreVersionId: context.scoreVersionId,
    asOf: context.asOf,
    policy,
    status: recommendations.length > 0 ? 'ready' : 'insufficient-evidence',
    sectionHistories,
    recommendations,
    sessionPlan,
    mastery: context.mastery,
    skills: context.skills,
    fullRunDuration: context.fullRunDuration,
    exclusions: context.exclusions,
    diagnostics: context.diagnostics,
  })
}
