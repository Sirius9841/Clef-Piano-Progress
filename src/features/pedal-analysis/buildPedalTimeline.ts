import type { PerformanceRecording } from '../performance/types'
import type { PedalControllerEvidence, PedalTimeline, PedalTransition } from './types'

export function buildPedalTimeline(recording: PerformanceRecording): PedalTimeline {
  const rawSamples = recording.events.flatMap((item) => item.event.type === 'sustain' ? [{
    id: `pedal-sample:${item.sequence}`,
    sequence: item.sequence,
    relativeMs: item.relativeMs,
    channel: item.event.channel,
    value: item.event.value,
    down: item.event.down,
  }] : []).sort((left, right) => left.relativeMs - right.relativeMs || left.sequence - right.sequence)
  const initial = recording.initialSustain
  let known = initial?.observed === true && initial.down !== null
  let state: boolean | null = known ? initial!.down : null
  let knownFromMs = known ? 0 : null
  let knownDurationMs = 0
  const transitions: PedalTransition[] = []
  for (const sample of rawSamples) {
    if (!known) {
      known = true
      knownFromMs = sample.relativeMs
    }
    if ((state === null && sample.down) || (state !== null && state !== sample.down)) transitions.push({
      id: `pedal-transition:${sample.sequence}`,
      kind: sample.down ? 'down' : 'up',
      relativeMs: sample.relativeMs,
      sequence: sample.sequence,
      value: sample.value,
      sourceSampleId: sample.id,
    })
    state = sample.down
  }
  if (knownFromMs !== null) knownDurationMs = Math.max(0, recording.durationMs - knownFromMs)
  const values = rawSamples.map((sample) => sample.value)
  const intermediateValueCount = values.filter((value) => value !== 0 && value !== 127).length
  const mode = rawSamples.length === 0 && !initial?.observed ? 'unknown' : intermediateValueCount > 0 ? 'continuous-evidence' : 'binary-like'
  const controllerEvidence: PedalControllerEvidence = {
    mode,
    initialStateKnown: initial?.observed === true && initial.down !== null,
    initialDown: initial?.observed === true ? initial.down : null,
    initialValue: initial?.observed === true ? initial.value : null,
    rawSampleCount: rawSamples.length,
    downTransitionCount: transitions.filter((transition) => transition.kind === 'down').length,
    upTransitionCount: transitions.filter((transition) => transition.kind === 'up').length,
    distinctValueCount: new Set(values).size,
    intermediateValueCount,
    knownStateDurationMs: knownDurationMs,
    knownStateCoverage: !known ? null : recording.durationMs > 0 ? knownDurationMs / recording.durationMs : 1,
    extraUnassignedTransitionCount: 0,
  }
  return { rawSamples, transitions, controllerEvidence }
}
