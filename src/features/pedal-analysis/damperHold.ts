import type { ExpressionAnalysisResult } from '../expression-analysis/types'
import type { PerformanceRecording } from '../performance/types'
import type { PedalTimeline, DamperHoldInterval, PedalInteraction } from './types'

export function pedalStateAt(timeline: PedalTimeline, relativeMs: number, channel: number): boolean | null {
  let state = timeline.controllerEvidence.initialStateKnown && timeline.controllerEvidence.authoritativeChannel === channel
    ? timeline.controllerEvidence.initialDown
    : null
  for (const sample of timeline.rawSamples) {
    if (sample.channel !== channel) continue
    if (sample.relativeMs > relativeMs) break
    state = sample.down
  }
  return state
}

export function buildDamperHolds(recording: PerformanceRecording, expression: ExpressionAnalysisResult, timeline: PedalTimeline): DamperHoldInterval[] {
  const presses = new Map(recording.keyPresses.map((press) => [press.id, press]))
  return expression.matchedObservations.flatMap((match) => {
    const press = presses.get(match.recordedKeyPressId)
    if (!press || press.releaseMs === null) return []
    const physicalReleaseMs = press.releaseMs
    const state = pedalStateAt(timeline, physicalReleaseMs, press.channel)
    const laterUp = state === true ? timeline.transitions.find((transition) => transition.channel === press.channel && transition.kind === 'up' && transition.relativeMs >= physicalReleaseMs) : undefined
    return [{
      id: `damper-hold:${press.id}`,
      matchedObservationId: match.id,
      recordedKeyPressId: press.id,
      channel: press.channel,
      physicalReleaseMs,
      damperReleaseMs: state === false ? physicalReleaseMs : laterUp?.relativeMs ?? null,
      pedalExtensionMs: state === false ? 0 : laterUp ? laterUp.relativeMs - physicalReleaseMs : null,
      pedalDownAtPhysicalRelease: state,
      openAtRecordingEnd: state === true && !laterUp,
    }]
  })
}

export function buildPedalInteractions(expression: ExpressionAnalysisResult, holds: readonly DamperHoldInterval[]): PedalInteraction[] {
  const holdByMatch = new Map(holds.map((hold) => [hold.matchedObservationId, hold]))
  const results: PedalInteraction[] = []
  for (const observation of expression.articulation.observations) {
    const target = expression.articulation.targets.find((candidate) => candidate.id === observation.targetId)
    if (!target) continue
    const extended = observation.matchedObservationIds.some((id) => (holdByMatch.get(id)?.pedalExtensionMs ?? 0) > 0 || holdByMatch.get(id)?.openAtRecordingEnd)
    if (!extended) continue
    if ((target.kind === 'staccato' || target.kind === 'staccatissimo') && observation.gateRatio !== null && observation.gateRatio <= 0.7) {
      results.push({ id: `pedal-interaction:${observation.id}:detached`, kind: 'pedal-connects-detached-keys', articulationTargetId: target.id, articulationObservationId: observation.id, matchedObservationIds: [...observation.matchedObservationIds], summary: 'Physical key detachment occurred while the damper pedal continued the note.' })
    } else if (target.kind === 'legato-transition' && (observation.transitionGapMs ?? 0) > 0) {
      results.push({ id: `pedal-interaction:${observation.id}:bridge`, kind: 'pedal-bridges-key-gap', articulationTargetId: target.id, articulationObservationId: observation.id, matchedObservationIds: [...observation.matchedObservationIds], summary: 'The damper pedal bridged a positive physical key gap in this slur transition.' })
    }
  }
  return results
}
