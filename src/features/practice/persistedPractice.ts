import { buildExpectedPerformancePlan } from '../expected-performance/builder'
import { ExpectedPerformanceBuildError, type ExpectedPerformancePlan } from '../expected-performance/types'
import type { NormalizedScore } from '../musicxml/types'
import { exactPartOrder, samePartSelection } from '../persistence/partSelection'
import type { PersistedScoreVersion } from '../persistence/types'

export function buildPersistedPracticePlan(
  score: NormalizedScore,
  scoreVersion: PersistedScoreVersion,
  requestedPartIds?: readonly string[],
): ExpectedPerformancePlan {
  if (requestedPartIds && !samePartSelection(requestedPartIds, scoreVersion.includedPartIds)) {
    throw new ExpectedPerformanceBuildError('INVALID_PART_SELECTION', 'The saved ScoreVersion does not match the selected score parts.')
  }

  const persistedPartIds = [...scoreVersion.includedPartIds]
  const plan = buildExpectedPerformancePlan(score, { includedPartIds: persistedPartIds, fallbackQuarterBpm: 120 })
  if (!exactPartOrder(plan.includedPartIds, persistedPartIds)) {
    throw new ExpectedPerformanceBuildError('INVALID_PART_SELECTION', 'The practice plan does not match the saved ScoreVersion part identity.')
  }
  return plan
}
