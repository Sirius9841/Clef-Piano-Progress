import { describe, expect, it } from 'vitest'
import type { MidiEvent } from '../../midi/types'
import { PerformanceRecorder, type RecorderEnvironment } from '../recorder'

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
  const startRecording = () => recorder.start({
    device: { id: 'midi-1', name: 'Test Piano', manufacturer: 'Tests' },
    practiceContext: { expectedPerformancePlanId: 'plan-1', includedPartIds: ['P1'], speedMultiplier: 0.75 },
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
  it('moves through idle, recording, and an immutable stopped snapshot', () => {
    const { recorder, setNow, startRecording } = harness()
    expect(recorder.state.status).toBe('idle')
    startRecording()
    expect(recorder.state).toMatchObject({ status: 'recording', recordingId: 'take-1', eventCount: 0 })
    recorder.capture(on(1_015))
    setNow(1_300)
    const recording = recorder.stop()!

    expect(recorder.state.status).toBe('stopped')
    expect(recording.startedAt).toBe('2026-08-20T12:00:00.000Z')
    expect(recording.durationMs).toBe(300)
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
      [0, 15, 60], [1, 15, 64], [2, 280, 60],
    ])
  })

  it('ignores pre-start events instead of clamping them', () => {
    const { recorder, startRecording } = harness()
    startRecording()
    expect(recorder.capture(on(999))).toBe(false)
    expect(recorder.stop()?.events).toHaveLength(0)
  })

  it('pairs repeated same-channel pitches FIFO and keeps other channels independent', () => {
    const { recorder, setNow, startRecording } = harness()
    startRecording()
    ;[on(1_010), on(1_020), on(1_025, 60, 90, 1), off(1_030), off(1_040), off(1_050, 60, 10, 1)].forEach((event) => recorder.capture(event))
    setNow(1_060)
    const recording = recorder.stop()!

    expect(recording.keyPresses.map((press) => [press.attackMs, press.releaseMs, press.channel])).toEqual([
      [10, 30, 0], [20, 40, 0], [25, 50, 1],
    ])
  })

  it('leaves open keys open and reports orphan releases without fabricating presses', () => {
    const { recorder, setNow, startRecording } = harness()
    startRecording()
    recorder.capture(off(1_010, 62))
    recorder.capture(on(1_020, 60))
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

    expect(recording.keyPresses[0]?.releaseMs).toBe(30)
    expect(recording.statistics.sustainChangeCount).toBe(2)
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
    setNow(2_010)
    const second = recorder.stop()!

    expect(first.id).toBe('take-1')
    expect(second.id).toBe('take-2')
    expect(second.events).toHaveLength(0)
    expect(first.events).toHaveLength(1)
  })
})
