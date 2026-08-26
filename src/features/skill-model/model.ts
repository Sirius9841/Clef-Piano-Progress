import type { TechniqueAttemptSummary, TechniqueAttemptSummaryV2 } from '../persistence/types'
import { TECHNIQUE_MODULE_IDS, type TechniqueFacetId, type TechniqueModuleId } from '../technique/types'
import { SKILL_MODEL_OPTIONS } from './options'
import { SKILL_CONTEXT_DEFINITIONS, skillContextId, skillContextUsesDimension } from './skillContextIdentity'
import { SKILL_MODEL_VERSION, type SkillChallengeEnvelope, type SkillContextRating, type SkillEvidenceExclusion, type SkillRating, type TechniqueSkillEvidence } from './types'

const DAY_MS = 86_400_000

const REQUIRED_FACETS: Readonly<Record<TechniqueModuleId, readonly TechniqueFacetId[]>> = Object.freeze({
  'sight-reading': ['note-accuracy', 'pulse-continuity'],
  rhythm: ['rhythm-precision', 'pulse-continuity'],
  'chord-fluency': ['chord-accuracy', 'chord-synchronization'],
  scales: ['note-accuracy', 'onset-evenness'],
  arpeggios: ['note-accuracy', 'arpeggio-transition-consistency'],
  octaves: ['octave-integrity', 'onset-evenness'],
  'keyboard-jumps': ['landing-accuracy', 'jump-timing-consistency', 'recovery-continuity'],
  'tempo-control': ['target-tempo-control', 'tempo-stability'],
})

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    Object.values(value as Record<string, unknown>).forEach(deepFreeze)
  }
  return value
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function weightedMean(values: readonly { readonly value: number; readonly weight: number }[]): number {
  const weight = values.reduce((sum, item) => sum + item.weight, 0)
  if (!Number.isFinite(weight) || weight <= 0) return mean(values.map((item) => item.value))
  return Math.round(values.reduce((sum, item) => sum + item.value * item.weight, 0) / weight * 1_000_000) / 1_000_000
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!
}

function consistency(values: readonly number[]): number | null {
  if (values.length < 2) return null
  const center = median(values)
  const mad = median(values.map((value) => Math.abs(value - center)))
  return Math.max(0, Math.min(100, 100 - mad * SKILL_MODEL_OPTIONS.consistencyMadPenalty))
}

function parseAsOf(asOf: string): number {
  const value = Date.parse(asOf)
  if (!Number.isFinite(value)) throw new RangeError('Skill Model requires a valid explicit asOf timestamp.')
  return value
}

function daysOld(performedAt: string, asOfMs: number): number | null {
  const value = Date.parse(performedAt)
  if (!Number.isFinite(value) || value > asOfMs) return null
  return (asOfMs - value) / DAY_MS
}

function qualityRecencyWeight(days: number): number {
  const { qualityRecencyHalfLifeDays: halfLife, qualityRecencyWeightFloor: floor } = SKILL_MODEL_OPTIONS
  return floor + (1 - floor) * 2 ** (-days / halfLife)
}

function confidenceRecencyWeight(days: number): number {
  return Math.max(0, Math.min(1, 2 ** (-days / SKILL_MODEL_OPTIONS.confidenceRecencyHalfLifeDays)))
}

function requiredFacets(summary: TechniqueAttemptSummaryV2): readonly TechniqueFacetId[] {
  const base = REQUIRED_FACETS[summary.moduleId]
  if (summary.moduleId === 'scales' && summary.challenge.direction === 'both') return [...base, 'direction-change-continuity']
  if (summary.moduleId === 'tempo-control' && summary.challenge.tempoChangeCount > 0) return [...base, 'tempo-transition-control']
  return base
}

function exclusion(attemptId: string, code: SkillEvidenceExclusion['code'], detail: string): SkillEvidenceExclusion {
  return { attemptId, code, detail }
}

