import { describe, expect, it } from 'vitest'
import { makeRecording } from '../../alignment/__tests__/fixtures'
import type { ExpressionAnalysisResult } from '../../expression-analysis/types'
import type { PerformanceRecording } from '../../performance/types'
import { buildPedalTimeline } from '../buildPedalTimeline'
import { buildDamperHolds, buildPedalInteractions } from '../damperHold'

function expression(): ExpressionAnalysisResult {
  return {
    matchedObservations: [{ id: 'match', recordedKeyPressId: 'key-press:0' }],
    articulation: {
      score: 0.91,
      targets: [{ id: 'detached', kind: 'staccato' }, { id: 'legato', kind: 'legato-transition' }],
      observations: [
        { id: 'detached-observation', targetId: 'detached', gateRatio: 0.5, transitionGapMs: null, matchedObservationIds: ['match'] },
        { id: 'legato-observation', targetId: 'legato', gateRatio: null, transitionGapMs: 40, matchedObservationIds: ['match'] },
      ],
    },
  } as unknown as ExpressionAnalysisResult
}

function recording(values: readonly { ms: number; value: number }[], initialDown = false): PerformanceRecording {
  const base = makeRecording([{ midi: 60, ms: 10 }])
  return {
    ...base,
    durationMs: 300,
    initialSustain: { observed: true, down: initialDown, value: initialDown ? 127 : 0 },
    keyPresses: [{ ...base.keyPresses[0]!, releaseMs: 100, releaseSequence: 10 }],
    events: values.map((sample, sequence) => ({ sequence, relativeMs: sample.ms, event: { type: 'sustain' as const, channel: 0, value: sample.value, down: sample.value >= 64, timestampMs: sample.ms } })),
  }
}

describe('controller-derived damper hold context', () => {
  it('returns zero extension when pedal is up at physical release', () => {
    const take = recording([])
    expect(buildDamperHolds(take, expression(), buildPedalTimeline(take))[0]).toMatchObject({ damperReleaseMs: 100, pedalExtensionMs: 0, pedalDownAtPhysicalRelease: false, openAtRecordingEnd: false })
  })

  it('uses the first later up and marks a down pedal without later release open', () => {
    const released = recording([{ ms: 50, value: 127 }, { ms: 220, value: 0 }])
    expect(buildDamperHolds(released, expression(), buildPedalTimeline(released))[0]).toMatchObject({ damperReleaseMs: 220, pedalExtensionMs: 120, openAtRecordingEnd: false })
    const open = recording([{ ms: 50, value: 127 }])
    expect(buildDamperHolds(open, expression(), buildPedalTimeline(open))[0]).toMatchObject({ damperReleaseMs: null, pedalExtensionMs: null, openAtRecordingEnd: true })
  })

  it('reports neutral detached-key and bridged-gap context without changing Articulation', () => {
    const snapshot = expression()
    const articulationScore = snapshot.articulation.score
    const take = recording([{ ms: 50, value: 127 }, { ms: 220, value: 0 }])
    const holds = buildDamperHolds(take, snapshot, buildPedalTimeline(take))
    expect(buildPedalInteractions(snapshot, holds).map((item) => item.kind)).toEqual(['pedal-connects-detached-keys', 'pedal-bridges-key-gap'])
    expect(snapshot.articulation.score).toBe(articulationScore)
  })
})
