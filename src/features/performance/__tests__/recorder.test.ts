import { describe, expect, it } from 'vitest'
import type { MidiEvent } from '../../midi/types'
import { PerformanceRecorder, type RecorderEnvironment } from '../recorder'
import type { InitialSustainState } from '../types'

function harness(start = 1_000) {
  let now = start
  let id = 0
  const environment: RecorderEnvironment = {
    monotonicNow: () => now,
    wallClockNow: () => new Date('2026-08-20T12:00:00.000Z'),
    createId: () => `take-${++id}`,
  }
  const recorder = new PerformanceRecorder(environment)
  const setNow = (value: number) => { now = value }
  const startRecording = (initialSustain?: InitialSustainState) => recorder.start({
    device: { id: 'midi-1', name: 'Test Piano', manufacturer: 'Tests' },
    practiceContext: { expectedPerformancePlanId: 'plan-1', includedPartIds: ['P1'], speedMultiplier: 0.75 },
    initialSustain,
  })
  return { recorder, setNow, startRecording }
}

function on(timestampMs: number, note = 60, velocity = 80, channel = 0): MidiEvent {
  return { type: 'note-on', timestampMs, channel, note, velocity }
}

function off(timestampMs: number, note = 60, velocity = 20, channel = 0): MidiEvent {
  return { type: 'note-off', timestampMs, channel, note, velocity }
}