function validateCurrentSummary(summary: TechniqueAttemptSummary, moduleId: TechniqueModuleId, asOfMs: number): { readonly evidence?: TechniqueSkillEvidence; readonly exclusion?: SkillEvidenceExclusion } {
  if (summary.moduleId !== moduleId) return { exclusion: exclusion(summary.id, 'wrong-module', `Expected ${moduleId}; summary belongs to ${summary.moduleId}.`) }
  if (!('schemaVersion' in summary) || summary.schemaVersion !== 2 || summary.exerciseEngineVersion !== 'technique-exercise-1.1.1' || summary.techniqueAnalysisEngineVersion !== 'technique-analysis-1.1.2') {
    return { exclusion: exclusion(summary.id, 'legacy-engine', 'Only the current Technique 1.1.1 / analysis 1.1.2 evidence pair informs Skill Model 1.1.1.') }
  }
  const age = daysOld(summary.performedAt, asOfMs)
  if (age === null) return { exclusion: exclusion(summary.id, Number.isFinite(Date.parse(summary.performedAt)) ? 'future-dated' : 'invalid-summary', 'The performed timestamp is invalid or later than asOf.') }
  const challengeNumbers = [summary.challenge.targetTempoBpm, summary.challenge.eventCount, summary.challenge.tonic, summary.challenge.octaveSpan, summary.challenge.subdivision, summary.challenge.chordInversion, summary.challenge.jumpSemitones, summary.challenge.tempoChangeCount]
  if (!summary.templateId.trim() || challengeNumbers.some((value) => !Number.isFinite(value)) || summary.completion.eventCoverageRatio < 0 || summary.completion.eventCoverageRatio > 1) {
    return { exclusion: exclusion(summary.id, 'invalid-summary', 'Challenge or completion provenance contains an invalid numeric value.') }
  }
  if (moduleId === 'sight-reading' && (!summary.novelty.firstSavedAttempt || summary.novelty.priorSavedAttemptCount !== 0)) {
    return { exclusion: exclusion(summary.id, 'repeat-sight-reading', 'Sight-reading skill accepts only the first saved encounter with an exact exercise instance.') }
  }
  const required = requiredFacets(summary)
  const facets = required.map((id) => summary.facets.find((facet) => facet.id === id))
  if (facets.some((facet) => !facet)) return { exclusion: exclusion(summary.id, 'missing-required-facet', 'One or more applicable core facets are absent.') }
  if (facets.some((facet) => facet!.reliability === 'provisional')) return { exclusion: exclusion(summary.id, 'provisional-facet', 'Provisional facets cannot establish current skill evidence.') }
  if (facets.some((facet) => facet!.status !== 'ready' || facet!.score === null || facet!.reliability === 'unavailable')) return { exclusion: exclusion(summary.id, 'missing-required-facet', 'Every applicable core facet must be ready.') }
  if (facets.some((facet) => facet!.coverage < SKILL_MODEL_OPTIONS.minimumFacetCoverage)) return { exclusion: exclusion(summary.id, 'insufficient-coverage', `Every applicable facet must have at least ${SKILL_MODEL_OPTIONS.minimumFacetCoverage} coverage.`) }
  if (moduleId === 'sight-reading' && facets.some((facet) => facet!.evidenceContext !== 'first-pass')) return { exclusion: exclusion(summary.id, 'repeat-sight-reading', 'Sight-reading facets must retain first-pass evidence context.') }
  if (facets.some((facet) => !Number.isFinite(facet!.score) || facet!.score! < 0 || facet!.score! > 100 || !Number.isFinite(facet!.coverage) || facet!.coverage < 0 || facet!.coverage > 1)) {
    return { exclusion: exclusion(summary.id, 'invalid-summary', 'Facet scores and coverage must be finite and bounded.') }
  }
  const ready = facets.map((facet) => facet!)
  return { evidence: {
    attemptId: summary.id,
    exerciseInstanceId: summary.exerciseInstanceId,
    moduleId,
    performedAt: summary.performedAt,
    contextId: skillContextId(summary),
    quality: mean(ready.map((facet) => facet.score!)),
    reliability: ready.every((facet) => facet.reliability === 'reliable') ? 'reliable' : 'limited',
    coverage: mean(ready.map((facet) => facet.coverage)),
    facetIds: ready.map((facet) => facet.id),
  } }
}

function modelAttemptAuthority(item: TechniqueSkillEvidence, asOfMs: number): number {
  const reliability = item.reliability === 'reliable' ? SKILL_MODEL_OPTIONS.reliableWeight : SKILL_MODEL_OPTIONS.limitedWeight
  return reliability * item.coverage * confidenceRecencyWeight(daysOld(item.performedAt, asOfMs)!)
}

