import { buildLocalTempoWindowGeometry } from '../timing-analysis/localTempoWindowGeometry'
import { clamp01, median, stableHash } from '../timing-analysis/math'
import { DEFAULT_TIMING_ANALYSIS_OPTIONS } from '../timing-analysis/options'
import type { GroupNoteResult, NoteGradingResult } from '../note-grading/types'
import type { AlignmentResult } from '../alignment/types'
import type { TimingAnalysisResult } from '../timing-analysis/types'
import { TECHNIQUE_ANALYSIS_OPTIONS } from './options'
import type { TechniqueCompletionV2, TechniqueExerciseSnapshotV2, TechniqueIntervalEvidence, TechniqueTempoOpportunity } from './types'

export interface PreparedTechniqueEvidence {
  readonly completion: TechniqueCompletionV2
  readonly eventGroups: readonly { readonly eventId: string; readonly expectedGroupId: string; readonly performedGroupId: string | null; readonly index: number; readonly participation: 'attempted' | 'outside-performed-span'; readonly noteResult: GroupNoteResult | null }[]
  readonly intervals: readonly TechniqueIntervalEvidence[]
  readonly tempoOpportunities: readonly TechniqueTempoOpportunity[]
  readonly perfectExpectedGroupIds: ReadonlySet<string>
}

export function attemptedEventCount(evidence: PreparedTechniqueEvidence, selector: (eventIndex: number) => boolean = () => true): number {
  return evidence.eventGroups.filter((entry) => entry.participation === 'attempted' && selector(entry.index)).length
}

export function attemptedTransitionCount(evidence: PreparedTechniqueEvidence, selector: (currentEventIndex: number) => boolean = () => true): number {
  return evidence.eventGroups.filter((entry) => entry.index > 0 && entry.participation === 'attempted' && evidence.eventGroups[entry.index - 1]?.participation === 'attempted' && selector(entry.index)).length
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
  const eventGroups = exercise.events.map((event, index) => { const expectedGroupId = alignment.expectedGroups[index]?.id ?? ''; return { eventId: event.id, expectedGroupId, performedGroupId: performedByExpected.get(expectedGroupId) ?? null, index, participation: firstReached !== null && reachedSpanEndIndex !== null && index >= firstReached && index <= reachedSpanEndIndex ? 'attempted' as const : 'outside-performed-span' as const, noteResult: noteByGroup.get(expectedGroupId) ?? null } })
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
  const attemptedTempoAnchors = eventGroups.filter((entry) => entry.participation === 'attempted').map((entry) => ({
    ...entry,
    position: exercise.events[entry.index]!.position,
  }))
  const tempoOpportunities = buildLocalTempoWindowGeometry(
    attemptedTempoAnchors.map((entry) => ({ ...entry, id: entry.expectedGroupId })),
    DEFAULT_TIMING_ANALYSIS_OPTIONS.localTempoWindowBeats,
    DEFAULT_TIMING_ANALYSIS_OPTIONS.minimumTempoWindowAnchors,
  ).map((window): TechniqueTempoOpportunity => {
    const startEvent = exercise.events[window.start.index]!
    const endEvent = exercise.events[window.end.index]!
    const identity = `${window.start.expectedGroupId}|${startEvent.position.numerator}/${startEvent.position.denominator}|${window.end.expectedGroupId}|${endEvent.position.numerator}/${endEvent.position.denominator}`
    return {
      id: `technique-tempo-opportunity:${stableHash(identity)}`,
      startEventId: startEvent.id,
      endEventId: endEvent.id,
      startExpectedGroupId: window.start.expectedGroupId,
      endExpectedGroupId: window.end.expectedGroupId,
      startPosition: { ...startEvent.position },
      endPosition: { ...endEvent.position },
      windowScoreDuration: { ...window.windowScoreDuration },
      anchorCount: window.anchorCount,
      targetQuarterBpm: endEvent.targetTempoBpm,
    }
  })
  return { completion, eventGroups, intervals, tempoOpportunities, perfectExpectedGroupIds }
}

export function centeredIntervalScores(intervals: readonly TechniqueIntervalEvidence[], tolerance: number): readonly { evidence: TechniqueIntervalEvidence; score: number; centeredRatio: number }[] {
  const center = median(intervals.map((item) => item.logRatio)) ?? 0
  return intervals.map((evidence) => { const centeredLog = evidence.logRatio - center; return { evidence, centeredRatio: Math.exp(centeredLog), score: 100 * clamp01(1 - Math.abs(centeredLog) / tolerance) } })
}