describe('PerformanceRecorder', () => {
  it.each([
    ['unknown', undefined, { observed: false, down: null, value: null }],
    ['known up', { observed: true, down: false, value: 0 }, { observed: true, down: false, value: 0 }],
    ['known down with intermediate value', { observed: true, down: true, value: 96 }, { observed: true, down: true, value: 96 }],
  ] as const)('freezes %s initial sustain context into the take', (_label, initialSustain, expected) => {
    const { recorder, setNow, startRecording } = harness()
    startRecording(initialSustain)
    recorder.capture(on(1_050))
    setNow(1_100)
    const recording = recorder.stop()!
    expect(recording.initialSustain).toEqual(expected)
    expect(Object.isFrozen(recording.initialSustain)).toBe(true)
  })
  it('moves through idle, armed, recording, and an immutable stopped snapshot', () => {
    const { recorder, setNow, startRecording } = harness()
    expect(recorder.state.status).toBe('idle')
    startRecording()
    expect(recorder.state).toMatchObject({ status: 'armed', recordingId: 'take-1' })
    recorder.capture(on(1_015))
    expect(recorder.state).toMatchObject({ status: 'recording', recordingId: 'take-1', eventCount: 1, startedAtMonotonicMs: 1_015 })
    setNow(1_300)
    const recording = recorder.stop()!

    expect(recorder.state.status).toBe('stopped')
    expect(recording.startedAt).toBe('2026-08-20T12:00:00.000Z')
    expect(recording.durationMs).toBe(285)
    expect(Object.isFrozen(recording)).toBe(true)
    expect(Object.isFrozen(recording.practiceContext.includedPartIds)).toBe(true)
    expect(recorder.capture(off(1_400))).toBe(false)
    expect(recording.events).toHaveLength(1)
  })

  it('calculates relative timestamps and preserves equal-time arrival order', () => {
    const { recorder, setNow, startRecording } = harness()
    startRecording()
    recorder.capture(on(1_015, 60))
    recorder.capture(on(1_015, 64))
    recorder.capture(off(1_280, 60))
    setNow(1_300)
    const recording = recorder.stop()!

    expect(recording.events.map(({ sequence, relativeMs, event }) => [sequence, relativeMs, event.type === 'sustain' ? -1 : event.note])).toEqual([
      [0, 0, 60], [1, 0, 64], [2, 265, 60],
    ])
  })

  it('ignores pre-start events instead of clamping them', () => {
    const { recorder, startRecording } = harness()
    startRecording()
    expect(recorder.capture(on(999))).toBe(false)
    expect(recorder.stop()).toBeNull()
    expect(recorder.state.status).toBe('idle')
  })

  it('keeps elapsed musical time at zero while armed and starts only on Note On', () => {
    const { recorder, setNow, startRecording } = harness()
    startRecording()
    expect(recorder.capture(off(1_050))).toBe(false)
    expect(recorder.capture({ type: 'sustain', timestampMs: 1_100, channel: 0, down: true, value: 96 })).toBe(false)
    setNow(9_000)
    expect(recorder.state.status).toBe('armed')
    expect(recorder.capture(on(9_000))).toBe(true)
    setNow(9_250)
    const recording = recorder.stop()!

    expect(recording.events[0]).toMatchObject({ relativeMs: 0, event: { type: 'note-on' } })
    expect(recording.durationMs).toBe(250)
    expect(recording.initialSustain).toEqual({ observed: true, down: true, value: 96 })
    expect(recording.statistics.sustainChangeCount).toBe(0)
  })

  it('cancels safely while armed and on an armed device disconnect', () => {
    const { recorder, startRecording } = harness()
    startRecording()
    expect(recorder.stop()).toBeNull()
    expect(recorder.state.status).toBe('idle')
    startRecording()
    expect(recorder.handleDeviceDisconnect()).toBeNull()
    expect(recorder.state.status).toBe('idle')
  })

  it('pairs repeated same-channel pitches FIFO and keeps other channels independent', () => {
    const { recorder, setNow, startRecording } = harness()
    startRecording()
    ;[on(1_010), on(1_020), on(1_025, 60, 90, 1), off(1_030), off(1_040), off(1_050, 60, 10, 1)].forEach((event) => recorder.capture(event))
    setNow(1_060)
    const recording = recorder.stop()!

    expect(recording.keyPresses.map((press) => [press.attackMs, press.releaseMs, press.channel])).toEqual([
      [0, 20, 0], [10, 30, 0], [15, 40, 1],
    ])
  })

  it('leaves open keys open and reports orphan releases without fabricating presses', () => {
    const { recorder, setNow, startRecording } = harness()
    startRecording()
    recorder.capture(on(1_020, 60))
    recorder.capture(off(1_030, 62))
    setNow(1_100)
    const recording = recorder.stop()!

    expect(recording.keyPresses).toHaveLength(1)
    expect(recording.keyPresses[0]?.releaseMs).toBeNull()
    expect(recording.statistics).toMatchObject({ openNoteCount: 1, orphanReleaseCount: 1, noteReleaseCount: 0 })
    expect(recording.warnings[0]?.code).toBe('ORPHAN_NOTE_OFF')
  })

  it('records sustain changes without extending physical key releases', () => {
    const { recorder, setNow, startRecording } = harness()
    startRecording()
    recorder.capture(on(1_010))
    recorder.capture({ type: 'sustain', timestampMs: 1_020, channel: 0, down: true, value: 127 })
    recorder.capture(off(1_030))
    recorder.capture({ type: 'sustain', timestampMs: 1_090, channel: 0, down: false, value: 0 })
    setNow(1_100)
    const recording = recorder.stop()!

    expect(recording.keyPresses[0]?.releaseMs).toBe(20)
    expect(recording.statistics.sustainChangeCount).toBe(2)
    expect(recording.initialSustain).toEqual({ observed: false, down: null, value: null })
  })

  it('stops safely with disconnect context and preserves captured statistics', () => {
    const { recorder, setNow, startRecording } = harness()
    startRecording()
    recorder.capture(on(1_010, 60, 40))
    recorder.capture(on(1_020, 64, 80))
    recorder.capture(off(1_030, 60))
    setNow(1_050)
    const recording = recorder.handleDeviceDisconnect()!

    expect(recording.stopReason).toBe('device-disconnected')
    expect(recording.statistics).toEqual({
      eventCount: 3,
      noteAttackCount: 2,
      noteReleaseCount: 1,
      uniquePitchCount: 2,
      velocity: { minimum: 40, maximum: 80, average: 60 },
      sustainChangeCount: 0,
      openNoteCount: 1,
      orphanReleaseCount: 0,
    })
  })

  it('creates a fresh buffer and identity for another take', () => {
    const { recorder, setNow, startRecording } = harness()
    startRecording()
    recorder.capture(on(1_010))
    setNow(1_020)
    const first = recorder.stop()!
    setNow(2_000)
    startRecording()
    recorder.capture(on(2_010))
    setNow(2_020)
    const second = recorder.stop()!

    expect(first.id).toBe('take-1')
    expect(second.id).toBe('take-2')
    expect(second.events).toHaveLength(1)
    expect(first.events).toHaveLength(1)
  })

  it('preserves 2+ hour timestamps, large event collections, and late sustain without truncation', () => {
    const start = 50_000_000
    const { recorder, setNow, startRecording } = harness(start)
    startRecording()
    const pairCount = 2_000
    for (let index = 0; index < pairCount; index += 1) {
      const attack = start + index * 4_000
      recorder.capture(on(attack, 48 + index % 36, 40 + index % 80))
      recorder.capture(off(attack + 320, 48 + index % 36))
    }
    const latePedalDown = start + 7_500_000
    const latePedalUp = latePedalDown + 12_345
    recorder.capture({ type: 'sustain', timestampMs: latePedalDown, channel: 0, down: true, value: 111 })
    recorder.capture({ type: 'sustain', timestampMs: latePedalUp, channel: 0, down: false, value: 7 })
    setNow(start + 8_000_123)
    const recording = recorder.stop()!

    expect(recording.durationMs).toBe(8_000_123)
    expect(recording.events).toHaveLength(pairCount * 2 + 2)
    expect(recording.events.at(-1)).toMatchObject({ sequence: pairCount * 2 + 1, relativeMs: 7_512_345, event: { type: 'sustain', value: 7 } })
    expect(recording.statistics).toMatchObject({ eventCount: pairCount * 2 + 2, noteAttackCount: pairCount, noteReleaseCount: pairCount, sustainChangeCount: 2 })
  })
})
