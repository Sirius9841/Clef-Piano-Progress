import { describe, expect, it } from 'vitest'
import { makeRecording } from '../../alignment/__tests__/fixtures'
import type { PerformanceRecording } from '../../performance/types'
import { buildPedalTimeline } from '../buildPedalTimeline'
import { pedalStateAt } from '../damperHold'

function recording(values: readonly { ms: number; value: number; channel?: number }[], initial?: PerformanceRecording['initialSustain']): PerformanceRecording {
  const base = makeRecording([{ midi: 60, ms: 100 }])
  return {
    ...base,
    durationMs: 1_000,
    initialSustain: initial,
    events: values.map((sample, sequence) => ({ sequence, relativeMs: sample.ms, event: { type: 'sustain' as const, channel: sample.channel ?? 0, value: sample.value, down: sample.value >= 64, timestampMs: sample.ms } })),
    statistics: { ...base.statistics, eventCount: values.length, sustainChangeCount: values.length },
  }
}

describe('performed pedal timeline', () => {
  it('preserves every raw value and collapses threshold-stable samples to effective transitions', () => {
    const result = buildPedalTimeline(recording([{ ms: 100, value: 64 }, { ms: 110, value: 80 }, { ms: 120, value: 100 }, { ms: 130, value: 127 }, { ms: 140, value: 90 }, { ms: 150, value: 70 }, { ms: 160, value: 63 }]))
    expect(result.rawSamples.map((sample) => sample.value)).toEqual([64, 80, 100, 127, 90, 70, 63])
    expect(result.transitions.map((transition) => [transition.kind, transition.relativeMs])).toEqual([['down', 100], ['up', 160]])
    expect(result.controllerEvidence).toMatchObject({ mode: 'continuous-evidence', rawSampleCount: 7, downTransitionCount: 1, upTransitionCount: 1, intermediateValueCount: 6 })
  })

  it('preserves equal-timestamp arrival order and distinguishes known and unknown initial state', () => {
    const unknown = buildPedalTimeline(recording([{ ms: 10, value: 127 }, { ms: 10, value: 0 }]))
    expect(unknown.transitions.map((transition) => transition.sequence)).toEqual([0, 1])
    expect(unknown.controllerEvidence).toMatchObject({ initialStateKnown: false, knownStateCoverage: 0.99 })
    const known = buildPedalTimeline(recording([], { observed: true, down: false, value: 0 }))
    expect(known.controllerEvidence).toMatchObject({ mode: 'binary-like', initialStateKnown: true, initialDown: false, knownStateCoverage: 1 })
  })

  it('keeps legacy recordings without initial state unknown', () => {
    expect(buildPedalTimeline(recording([])).controllerEvidence).toMatchObject({ mode: 'unknown', initialStateKnown: false, knownStateCoverage: null })
  })

  it('retains channels and tracks effective state independently per channel', () => {
    const timeline = buildPedalTimeline(recording([
      { ms: 100, value: 127, channel: 0 },
      { ms: 110, value: 127, channel: 1 },
      { ms: 200, value: 0, channel: 0 },
    ]))
    expect(timeline.transitions.map((item) => [item.kind, item.channel])).toEqual([['down', 0], ['down', 1], ['up', 0]])
    expect(timeline.controllerEvidence).toMatchObject({ channelMode: 'multi-channel-ambiguous', channels: [0, 1], authoritativeChannel: null })
    expect(pedalStateAt(timeline, 250, 0)).toBe(false)
    expect(pedalStateAt(timeline, 250, 1)).toBe(true)
  })
})
