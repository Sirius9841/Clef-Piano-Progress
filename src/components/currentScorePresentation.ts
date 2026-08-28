import type { AttemptSummary, PersistedArrangement, RepertoireListItem } from '../features/persistence/types'
import type { VoicingIntentProfile } from '../features/voicing-analysis/types'
import type { PersonalBestHistoryEvent } from '../features/progress/model'

export function attemptsForScoreVersion(attempts: readonly AttemptSummary[], scoreVersionId: string): readonly AttemptSummary[] {
  return attempts.filter((attempt) => attempt.scoreVersionId === scoreVersionId)
}

export function latestAttemptForScoreVersion(attempts: readonly AttemptSummary[], scoreVersionId: string): AttemptSummary | null {
  return [...attemptsForScoreVersion(attempts, scoreVersionId)].sort((left, right) => right.performedAt.localeCompare(left.performedAt) || left.id.localeCompare(right.id))[0] ?? null
}

export function latestCurrentAttemptForRepertoireItem(item: Pick<RepertoireListItem, 'arrangement' | 'scoreVersion'>, attempts: readonly AttemptSummary[]): AttemptSummary | null {
  return latestAttemptForScoreVersion(attempts.filter((attempt) => attempt.arrangementId === item.arrangement.id), item.scoreVersion.id)
}

export function currentScorePersonalBestEvents(
  events: readonly PersonalBestHistoryEvent[],
  attempts: readonly AttemptSummary[],
  arrangementId: string,
  scoreVersionId: string,
): readonly PersonalBestHistoryEvent[] {
  const attemptsById = new Map(attempts.map((attempt) => [attempt.id, attempt]))
  return events.filter((event) => {
    const attempt = attemptsById.get(event.attemptId)
    return attempt?.arrangementId === arrangementId && attempt.scoreVersionId === scoreVersionId
  })
}

export function boundedRecentRepertoire(items: readonly RepertoireListItem[], limit = 3): readonly RepertoireListItem[] {
  return items.slice(0, Math.max(0, limit))
}

export interface CurrentInterpretationStatus {
  readonly voicingProfile: VoicingIntentProfile | null
  readonly referenceAttemptId: string | null
  readonly referenceAttempt: AttemptSummary | null
}

export function currentInterpretationStatus(arrangement: PersistedArrangement, scoreVersionId: string, attempts: readonly AttemptSummary[]): CurrentInterpretationStatus {
  const voicingProfile = arrangement.analysisPreferences?.voicingByScoreVersion[scoreVersionId] ?? null
  const referenceAttemptId = arrangement.analysisPreferences?.referenceByScoreVersion[scoreVersionId] ?? null
  const referenceAttempt = referenceAttemptId
    ? attempts.find((attempt) => attempt.id === referenceAttemptId && attempt.scoreVersionId === scoreVersionId) ?? null
    : null
  return { voicingProfile, referenceAttemptId, referenceAttempt }
}