function contextRatings(evidence: readonly TechniqueSkillEvidence[], asOfMs: number): readonly SkillContextRating[] {
  const groups = new Map<string, TechniqueSkillEvidence[]>()
  evidence.forEach((item) => groups.set(item.contextId, [...(groups.get(item.contextId) ?? []), item]))
  return [...groups.entries()].map(([id, items]) => {
    const recent = [...items].sort((left, right) => right.performedAt.localeCompare(left.performedAt) || left.attemptId.localeCompare(right.attemptId)).slice(0, SKILL_MODEL_OPTIONS.contextAttemptWindow)
    const weighted = recent.map((item) => ({ value: item.quality, weight: (item.reliability === 'reliable' ? SKILL_MODEL_OPTIONS.reliableWeight : SKILL_MODEL_OPTIONS.limitedWeight) * item.coverage * qualityRecencyWeight(daysOld(item.performedAt, asOfMs)!) }))
    const effectiveAuthority = Math.min(1, recent.reduce((sum, item) => sum + modelAttemptAuthority(item, asOfMs), 0) / SKILL_MODEL_OPTIONS.contextAuthorityNormalization)
    return {
      contextId: id,
      qualityEstimate: weightedMean(weighted),
      attemptCount: items.length,
      evidenceAttemptIds: recent.map((item) => item.attemptId),
      lastMeasuredAt: recent[0]!.performedAt,
      averageCoverage: mean(recent.map((item) => item.coverage)),
      reliableAttemptFraction: recent.filter((item) => item.reliability === 'reliable').length / recent.length,
      effectiveAuthority,
    }
  }).sort((left, right) => right.lastMeasuredAt.localeCompare(left.lastMeasuredAt) || left.contextId.localeCompare(right.contextId))
}

function uniqueSorted<T extends string | number>(values: readonly T[]): readonly T[] {
  return [...new Set(values)].sort((left, right) => typeof left === 'number' && typeof right === 'number' ? left - right : String(left).localeCompare(String(right)))
}

function envelope(moduleId: TechniqueModuleId, summaries: readonly TechniqueAttemptSummaryV2[], evidence: readonly TechniqueSkillEvidence[]): SkillChallengeEnvelope {
  const eligibleIds = new Set(evidence.map((item) => item.attemptId))
  const eligible = summaries.filter((summary) => eligibleIds.has(summary.id))
  const bpms = eligible.map((summary) => summary.challenge.targetTempoBpm)
  const definition = SKILL_CONTEXT_DEFINITIONS[moduleId]
  const uses = (dimension: Parameters<typeof skillContextUsesDimension>[1]) => skillContextUsesDimension(moduleId, dimension)
  const tonalTonic = definition.tonicSemantics === 'tonal-key'
  const templateIds = uses('templateId') ? uniqueSorted(eligible.map((summary) => summary.templateId)) : []
  return {
    attemptCount: eligible.length,
    distinctChallengeContexts: new Set(evidence.map((item) => item.contextId)).size,
    targetTempoBpm: bpms.length ? { minimum: Math.min(...bpms), maximum: Math.max(...bpms) } : null,
    declaredHandContexts: uniqueSorted(eligible.map((summary) => summary.challenge.declaredHandContext)),
    lastMeasuredAt: evidence.map((item) => item.performedAt).sort().at(-1) ?? null,
    tonics: uses('tonic') && tonalTonic ? uniqueSorted(eligible.map((summary) => summary.challenge.tonic)) : [],
    startingTonics: uses('tonic') && !tonalTonic ? uniqueSorted(eligible.map((summary) => summary.challenge.tonic)) : [],
    modes: uses('mode') ? uniqueSorted(eligible.map((summary) => summary.challenge.mode)) : [],
    octaveSpans: uses('octaveSpan') ? uniqueSorted(eligible.map((summary) => summary.challenge.octaveSpan)) : [],
    directions: uses('direction') ? uniqueSorted(eligible.map((summary) => summary.challenge.direction)) : [],
    chordInversions: uses('chordInversion') ? uniqueSorted(eligible.map((summary) => summary.challenge.chordInversion)) : [],
    jumpDistancesSemitones: uses('jumpSemitones') ? uniqueSorted(eligible.map((summary) => summary.challenge.jumpSemitones)) : [],
    maximumJumpDistanceSemitones: uses('jumpSemitones') && eligible.length ? Math.max(...eligible.map((summary) => summary.challenge.jumpSemitones)) : null,
    tempoShapes: uses('tempoShape') ? uniqueSorted(eligible.map((summary) => summary.challenge.tempoShape)) : [],
    subdivisions: uses('subdivision') ? uniqueSorted(eligible.map((summary) => summary.challenge.subdivision)) : [],
    eventCounts: uses('eventCount') ? uniqueSorted(eligible.map((summary) => summary.challenge.eventCount)) : [],
    templateIds,
    distinctTemplateCount: templateIds.length,
    distinctFirstPassExerciseInstances: new Set(eligible.filter((summary) => summary.moduleId === 'sight-reading').map((summary) => summary.exerciseInstanceId)).size,
  }
}

