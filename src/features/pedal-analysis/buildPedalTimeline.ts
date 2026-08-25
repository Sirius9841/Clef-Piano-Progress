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
  const ccChannels = [...new Set(rawSamples.map((sample) => sample.channel))].sort((left, right) => left - right)
  const keyChannels = [...new Set(recording.keyPresses.map((press) => press.channel))].sort((left, right) => left - right)
  const channelMode = ccChannels.length > 1 ? 'multi-channel-ambiguous' : ccChannels.length === 1 || (ccChannels.length === 0 && initial?.observed && keyChannels.length === 1) ? 'single-channel' : 'none'
  const authoritativeChannel = channelMode === 'single-channel' ? ccChannels[0] ?? keyChannels[0] ?? null : null
  const initialStateKnown = initial?.observed === true && initial.down !== null && authoritativeChannel !== null
  const stateByChannel = new Map<number, boolean | null>()
  const knownFromMsByChannel = new Map<number, number>()
  if (initialStateKnown) {
    stateByChannel.set(authoritativeChannel, initial!.down)
    knownFromMsByChannel.set(authoritativeChannel, 0)
  }
  const transitions: PedalTransition[] = []
  for (const sample of rawSamples) {
    const state = stateByChannel.get(sample.channel) ?? null
    if (!knownFromMsByChannel.has(sample.channel)) knownFromMsByChannel.set(sample.channel, sample.relativeMs)
    if ((state === null && sample.down) || (state !== null && state !== sample.down)) transitions.push({
      id: `pedal-transition:${sample.sequence}`,
      kind: sample.down ? 'down' : 'up',
      relativeMs: sample.relativeMs,
      sequence: sample.sequence,
      value: sample.value,
      channel: sample.channel,
      sourceSampleId: sample.id,
    })
    stateByChannel.set(sample.channel, sample.down)
  }
  const knownFromMs = authoritativeChannel === null ? null : knownFromMsByChannel.get(authoritativeChannel) ?? null
  const knownDurationMs = knownFromMs === null ? 0 : Math.max(0, recording.durationMs - knownFromMs)
  const values = rawSamples.map((sample) => sample.value)
  const intermediateValueCount = values.filter((value) => value !== 0 && value !== 127).length
  const mode = rawSamples.length === 0 && !initial?.observed ? 'unknown' : intermediateValueCount > 0 ? 'continuous-evidence' : 'binary-like'
  const controllerEvidence: PedalControllerEvidence = {
    mode,
    initialStateKnown,
    initialDown: initialStateKnown ? initial!.down : null,
    initialValue: initialStateKnown ? initial!.value : null,
    rawSampleCount: rawSamples.length,
    downTransitionCount: transitions.filter((transition) => transition.kind === 'down').length,
    upTransitionCount: transitions.filter((transition) => transition.kind === 'up').length,
    distinctValueCount: new Set(values).size,
    intermediateValueCount,
    knownStateDurationMs: knownDurationMs,
    knownStateCoverage: knownFromMs === null ? null : recording.durationMs > 0 ? knownDurationMs / recording.durationMs : 1,
    extraUnassignedTransitionCount: 0,
    channelMode,
    channels: ccChannels,
    authoritativeChannel,
  }
  return { rawSamples, transitions, controllerEvidence }
}
