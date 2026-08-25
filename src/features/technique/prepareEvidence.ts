import { clamp01, median } from '../timing-analysis/math'
import type { GroupNoteResult, NoteGradingResult } from '../note-grading/types'
import type { AlignmentResult } from '../alignment/types'
import type { TimingAnalysisResult } from '../timing-analysis/types'
import { TECHNIQUE_ANALYSIS_OPTIONS } from './options'
import type { TechniqueCompletionV2, TechniqueExerciseSnapshotV2, TechniqueIntervalEvidence } from './types'

export interface PreparedTechniqueEvidence {
  readonly completion: TechniqueCompletionV2
  readonly eventGroups: readonly { readonly eventId: string; readonly expectedGroupId: string; readonly performedGroupId: string | null; readonly index: number; readonly noteResult: GroupNoteResult | null }[]
  readonly intervals: readonly TechniqueIntervalEvidence[]
  readonly perfectExpectedGroupIds: ReadonlySet<string>
}

export function prepareTechniqueEvidence(exercise: TechniqueExerciseSnapshotV2, alignment: AlignmentResult, noteGrading: NoteGradingResult, timing: TimingAnalysisResult): PreparedTechniqueEvidence {
  const groupIndex = new Map(alignment.expectedGroups.map((group, index) => [group.id, index]))
  const correspondences = alignment.groupAlignments.filter((step) => step.kind === 'correspondence')
  const performedByExpected = new Map(correspondences.map((step) => [step.expectedGroup.id, step.performedGroup.id]))
  const directlyCovered = new Set(correspondences.map((step) => step.expectedGroup.id))
  const coveredIndices = [...directlyCovered].map((id) => groupIndex.get(id)).filter((index): index is number => index !== undefined)
  const reachedSpanEndIndex = coveredIndices.length ? Math.max(...coveredIndices) : null
  const firstReached = coveredIndices.length ? Math.min(...coveredIndices) : null
  const noteByGroup = new Map(noteGrading.groupResults.filter((result) => result.expectedGroupId).map((result) => [result.expectedGroupId!, result]))
  const attemptedEventCount = reachedSpanEndIndex === null || firstReached === null ? 0 : alignment.expectedGroups.filter((_, index) => index >= firstReached && index <= reachedSpanEndIndex).length
  const completeCorrectOrIncorrectEventCount = directlyCovered.size
  const expectedEventCount = exercise.events.length
  const eventCoverageRatio = expectedEventCount === 0 ? 0 : clamp01(completeCorrectOrIncorrectEventCount / expectedEventCount)
  const spanReachedRatio = reachedSpanEndIndex === null || expectedEventCount === 0 ? 0 : clamp01((reachedSpanEndIndex + 1) / expectedEventCount)
  const completion: TechniqueCompletionV2 = { expectedEventCount, attemptedEventCount, completeCorrectOrIncorrectEventCount, reachedSpanEndIndex, eventCoverageRatio, spanReachedRatio, completeEnoughForEvidence: eventCoverageRatio >= TECHNIQUE_ANALYSIS_OPTIONS.minimumEventCoverage }
  const eventGroups = exercise.events.map((event, index) => { const expectedGroupId = alignment.expectedGroups[index]?.id ?? ''; return { eventId: event.id, expectedGroupId, performedGroupId: performedByExpected.get(expectedGroupId) ?? null, index, noteResult: noteByGroup.get(expectedGroupId) ?? null } })
  const perfectExpectedGroupIds = new Set(noteGrading.groupResults.filter((group) => group.classification === 'perfect' && group.expectedGroupId).map((group) => group.expectedGroupId!))
  const eventByGroup = new Map(eventGroups.map((entry) => [entry.expectedGroupId, entry]))
  const intervals: TechniqueIntervalEvidence[] = timing.rhythm.observations.flatMap((observation) => {
    if (!observation.previousExpectedGroupId || !observation.previousPerformedGroupId || !observation.predictedIntervalMs || !observation.performedIntervalMs || observation.rhythmLoss === null
      || !perfectExpectedGroupIds.has(observation.previousExpectedGroupId) || !perfectExpectedGroupIds.has(observation.expectedGroupId)) return []
    const previous = eventByGroup.get(observation.previousExpectedGroupId), current = eventByGroup.get(observation.expectedGroupId)
    if (!previous || !current || current.index !== previous.index + 1 || !current.performedGroupId) return []
    const ratio = observation.performedIntervalMs / observation.predictedIntervalMs
    if (!Number.isFinite(ratio) || ratio <= 0) return []
    return [{ previousEventId: previous.eventId, currentEventId: current.eventId, previousExpectedGroupId: previous.expectedGroupId, currentExpectedGroupId: current.expectedGroupId,
      previousPerformedGroupId: observation.previousPerformedGroupId, currentPerformedGroupId: current.performedGroupId, timingObservationId: observation.id,
      expectedIntervalMs: observation.predictedIntervalMs, performedIntervalMs: observation.performedIntervalMs, ratio, logRatio: Math.log(ratio), signedDifferenceMs: observation.performedIntervalMs - observation.predictedIntervalMs,
      scorePosition: observation.expectedPosition, previousRole: exercise.events[previous.index]!.role, currentRole: exercise.events[current.index]!.role,
      transitionKind: exercise.events[current.index]!.transitionKind, rhythmLoss: observation.rhythmLoss, sourceNoteResultIds: [...(previous.noteResult?.expectedResultIds ?? []), ...(current.noteResult?.expectedResultIds ?? [])] }]
  })
  return { completion, eventGroups, intervals, perfectExpectedGroupIds }
}

export function centeredIntervalScores(intervals: readonly TechniqueIntervalEvidence[], tolerance: number): readonly { evidence: TechniqueIntervalEvidence; score: number; centeredRatio: number }[] {
  const center = median(intervals.map((item) => item.logRatio)) ?? 0
  return intervals.map((evidence) => { const centeredLog = evidence.logRatio - center; return { evidence, centeredRatio: Math.exp(centeredLog), score: 100 * clamp01(1 - Math.abs(centeredLog) / tolerance) } })
}
