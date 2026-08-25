import type { AlignmentResult } from '../alignment/types'
import { scoreTimeToMilliseconds } from '../expected-performance/tempoTimeline'
import type { ExpectedNoteAttack, ExpectedPerformancePlan } from '../expected-performance/types'
import { notationLaneCompatible } from '../expression-analysis/notationLane'
import { compareTime, timeToNumber, type MusicalTime } from '../musicxml/musicalTime'
import type { PedalEvent } from '../musicxml/types'
import type { PedalAnalysisOptions } from './options'
import type { PedalTimingAnchor } from './types'

interface LocalMusicalAnchor {
  readonly expectedGroupId: string
  readonly performedGroupId: string
  readonly position: MusicalTime
  readonly performedMs: number
  readonly confidence: number
  readonly pairedAttacks: readonly ExpectedNoteAttack[]
}

function globalPrediction(position: MusicalTime, plan: ExpectedPerformancePlan, alignment: AlignmentResult): number {
  const referenceMs = scoreTimeToMilliseconds(position, plan.tempoTimeline, alignment.practiceSpeedMultiplier)
  return alignment.timeTransform.offsetMs + alignment.timeTransform.scale * referenceMs
}

function safeCorrespondences(alignment: AlignmentResult, options: PedalAnalysisOptions): LocalMusicalAnchor[] {
  if (alignment.status !== 'aligned') return []
  return alignment.groupAlignments.flatMap((step): LocalMusicalAnchor[] => {
    if (step.kind !== 'correspondence' || step.performedGroup.spreadMs > options.localAnchorMaximumPerformedSpreadMs) return []
    const exactPairedAttackIds = new Set(step.attacks.pairs.map((pair) => pair.expectedAttackId))
    const pairedAttacks = step.expectedGroup.attacks.filter((attack) => exactPairedAttackIds.has(attack.id))
    if (pairedAttacks.length === 0) return []
    const spreadConfidence = 1 - Math.min(0.25, step.performedGroup.spreadMs / Math.max(1, options.localAnchorMaximumPerformedSpreadMs) * 0.25)
    return [{
      expectedGroupId: step.expectedGroup.id,
      performedGroupId: step.performedGroup.id,
      position: step.expectedGroup.position,
      performedMs: step.performedGroup.representativeMs,
      confidence: spreadConfidence,
      pairedAttacks,
    }]
  }).sort((left, right) => compareTime(left.position, right.position) || left.expectedGroupId.localeCompare(right.expectedGroupId))
}

function localAnchor(
  event: PedalEvent,
  globalPredictedMs: number,
  anchors: readonly LocalMusicalAnchor[],
  options: PedalAnalysisOptions,
): PedalTimingAnchor | null {
  const exact = anchors.find((anchor) => compareTime(anchor.position, event.position) === 0)
  if (exact) return {
    source: 'local-performed', scorePosition: { ...event.position }, globalPredictedMs,
    anchoredPerformedMs: exact.performedMs, anchorOffsetFromGlobalMs: exact.performedMs - globalPredictedMs,
    beforeExpectedGroupId: exact.expectedGroupId, afterExpectedGroupId: null,
    matchedPerformedGroupIds: [exact.performedGroupId], confidence: exact.confidence,
  }

  let before: LocalMusicalAnchor | undefined
  let after: LocalMusicalAnchor | undefined
  for (const anchor of anchors) {
    if (compareTime(anchor.position, event.position) < 0) before = anchor
    else if (compareTime(anchor.position, event.position) > 0) { after = anchor; break }
  }
  const targetValue = timeToNumber(event.position)
  const maximumDistance = options.localAnchorMaximumScoreDistanceQuarters
  if (before && after) {
    const beforeValue = timeToNumber(before.position)
    const afterValue = timeToNumber(after.position)
    const beforeDistance = targetValue - beforeValue
    const afterDistance = afterValue - targetValue
    if (beforeDistance <= maximumDistance && afterDistance <= maximumDistance && afterValue > beforeValue && after.performedMs >= before.performedMs) {
      const fraction = (targetValue - beforeValue) / (afterValue - beforeValue)
      const performedMs = before.performedMs + fraction * (after.performedMs - before.performedMs)
      return {
        source: 'local-performed', scorePosition: { ...event.position }, globalPredictedMs,
        anchoredPerformedMs: performedMs, anchorOffsetFromGlobalMs: performedMs - globalPredictedMs,
        beforeExpectedGroupId: before.expectedGroupId, afterExpectedGroupId: after.expectedGroupId,
        matchedPerformedGroupIds: [before.performedGroupId, after.performedGroupId],
        confidence: Math.min(before.confidence, after.confidence) * 0.9,
      }
    }
  }

  const nearby = anchors.map((anchor) => ({ anchor, distance: Math.abs(timeToNumber(anchor.position) - targetValue) }))
    .filter((candidate) => candidate.distance <= maximumDistance)
    .sort((left, right) => left.distance - right.distance || compareTime(left.anchor.position, right.anchor.position) || left.anchor.expectedGroupId.localeCompare(right.anchor.expectedGroupId))[0]
  if (!nearby) return null
  const confidence = nearby.anchor.confidence * (0.55 + 0.25 * (1 - nearby.distance / Math.max(maximumDistance, Number.EPSILON)))
  return {
    source: 'local-performed', scorePosition: { ...event.position }, globalPredictedMs,
    anchoredPerformedMs: nearby.anchor.performedMs, anchorOffsetFromGlobalMs: nearby.anchor.performedMs - globalPredictedMs,
    beforeExpectedGroupId: compareTime(nearby.anchor.position, event.position) < 0 ? nearby.anchor.expectedGroupId : null,
    afterExpectedGroupId: compareTime(nearby.anchor.position, event.position) > 0 ? nearby.anchor.expectedGroupId : null,
    matchedPerformedGroupIds: [nearby.anchor.performedGroupId], confidence,
  }
}

export function buildPedalTimingAnchor(
  event: PedalEvent,
  plan: ExpectedPerformancePlan,
  alignment: AlignmentResult,
  options: PedalAnalysisOptions,
): PedalTimingAnchor {
  return createPedalTimingAnchorResolver(plan, alignment, options)(event)
}

export function createPedalTimingAnchorResolver(
  plan: ExpectedPerformancePlan,
  alignment: AlignmentResult,
  options: PedalAnalysisOptions,
): (event: PedalEvent) => PedalTimingAnchor {
  const safeAnchors = safeCorrespondences(alignment, options)
  return (event) => {
    const globalPredictedMs = globalPrediction(event.position, plan, alignment)
    const compatibleAnchors = safeAnchors.filter((anchor) => anchor.pairedAttacks.some((attack) => notationLaneCompatible(event, attack)))
    const local = localAnchor(event, globalPredictedMs, compatibleAnchors, options)
    return local ?? {
      source: 'global-score-clock', scorePosition: { ...event.position }, globalPredictedMs,
      anchoredPerformedMs: globalPredictedMs, anchorOffsetFromGlobalMs: 0,
      beforeExpectedGroupId: null, afterExpectedGroupId: null, matchedPerformedGroupIds: [], confidence: 0.5,
    }
  }
}
