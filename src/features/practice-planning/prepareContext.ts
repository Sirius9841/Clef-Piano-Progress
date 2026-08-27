import { deriveArrangementMastery } from '../mastery-model'
import type { PianoProgressRepository } from '../persistence/repository'
import type { PerformanceAttemptRecord } from '../persistence/types'
import { deriveAllSkillRatings } from '../skill-model'
import { deriveFullRunDurationEvidence, extractPlanningAttemptEvidence, selectBoundedAttemptSummaries } from './evidence'
import type { PracticePlanningOptions } from './options'
import { resolvePracticePlanningOptions } from './options'
import {
  PRACTICE_PLANNING_MODEL_VERSION,
  type PlanningAttemptEvidence,
  type PracticePlanningContext,
  type PracticePlanningExclusion,
} from './types'
import { cloneSerializable, deepFreeze, parseExplicitAsOf } from './utils'

export interface PreparePracticePlanningContextInput {
  readonly repository: PianoProgressRepository
  readonly arrangementId: string
  readonly scoreVersionId: string
  readonly asOf: string
  readonly options?: Partial<PracticePlanningOptions>
}

function exclusion(code: PracticePlanningExclusion['code'], detail: string, attemptId: string | null = null): PracticePlanningExclusion {
  return { code, detail, attemptId, sectionResultId: null }
}

function sortExclusions(exclusions: readonly PracticePlanningExclusion[]): readonly PracticePlanningExclusion[] {
  return [...exclusions].sort((left, right) => (left.attemptId ?? '').localeCompare(right.attemptId ?? '') || (left.sectionResultId ?? '').localeCompare(right.sectionResultId ?? '') || left.code.localeCompare(right.code))
}

interface AttemptRead {
  readonly summaryId: string
  readonly record: PerformanceAttemptRecord | null
  readonly failed: boolean
}

export async function preparePracticePlanningContext(input: PreparePracticePlanningContextInput): Promise<PracticePlanningContext> {
  parseExplicitAsOf(input.asOf)
  if (!input.arrangementId.trim() || !input.scoreVersionId.trim()) throw new RangeError('Practice Planning requires exact Arrangement and ScoreVersion IDs.')
  const options = resolvePracticePlanningOptions(input.options)
  const [arrangement, scoreVersion, summaries, techniqueSummaries] = await Promise.all([
    input.repository.getArrangement(input.arrangementId),
    input.repository.getScoreVersion(input.scoreVersionId),
    input.repository.listAttemptSummaries(input.arrangementId),
    input.repository.listTechniqueAttemptSummaries(),
  ])
  const exclusions: PracticePlanningExclusion[] = []
  if (!arrangement) exclusions.push(exclusion('arrangement-not-found', `Arrangement ${input.arrangementId} is not available.`))
  if (!scoreVersion) exclusions.push(exclusion('score-version-not-found', `ScoreVersion ${input.scoreVersionId} is not available.`))
  if (scoreVersion && scoreVersion.arrangementId !== input.arrangementId) exclusions.push(exclusion('score-version-arrangement-mismatch', 'The requested ScoreVersion does not belong to the requested Arrangement.'))

  const selection = selectBoundedAttemptSummaries(summaries, input.arrangementId, input.scoreVersionId, input.asOf, options)
  exclusions.push(...selection.exclusions)
  const identityAvailable = arrangement !== null && scoreVersion !== null && scoreVersion.arrangementId === input.arrangementId
  const reads: AttemptRead[] = identityAvailable ? await Promise.all(selection.selected.map(async (summary): Promise<AttemptRead> => {
    try {
      return { summaryId: summary.id, record: await input.repository.getAttempt(summary.id), failed: false }
    } catch {
      return { summaryId: summary.id, record: null, failed: true }
    }
  })) : []
  const loadedAttemptIds: string[] = []
  const accepted: PlanningAttemptEvidence[] = []
  const summaryById = new Map(selection.selected.map((summary) => [summary.id, summary]))
  if (scoreVersion) for (const read of reads) {
    const summary = summaryById.get(read.summaryId)!
    if (read.failed) {
      exclusions.push(exclusion('full-attempt-read-failed', 'The authoritative attempt could not be read and was excluded without repair.', read.summaryId))
      continue
    }
    if (!read.record) {
      exclusions.push(exclusion('missing-full-attempt', 'The selected summary has no authoritative full attempt snapshot.', read.summaryId))
      continue
    }
    loadedAttemptIds.push(read.record.id)
    const extracted = extractPlanningAttemptEvidence(read.record, summary, scoreVersion.normalizedScoreId)
    exclusions.push(...extracted.exclusions)
    if (extracted.attempt) accepted.push(extracted.attempt)
  }
  const orderedAccepted = accepted.sort((left, right) => right.performedAt.localeCompare(left.performedAt) || left.attemptId.localeCompare(right.attemptId))
  const mastery = deriveArrangementMastery({ arrangementId: input.arrangementId, scoreVersionId: input.scoreVersionId, attempts: summaries, asOf: input.asOf })
  const skills = deriveAllSkillRatings(techniqueSummaries, input.asOf)
  const preferredFullRunSpeed = mastery.demonstratedSpeedCandidateMultiplier ?? mastery.demonstratedSpeedMultiplier
  const fullRunDuration = deriveFullRunDurationEvidence(orderedAccepted, preferredFullRunSpeed, options)
  return deepFreeze({
    modelVersion: PRACTICE_PLANNING_MODEL_VERSION,
    arrangementId: input.arrangementId,
    scoreVersionId: input.scoreVersionId,
    asOf: input.asOf,
    attempts: orderedAccepted,
    attemptSummaries: cloneSerializable(selection.selected),
    techniqueSummaries: cloneSerializable(techniqueSummaries),
    mastery,
    skills,
    fullRunDuration,
    exclusions: sortExclusions(exclusions),
    diagnostics: {
      summaryCount: summaries.length,
      selectedSessionCount: new Set(selection.selected.map((summary) => summary.practiceSessionId)).size,
      selectedSummaryCount: selection.selected.length,
      fullAttemptReadCount: reads.length,
      acceptedAttemptCount: orderedAccepted.length,
      acceptedSectionObservationCount: orderedAccepted.reduce((sum, attempt) => sum + attempt.sectionObservations.length, 0),
      selectedSummaryIds: selection.selected.map((summary) => summary.id),
      loadedAttemptIds: loadedAttemptIds.sort((left, right) => left.localeCompare(right)),
    },
  })
}