export function deriveSkillRating(moduleId: TechniqueModuleId, summaries: readonly TechniqueAttemptSummary[], asOf: string): SkillRating {
  const asOfMs = parseAsOf(asOf)
  const outcomes = summaries.map((summary) => validateCurrentSummary(summary, moduleId, asOfMs))
  const evidence = outcomes.flatMap((outcome) => outcome.evidence ? [outcome.evidence] : [])
  const exclusions = outcomes.flatMap((outcome) => outcome.exclusion ? [outcome.exclusion] : [])
    .sort((left, right) => left.attemptId.localeCompare(right.attemptId) || left.code.localeCompare(right.code))
  const contexts = contextRatings(evidence, asOfMs)
  const currentSummaries = summaries.filter((summary): summary is TechniqueAttemptSummaryV2 => 'schemaVersion' in summary && summary.schemaVersion === 2)
  const challengeEnvelope = envelope(moduleId, currentSummaries, evidence)
  if (!evidence.length) return deepFreeze({ moduleId, modelVersion: SKILL_MODEL_VERSION, asOf, status: 'unestablished', qualityEstimate: null, confidence: 'unestablished', consistency: null, eligibleAttemptCount: 0, modelEvidenceAttemptCount: 0, eligibleContextCount: 0, lastMeasuredAt: null, challengeEnvelope, contextRatings: [], eligibleAttemptIds: [], modelEvidenceAttemptIds: [], effectiveEvidenceSupport: null, exclusions })
  const qualityEstimate = weightedMean(contexts.map((context) => ({ value: context.qualityEstimate, weight: qualityRecencyWeight(daysOld(context.lastMeasuredAt, asOfMs)!) })))
  const lastMeasuredAt = evidence.map((item) => item.performedAt).sort().at(-1)!
  const modelEvidenceIds = new Set(contexts.flatMap((context) => context.evidenceAttemptIds))
  const modelEvidence = evidence.filter((item) => modelEvidenceIds.has(item.attemptId))
  const effectiveEvidenceSupport = contexts.reduce((sum, context) => sum + context.effectiveAuthority, 0)
  const confidence = modelEvidence.length >= SKILL_MODEL_OPTIONS.highConfidenceModelAttempts && contexts.length >= SKILL_MODEL_OPTIONS.highConfidenceContexts && effectiveEvidenceSupport >= SKILL_MODEL_OPTIONS.highConfidenceEffectiveSupport
    ? 'high'
    : modelEvidence.length >= SKILL_MODEL_OPTIONS.mediumConfidenceModelAttempts && contexts.length >= SKILL_MODEL_OPTIONS.mediumConfidenceContexts && effectiveEvidenceSupport >= SKILL_MODEL_OPTIONS.mediumConfidenceEffectiveSupport ? 'medium' : 'low'
  return deepFreeze({
    moduleId, modelVersion: SKILL_MODEL_VERSION, asOf, status: 'established', qualityEstimate, confidence,
    consistency: consistency(modelEvidence.map((item) => item.quality)), eligibleAttemptCount: evidence.length, modelEvidenceAttemptCount: modelEvidence.length,
    eligibleContextCount: contexts.length, lastMeasuredAt, challengeEnvelope, contextRatings: contexts,
    eligibleAttemptIds: [...evidence].sort((left, right) => left.performedAt.localeCompare(right.performedAt) || left.attemptId.localeCompare(right.attemptId)).map((item) => item.attemptId),
    modelEvidenceAttemptIds: [...modelEvidence].sort((left, right) => left.performedAt.localeCompare(right.performedAt) || left.attemptId.localeCompare(right.attemptId)).map((item) => item.attemptId),
    effectiveEvidenceSupport, exclusions,
  })
}

export function deriveAllSkillRatings(summaries: readonly TechniqueAttemptSummary[], asOf: string): readonly SkillRating[] {
  return deepFreeze(TECHNIQUE_MODULE_IDS.map((moduleId) => deriveSkillRating(moduleId, summaries.filter((summary) => summary.moduleId === moduleId), asOf)))
}
