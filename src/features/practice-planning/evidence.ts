import type { AttemptSummary, PerformanceAttemptRecord } from '../persistence/types'
import type { MeasureResult, SectionResult } from '../performance-results/types'
import { RESULT_AGGREGATION_VERSION } from '../performance-results/options'
import type { PracticePlanningOptions } from './options'
import { canonicalSourceMeasureIds, createPlanningSectionIdentity } from './sectionIdentity'
import type {
  FullRunDurationEvidence,
  PlanningAttemptEvidence,
  PlanningDimension,
  PlanningEvidenceStrength,
  PlanningSectionObservation,
  PracticePlanningExclusion,
  SectionDimensionHistory,
  SectionDimensionSpeedHistory,
  SectionHistory,
} from './types'
import { clamp01, DAY_MS, median, parseExplicitAsOf, uniqueSorted, weightedMean } from './utils'

const DIMENSIONS: readonly PlanningDimension[] = ['notes', 'rhythm', 'tempo']

function exclusion(code: PracticePlanningExclusion['code'], detail: string, attemptId: string | null = null, sectionResultId: string | null = null): PracticePlanningExclusion {
  return { code, detail, attemptId, sectionResultId }
}

function summaryOrder(left: AttemptSummary, right: AttemptSummary): number {
  return right.performedAt.localeCompare(left.performedAt) || left.id.localeCompare(right.id)
}

export interface BoundedSummarySelection {
  readonly selected: readonly AttemptSummary[]
  readonly exclusions: readonly PracticePlanningExclusion[]
}

export function selectBoundedAttemptSummaries(
  summaries: readonly AttemptSummary[],
  arrangementId: string,
  scoreVersionId: string,
  asOf: string,
  options: PracticePlanningOptions,
): BoundedSummarySelection {
  const asOfMs = parseExplicitAsOf(asOf)
  const eligible: AttemptSummary[] = []
  const exclusions: PracticePlanningExclusion[] = []
  for (const summary of summaries) {
    if (summary.arrangementId !== arrangementId) {
      exclusions.push(exclusion('wrong-arrangement', `Summary belongs to Arrangement ${summary.arrangementId}.`, summary.id))
      continue
    }
    if (summary.scoreVersionId !== scoreVersionId) {
      exclusions.push(exclusion('different-score-version', `Summary belongs to ScoreVersion ${summary.scoreVersionId}.`, summary.id))
      continue
    }
    const performedMs = Date.parse(summary.performedAt)
    if (!Number.isFinite(performedMs) || !Number.isFinite(summary.practiceSpeedMultiplier) || summary.practiceSpeedMultiplier <= 0 || summary.practiceSpeedMultiplier > 2 || !summary.practiceSessionId.trim()) {
      exclusions.push(exclusion('invalid-summary', 'Summary timing, session, or practice-speed provenance is invalid.', summary.id))
      continue
    }
    if (performedMs > asOfMs) {
      exclusions.push(exclusion('future-dated-evidence', 'Evidence later than the explicit asOf cannot inform current planning.', summary.id))
      continue
    }
    if (summary.reliability !== 'reliable' && summary.reliability !== 'limited') {
      exclusions.push(exclusion('provisional-or-unavailable-attempt', `${summary.reliability} evidence cannot establish longitudinal planning claims.`, summary.id))
      continue
    }
    eligible.push(summary)
  }
  const bySession = new Map<string, AttemptSummary[]>()
  eligible.forEach((summary) => bySession.set(summary.practiceSessionId, [...(bySession.get(summary.practiceSessionId) ?? []), summary]))
  const orderedSessions = [...bySession.entries()].sort((left, right) => {
    const leftLatest = [...left[1]].sort(summaryOrder)[0]!
    const rightLatest = [...right[1]].sort(summaryOrder)[0]!
    return summaryOrder(leftLatest, rightLatest) || left[0].localeCompare(right[0])
  })
  const selectedSessionIds = new Set(orderedSessions.slice(0, options.latestSessionLimit).map(([sessionId]) => sessionId))
  const selected: AttemptSummary[] = []
  for (const [sessionId, values] of orderedSessions) {
    const ordered = [...values].sort(summaryOrder)
    if (!selectedSessionIds.has(sessionId)) {
      ordered.forEach((summary) => exclusions.push(exclusion('outside-bounded-history', 'Summary falls outside the latest configured PracticeSession window.', summary.id)))
      continue
    }
    selected.push(...ordered.slice(0, options.attemptsPerSessionLimit))
    ordered.slice(options.attemptsPerSessionLimit).forEach((summary) => exclusions.push(exclusion('outside-bounded-history', 'Summary exceeds the configured per-session retry cap.', summary.id)))
  }
  return {
    selected: selected.sort(summaryOrder),
    exclusions: exclusions.sort((left, right) => (left.attemptId ?? '').localeCompare(right.attemptId ?? '') || left.code.localeCompare(right.code)),
  }
}

