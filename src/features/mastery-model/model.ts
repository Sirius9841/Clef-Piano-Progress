import type { AttemptSummary } from '../persistence/types'
import { MASTERY_MODEL_OPTIONS } from './options'
import { MASTERY_MODEL_VERSION, type ArrangementMastery, type DemonstratedSpeedStatus, type MasteryEvidenceExclusion, type MasteryMinimumDimension } from './types'

const DAY_MS = 86_400_000
type Metric = 'notes' | 'rhythm' | 'tempo'
const METRICS: readonly Metric[] = ['notes', 'rhythm', 'tempo']

interface EligibleAttempt {
  readonly summary: AttemptSummary & Readonly<Record<Metric, number>>
  readonly control: number
  readonly ageDays: number
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    Object.values(value as Record<string, unknown>).forEach(deepFreeze)
  }
  return value
}

function parseAsOf(asOf: string): number {
  const value = Date.parse(asOf)
  if (!Number.isFinite(value)) throw new RangeError('Mastery Model requires a valid explicit asOf timestamp.')
  return value
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function weightedMean(values: readonly { readonly value: number; readonly weight: number }[]): number {
  const totalWeight = values.reduce((sum, item) => sum + item.weight, 0)
  if (!Number.isFinite(totalWeight) || totalWeight <= 0) return mean(values.map((item) => item.value))
  return Math.round(values.reduce((sum, item) => sum + item.value * item.weight, 0) / totalWeight * 1_000_000) / 1_000_000
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
  return Math.max(0, Math.min(100, 100 - mad * MASTERY_MODEL_OPTIONS.consistencyMadPenalty))
}

function recencyWeight(days: number): number {
  return Math.max(0, Math.min(1, 2 ** (-days / MASTERY_MODEL_OPTIONS.recencyHalfLifeDays)))
}

function recencyFactor(attempts: readonly EligibleAttempt[]): number {
  const floor = MASTERY_MODEL_OPTIONS.recencyFactorFloor
  const distributionRecency = mean(attempts.map((attempt) => recencyWeight(attempt.ageDays)))
  return floor + (1 - floor) * distributionRecency
}

function exclusion(attemptId: string, code: MasteryEvidenceExclusion['code'], detail: string): MasteryEvidenceExclusion {
  return { attemptId, code, detail }
}

function eligibleAttempt(summary: AttemptSummary, arrangementId: string, scoreVersionId: string, asOfMs: number): { readonly eligible?: EligibleAttempt; readonly exclusion?: MasteryEvidenceExclusion } {
  if (summary.arrangementId !== arrangementId) return { exclusion: exclusion(summary.id, 'wrong-arrangement', `Summary belongs to arrangement ${summary.arrangementId}.`) }
  if (summary.scoreVersionId !== scoreVersionId) return { exclusion: exclusion(summary.id, 'different-score-version', 'Only the arrangement’s current immutable ScoreVersion informs current Mastery.') }
  if (summary.gradingScope !== 'full-plan') return { exclusion: exclusion(summary.id, 'partial-scope', 'Played-section evidence cannot establish whole-arrangement Mastery.') }
  if (summary.reliability !== 'reliable' && summary.reliability !== 'limited') return { exclusion: exclusion(summary.id, 'provisional', `${summary.reliability} aggregate evidence is not Mastery-eligible.`) }
  if (METRICS.some((metric) => summary[metric] === null)) return { exclusion: exclusion(summary.id, 'missing-metric', 'Notes, Rhythm, and Tempo are all required for a control observation.') }
  const values = METRICS.map((metric) => summary[metric]!)
  const performedMs = Date.parse(summary.performedAt)
  if (!Number.isFinite(performedMs) || performedMs > asOfMs) return { exclusion: exclusion(summary.id, Number.isFinite(performedMs) ? 'future-dated' : 'invalid-summary', 'The performed timestamp is invalid or later than asOf.') }
  if (values.some((value) => !Number.isFinite(value) || value < 0 || value > 1) || !Number.isFinite(summary.practiceSpeedMultiplier) || summary.practiceSpeedMultiplier <= 0 || summary.practiceSpeedMultiplier > 2) {
    return { exclusion: exclusion(summary.id, 'invalid-summary', 'Metric and speed values must be finite and within supported bounds.') }
  }
  const typed = summary as AttemptSummary & Readonly<Record<Metric, number>>
  return { eligible: { summary: typed, control: mean(values) * 100, ageDays: (asOfMs - performedMs) / DAY_MS } }
}

function speedBucket(multiplier: number): number {
  return Math.round(multiplier * MASTERY_MODEL_OPTIONS.speedBucketPrecision) / MASTERY_MODEL_OPTIONS.speedBucketPrecision
}

function qualifiesForSpeed(attempt: EligibleAttempt): boolean {
  const threshold = MASTERY_MODEL_OPTIONS.speedQualification
  return attempt.summary.notes >= threshold.notes && attempt.summary.rhythm >= threshold.rhythm && attempt.summary.tempo >= threshold.tempo
}

interface DemonstratedSpeedEvidence {
  readonly multiplier: number | null
  readonly status: DemonstratedSpeedStatus
  readonly candidateMultiplier: number | null
  readonly qualifyingAttemptCount: number
  readonly sessions: number
  readonly effectiveSupport: number | null
  readonly evidenceAttemptIds: readonly string[]
  readonly lastEvidenceAt: string | null
}

function attemptAuthority(attempt: EligibleAttempt): number {
  const reliability = attempt.summary.reliability === 'reliable' ? MASTERY_MODEL_OPTIONS.reliableWeight : MASTERY_MODEL_OPTIONS.limitedWeight
  return reliability * recencyWeight(attempt.ageDays)
}

function demonstratedSpeed(attempts: readonly EligibleAttempt[]): DemonstratedSpeedEvidence {
  const buckets = new Map<number, EligibleAttempt[]>()
  attempts.filter(qualifiesForSpeed).forEach((attempt) => {
    const bucket = speedBucket(attempt.summary.practiceSpeedMultiplier)
    buckets.set(bucket, [...(buckets.get(bucket) ?? []), attempt])
  })
  const candidates = [...buckets.entries()].map(([multiplier, values]) => ({
    multiplier,
    values,
    effectiveSupport: values.reduce((sum, attempt) => sum + attemptAuthority(attempt), 0),
  })).sort((left, right) => right.multiplier - left.multiplier)
  const established = candidates.find((candidate) => candidate.values.length >= MASTERY_MODEL_OPTIONS.speedQualification.minimumAttempts && candidate.effectiveSupport >= MASTERY_MODEL_OPTIONS.minimumDemonstratedSpeedSupport)
  const repeatedCandidate = candidates.find((candidate) => candidate.values.length >= MASTERY_MODEL_OPTIONS.speedQualification.minimumAttempts)
  const candidate = established ?? repeatedCandidate ?? candidates[0]
  if (!candidate) return { multiplier: null, status: 'unavailable', candidateMultiplier: null, qualifyingAttemptCount: 0, sessions: 0, effectiveSupport: null, evidenceAttemptIds: [], lastEvidenceAt: null }
  const sortedValues = [...candidate.values].sort((left, right) => right.summary.performedAt.localeCompare(left.summary.performedAt) || left.summary.id.localeCompare(right.summary.id))
  const enoughRepetition = candidate.values.length >= MASTERY_MODEL_OPTIONS.speedQualification.minimumAttempts
  return {
    multiplier: established?.multiplier ?? null,
    status: established ? 'established' : enoughRepetition ? 'needs-current-support' : 'needs-repetition',
    candidateMultiplier: candidate.multiplier,
    qualifyingAttemptCount: candidate.values.length,
    sessions: new Set(candidate.values.map((attempt) => attempt.summary.practiceSessionId)).size,
    effectiveSupport: candidate.effectiveSupport,
    evidenceAttemptIds: sortedValues.map((attempt) => attempt.summary.id),
    lastEvidenceAt: sortedValues[0]?.summary.performedAt ?? null,
  }
}

function sessionSupport(attempts: readonly EligibleAttempt[]): number {
  const sessions = new Map<string, number>()
  attempts.forEach((attempt) => sessions.set(attempt.summary.practiceSessionId, Math.min(1, (sessions.get(attempt.summary.practiceSessionId) ?? 0) + attemptAuthority(attempt))))
  return [...sessions.values()].reduce((sum, support) => sum + support, 0)
}

function minimumDimension(attempts: readonly EligibleAttempt[]): MasteryMinimumDimension {
  const averages = METRICS.map((metric) => ({ metric, value: weightedMean(attempts.map((attempt) => ({ value: attempt.summary[metric] * 100, weight: (attempt.summary.reliability === 'reliable' ? MASTERY_MODEL_OPTIONS.reliableWeight : MASTERY_MODEL_OPTIONS.limitedWeight) * recencyWeight(attempt.ageDays) }))) }))
  return averages.sort((left, right) => left.value - right.value || left.metric.localeCompare(right.metric))[0]!
}

export interface DeriveArrangementMasteryInput {
  readonly arrangementId: string
  readonly scoreVersionId: string
  readonly attempts: readonly AttemptSummary[]
  readonly asOf: string
}

export function deriveArrangementMastery(input: DeriveArrangementMasteryInput): ArrangementMastery {
  const asOfMs = parseAsOf(input.asOf)
  const outcomes = input.attempts.map((attempt) => eligibleAttempt(attempt, input.arrangementId, input.scoreVersionId, asOfMs))
  const allEligible = outcomes.flatMap((outcome) => outcome.eligible ? [outcome.eligible] : [])
  const exclusions = outcomes.flatMap((outcome) => outcome.exclusion ? [outcome.exclusion] : []).sort((left, right) => left.attemptId.localeCompare(right.attemptId) || left.code.localeCompare(right.code))
  const recent = [...allEligible].sort((left, right) => right.summary.performedAt.localeCompare(left.summary.performedAt) || left.summary.id.localeCompare(right.summary.id)).slice(0, MASTERY_MODEL_OPTIONS.recentAttemptWindow)
  if (!recent.length) return deepFreeze({ arrangementId: input.arrangementId, scoreVersionId: input.scoreVersionId, modelVersion: MASTERY_MODEL_VERSION, asOf: input.asOf, status: 'unestablished', mastery: null, confidence: 'unestablished', control: null, minimumDimension: null, demonstratedSpeedMultiplier: null, demonstratedSpeedStatus: 'unavailable', demonstratedSpeedCandidateMultiplier: null, demonstratedSpeedQualifyingAttemptCount: 0, demonstratedSpeedSessionCount: 0, demonstratedSpeedEffectiveSupport: null, demonstratedSpeedEvidenceAttemptIds: [], demonstratedSpeedLastEvidenceAt: null, consistency: null, recencyFactor: null, effectiveEvidenceSupport: null, effectiveSessionSupport: null, eligibleAttemptCount: 0, distinctSessionCount: 0, lastEvidenceAt: null, evidenceAttemptIds: [], exclusions })
  const weightFor = attemptAuthority
  const control = weightedMean(recent.map((attempt) => ({ value: attempt.control, weight: weightFor(attempt) })))
  const consistencyValue = consistency(recent.map((attempt) => attempt.control))
  const speed = demonstratedSpeed(recent)
  const lastEvidenceAt = recent[0]!.summary.performedAt
  const currentRecency = recencyFactor(recent)
  const { weights } = MASTERY_MODEL_OPTIONS
  const mastery = (control * weights.control + (speed.multiplier === null ? 0 : Math.min(1, speed.multiplier) * 100 * weights.demonstratedSpeed) + (consistencyValue ?? 0) * weights.consistency) * currentRecency
  const distinctSessionCount = new Set(recent.map((attempt) => attempt.summary.practiceSessionId)).size
  const effectiveEvidenceSupport = recent.reduce((sum, attempt) => sum + attemptAuthority(attempt), 0)
  const effectiveSessionSupport = sessionSupport(recent)
  const reliableAuthority = recent.filter((attempt) => attempt.summary.reliability === 'reliable').reduce((sum, attempt) => sum + attemptAuthority(attempt), 0)
  const reliableAuthorityFraction = effectiveEvidenceSupport > 0 ? reliableAuthority / effectiveEvidenceSupport : 0
  const confidence = effectiveEvidenceSupport >= MASTERY_MODEL_OPTIONS.highConfidenceEffectiveEvidenceSupport && effectiveSessionSupport >= MASTERY_MODEL_OPTIONS.highConfidenceEffectiveSessionSupport && speed.multiplier !== null && speed.sessions >= 2 && reliableAuthorityFraction >= MASTERY_MODEL_OPTIONS.highConfidenceReliableAuthorityFraction
    ? 'high'
    : effectiveEvidenceSupport >= MASTERY_MODEL_OPTIONS.mediumConfidenceEffectiveEvidenceSupport && effectiveSessionSupport >= MASTERY_MODEL_OPTIONS.mediumConfidenceEffectiveSessionSupport ? 'medium' : 'low'
  return deepFreeze({
    arrangementId: input.arrangementId, scoreVersionId: input.scoreVersionId, modelVersion: MASTERY_MODEL_VERSION, asOf: input.asOf,
    status: 'ready', mastery: Math.max(0, Math.min(100, mastery)), confidence, control, minimumDimension: minimumDimension(recent),
    demonstratedSpeedMultiplier: speed.multiplier, demonstratedSpeedStatus: speed.status, demonstratedSpeedCandidateMultiplier: speed.candidateMultiplier,
    demonstratedSpeedQualifyingAttemptCount: speed.qualifyingAttemptCount, demonstratedSpeedSessionCount: speed.sessions,
    demonstratedSpeedEffectiveSupport: speed.effectiveSupport, demonstratedSpeedEvidenceAttemptIds: speed.evidenceAttemptIds,
    demonstratedSpeedLastEvidenceAt: speed.lastEvidenceAt, consistency: consistencyValue,
    recencyFactor: currentRecency, effectiveEvidenceSupport, effectiveSessionSupport, eligibleAttemptCount: allEligible.length, distinctSessionCount, lastEvidenceAt,
    evidenceAttemptIds: recent.map((attempt) => attempt.summary.id), exclusions,
  })
}
