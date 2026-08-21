import type { AttemptSummary, PersistedScoreVersion } from './types'

export function scoreVersionNumberForAttempt(attempt: AttemptSummary, versions: readonly PersistedScoreVersion[]): number | null {
  return versions.find((version) => version.id === attempt.scoreVersionId)?.version ?? null
}