function sameStringArrays(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function sectionTopology(section: SectionResult, measures: readonly MeasureResult[]): { readonly measures?: readonly MeasureResult[]; readonly error?: string } {
  if (!Number.isInteger(section.startMeasureIndex) || !Number.isInteger(section.endMeasureIndex) || section.startMeasureIndex < 0 || section.endMeasureIndex < section.startMeasureIndex || section.measureResultIds.length === 0 || new Set(section.measureResultIds).size !== section.measureResultIds.length) {
    return { error: 'Section indexes or measure-result identity are malformed.' }
  }
  const byId = new Map(measures.map((measure) => [measure.id, measure]))
  const sectionMeasures = section.measureResultIds.map((id) => byId.get(id))
  if (sectionMeasures.some((measure) => measure === undefined)) return { error: 'Section references a missing MeasureResult.' }
  const present = sectionMeasures as readonly MeasureResult[]
  const ordered = [...present].sort((left, right) => left.measureIndex - right.measureIndex || left.id.localeCompare(right.id))
  const expectedLength = section.endMeasureIndex - section.startMeasureIndex + 1
  if (ordered.length !== expectedLength || ordered[0]!.measureIndex !== section.startMeasureIndex || ordered.at(-1)!.measureIndex !== section.endMeasureIndex || ordered.some((measure, index) => index > 0 && measure.measureIndex !== ordered[index - 1]!.measureIndex + 1)) {
    return { error: 'Section does not contain one complete contiguous measure window.' }
  }
  const sectionSources = canonicalSourceMeasureIds(section.sourceMeasureIds)
  const measureSources = canonicalSourceMeasureIds(ordered.flatMap((measure) => measure.sourceMeasureIds))
  if (!sameStringArrays(sectionSources, measureSources)) return { error: 'Section source-measure provenance does not match its MeasureResults.' }
  return { measures: ordered }
}

function validMetric(value: number | null): boolean {
  return value === null || (Number.isFinite(value) && value >= 0 && value <= 1)
}

export interface ExtractPlanningAttemptResult {
  readonly attempt: PlanningAttemptEvidence | null
  readonly exclusions: readonly PracticePlanningExclusion[]
}

export function extractPlanningAttemptEvidence(record: PerformanceAttemptRecord, summary: AttemptSummary, normalizedScoreId: string): ExtractPlanningAttemptResult {
  const exclusions: PracticePlanningExclusion[] = []
  const identityMatches = record.id === summary.id
    && record.arrangementId === summary.arrangementId
    && record.scoreVersionId === summary.scoreVersionId
    && record.practiceSessionId === summary.practiceSessionId
    && record.performedAt === summary.performedAt
    && record.recording.durationMs === summary.durationMs
    && record.practiceSpeedMultiplier === summary.practiceSpeedMultiplier
    && record.gradingScope === summary.gradingScope
  if (!identityMatches) return { attempt: null, exclusions: [exclusion('summary-full-attempt-identity-mismatch', 'The selected summary and authoritative attempt do not share exact identity provenance.', summary.id)] }
  const results = record.performanceResults
  if (record.engineVersions.resultAggregation !== RESULT_AGGREGATION_VERSION || results.diagnostics.resultAggregationVersion !== RESULT_AGGREGATION_VERSION) {
    return { attempt: null, exclusions: [exclusion('unsupported-result-aggregation-version', `Only frozen PerformanceResults ${RESULT_AGGREGATION_VERSION} semantics are supported.`, summary.id)] }
  }
  if (results.status !== 'ready' || (results.reliability !== 'reliable' && results.reliability !== 'limited') || results.reliability !== summary.reliability || results.scope !== record.gradingScope || results.normalizedScoreId !== normalizedScoreId) {
    return { attempt: null, exclusions: [exclusion('incompatible-performance-results', 'The frozen PerformanceResults are unavailable, unreliable, or incompatible with the exact attempt/score identity.', summary.id)] }
  }
  const observations: PlanningSectionObservation[] = []
  for (const section of results.sections) {
    const topology = sectionTopology(section, results.measures)
    if (!topology.measures) {
      exclusions.push(exclusion('malformed-section-topology', topology.error ?? 'Section topology is malformed.', summary.id, section.id))
      continue
    }
    if (topology.measures.some((measure) => measure.analysisState === 'outside-scope')) {
      exclusions.push(exclusion('section-outside-attempted-scope', 'At least one constituent measure is outside the attempted scope.', summary.id, section.id))
      continue
    }
    const notes = section.note.noteScore
    const rhythm = section.rhythm.rhythmScore
    const tempo = section.tempo.tempoScore
    if (![notes, rhythm, tempo].every(validMetric) || !Number.isFinite(section.confidence.weight) || section.confidence.weight < 0 || section.confidence.weight > 1) {
      exclusions.push(exclusion('malformed-section-evidence', 'Section metrics or confidence are not finite and bounded.', summary.id, section.id))
      continue
    }
    if (notes === null && rhythm === null && tempo === null) {
      exclusions.push(exclusion('insufficient-section-evidence', 'The section has no available Notes, Rhythm, or Tempo dimension.', summary.id, section.id))
      continue
    }
    let identity
    try {
      identity = createPlanningSectionIdentity(summary.scoreVersionId, section)
    } catch {
      exclusions.push(exclusion('malformed-section-topology', 'Section identity cannot be constructed from its frozen provenance.', summary.id, section.id))
      continue
    }
    observations.push({
      attemptId: summary.id,
      practiceSessionId: summary.practiceSessionId,
      performedAt: summary.performedAt,
      practiceSpeedMultiplier: summary.practiceSpeedMultiplier,
      reliability: results.reliability,
      sectionConfidenceWeight: section.confidence.weight,
      sectionConfidenceCategory: section.confidence.category,
      section: identity,
      notes,
      rhythm,
      tempo,
      provenance: {
        performanceResultsId: results.id,
        sectionResultId: section.id,
        measureResultIds: [...section.measureResultIds],
        sourceMeasureIds: [...identity.sourceMeasureIds],
        confidenceCategory: section.confidence.category,
        confidenceWeight: section.confidence.weight,
        noteResultIds: [...section.note.expectedResultIds, ...section.note.attributedAdditionalResultIds],
        rhythmObservationIds: [...section.rhythm.observationIds],
        tempoSampleIds: [...section.tempo.sampleIds],
      },
    })
  }
  return {
    attempt: {
      attemptId: summary.id,
      arrangementId: summary.arrangementId,
      scoreVersionId: summary.scoreVersionId,
      practiceSessionId: summary.practiceSessionId,
      performedAt: summary.performedAt,
      practiceSpeedMultiplier: summary.practiceSpeedMultiplier,
      gradingScope: summary.gradingScope,
      reliability: results.reliability,
      durationMs: record.recording.durationMs,
      sectionObservations: observations.sort((left, right) => left.section.startMeasureIndex - right.section.startMeasureIndex || left.section.id.localeCompare(right.section.id)),
    },
    exclusions,
  }
}

function speedBucket(value: number, options: PracticePlanningOptions): number {
  return Math.round(value * options.speedBucketPrecision) / options.speedBucketPrecision
}

function observationAuthority(observation: PlanningSectionObservation, asOfMs: number, options: PracticePlanningOptions): number {
  const performedMs = Date.parse(observation.performedAt)
  const ageDays = Math.max(0, (asOfMs - performedMs) / DAY_MS)
  const reliability = observation.reliability === 'reliable' ? options.reliableWeight : options.limitedWeight
  return reliability * clamp01(observation.sectionConfidenceWeight) * 2 ** (-ageDays / options.recencyHalfLifeDays)
}

function evidenceStrength(rawSessions: number, effectiveSessionSupport: number, options: PracticePlanningOptions): PlanningEvidenceStrength {
  if (rawSessions === 0) return 'insufficient'
  if (rawSessions === 1) return 'single-session'
  if (rawSessions >= options.strongEvidenceMinimumSessions && effectiveSessionSupport >= options.strongEvidenceMinimumEffectiveSessionSupport) return 'strong'
  if (rawSessions >= options.persistentWeaknessMinimumSessions && effectiveSessionSupport >= options.persistentWeaknessMinimumEffectiveSessionSupport) return 'supported'
  return 'tentative'
}

interface DimensionAggregate {
  readonly qualityEstimate: number | null
  readonly weaknessEstimate: number | null
  readonly rawAttemptCount: number
  readonly rawSessionCount: number
  readonly effectiveAttemptSupport: number
  readonly effectiveSessionSupport: number
  readonly latestValue: number | null
  readonly lastMeasuredAt: string | null
  readonly evidenceStrength: PlanningEvidenceStrength
  readonly evidenceAttemptIds: readonly string[]
  readonly evidenceSessionIds: readonly string[]
}

function aggregateDimension(observations: readonly PlanningSectionObservation[], dimension: PlanningDimension, asOfMs: number, options: PracticePlanningOptions): DimensionAggregate {
  const available = observations.filter((observation) => observation[dimension] !== null)
  const bySession = new Map<string, PlanningSectionObservation[]>()
  available.forEach((observation) => bySession.set(observation.practiceSessionId, [...(bySession.get(observation.practiceSessionId) ?? []), observation]))
  const sessions = [...bySession.entries()].map(([sessionId, values]) => {
    const retained = [...values].sort((left, right) => right.performedAt.localeCompare(left.performedAt) || left.attemptId.localeCompare(right.attemptId)).slice(0, options.sectionDimensionAttemptsPerSessionLimit)
    const weighted = retained.map((observation) => ({ value: observation[dimension]!, weight: observationAuthority(observation, asOfMs, options) }))
    return {
      sessionId,
      retained,
      quality: weightedMean(weighted),
      authority: Math.min(1, weighted.reduce((sum, item) => sum + item.weight, 0)),
      attemptAuthority: weighted.reduce((sum, item) => sum + item.weight, 0),
    }
  }).sort((left, right) => left.sessionId.localeCompare(right.sessionId))
  const effectiveAttemptSupport = sessions.reduce((sum, session) => sum + session.attemptAuthority, 0)
  const effectiveSessionSupport = sessions.reduce((sum, session) => sum + session.authority, 0)
  const qualityEstimate = weightedMean(sessions.filter((session): session is typeof session & { quality: number } => session.quality !== null).map((session) => ({ value: session.quality, weight: session.authority })))
  const retained = sessions.flatMap((session) => session.retained).sort((left, right) => right.performedAt.localeCompare(left.performedAt) || left.attemptId.localeCompare(right.attemptId))
  return {
    qualityEstimate,
    weaknessEstimate: qualityEstimate === null ? null : 1 - qualityEstimate,
    rawAttemptCount: available.length,
    rawSessionCount: bySession.size,
    effectiveAttemptSupport,
    effectiveSessionSupport,
    latestValue: retained[0]?.[dimension] ?? null,
    lastMeasuredAt: retained[0]?.performedAt ?? null,
    evidenceStrength: evidenceStrength(bySession.size, effectiveSessionSupport, options),
    evidenceAttemptIds: retained.map((observation) => observation.attemptId),
    evidenceSessionIds: uniqueSorted(retained.map((observation) => observation.practiceSessionId)),
  }
}

function dimensionHistory(observations: readonly PlanningSectionObservation[], dimension: PlanningDimension, asOfMs: number, options: PracticePlanningOptions): SectionDimensionHistory {
  const aggregate = aggregateDimension(observations, dimension, asOfMs, options)
  const speedValues = [...new Set(observations.filter((observation) => observation[dimension] !== null).map((observation) => speedBucket(observation.practiceSpeedMultiplier, options)))].sort((left, right) => right - left)
  const speedContexts: SectionDimensionSpeedHistory[] = speedValues.map((practiceSpeedMultiplier) => ({
    practiceSpeedMultiplier,
    ...aggregateDimension(observations.filter((observation) => speedBucket(observation.practiceSpeedMultiplier, options) === practiceSpeedMultiplier), dimension, asOfMs, options),
    trend: 'insufficient',
  }))
  return { dimension, ...aggregate, trend: 'insufficient', speedContexts }
}

export function deriveSectionHistories(attempts: readonly PlanningAttemptEvidence[], asOf: string, options: PracticePlanningOptions): readonly SectionHistory[] {
  const asOfMs = parseExplicitAsOf(asOf)
  const observations = attempts.flatMap((attempt) => attempt.sectionObservations)
  const groups = new Map<string, PlanningSectionObservation[]>()
  observations.forEach((observation) => groups.set(observation.section.id, [...(groups.get(observation.section.id) ?? []), observation]))
  return [...groups.values()].map((values) => {
    const ordered = [...values].sort((left, right) => right.performedAt.localeCompare(left.performedAt) || left.attemptId.localeCompare(right.attemptId))
    const section = ordered[0]!.section
    return {
      section,
      dimensions: DIMENSIONS.map((dimension) => dimensionHistory(values, dimension, asOfMs, options)),
      observationCount: values.length,
      evidenceAttemptIds: uniqueSorted(values.map((value) => value.attemptId)),
      evidenceSessionIds: uniqueSorted(values.map((value) => value.practiceSessionId)),
      lastMeasuredAt: ordered[0]!.performedAt,
    }
  }).sort((left, right) => left.section.startMeasureIndex - right.section.startMeasureIndex || left.section.endMeasureIndex - right.section.endMeasureIndex || left.section.id.localeCompare(right.section.id))
}

export function deriveFullRunDurationEvidence(attempts: readonly PlanningAttemptEvidence[], preferredSpeed: number | null, options: PracticePlanningOptions): FullRunDurationEvidence {
  const full = attempts.filter((attempt) => attempt.gradingScope === 'full-plan' && Number.isFinite(attempt.durationMs) && attempt.durationMs > 0)
  const preferred = preferredSpeed === null ? full : full.filter((attempt) => speedBucket(attempt.practiceSpeedMultiplier, options) === speedBucket(preferredSpeed, options))
  const candidates = [...preferred].sort((left, right) => right.performedAt.localeCompare(left.performedAt) || left.attemptId.localeCompare(right.attemptId)).slice(0, 3)
  const durationMs = median(candidates.map((attempt) => attempt.durationMs))
  return {
    estimatedMinutes: durationMs === null ? null : Math.max(1, Math.ceil(durationMs / 60_000)),
    practiceSpeedMultiplier: candidates[0]?.practiceSpeedMultiplier ?? null,
    evidenceAttemptIds: candidates.map((attempt) => attempt.attemptId),
    lastMeasuredAt: candidates[0]?.performedAt ?? null,
  }
}
