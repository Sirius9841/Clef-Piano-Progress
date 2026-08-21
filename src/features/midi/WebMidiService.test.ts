import { describe, expect, it } from 'vitest'
import { PerformanceRecorder, type RecorderEnvironment } from '../performance/recorder'
import { RecordingDeviceLifecycle } from '../performance/recordingDeviceLifecycle'
import { INITIAL_MIDI_RUNTIME_STATE, reduceMidiRuntimeState, type MidiRuntimeState } from './runtimeState'
import { WebMidiService } from './WebMidiService'

class FakeMidiInput {
  readonly id = 'piano-1'
  readonly name = 'Test Piano'
  readonly manufacturer = 'Tests'
  state: MIDIPortDeviceState = 'connected'
  onmidimessage: ((event: MIDIMessageEvent) => void) | null = null

  async open(): Promise<MIDIPort> { return this as unknown as MIDIPort }
  async close(): Promise<MIDIPort> { return this as unknown as MIDIPort }
  emit(data: readonly number[], timeStamp: number): void {
    this.onmidimessage?.({ data: Uint8Array.from(data), timeStamp } as unknown as MIDIMessageEvent)
  }
}

class FakeMidiAccess {
  readonly input = new FakeMidiInput()
  readonly inputs = new Map([[this.input.id, this.input]]) as unknown as MIDIInputMap
  onstatechange: ((event: MIDIConnectionEvent) => void) | null = null

  emitStateChange(): void {
    this.onstatechange?.({ port: this.input } as unknown as MIDIConnectionEvent)
  }
}

describe('WebMidiService lifecycle', () => {
  it('disconnects a same-ID device, freezes the active take, and permits a fresh take after reconnect', async () => {
    const access = new FakeMidiAccess()
    const service = new WebMidiService(async () => access as unknown as MIDIAccess)
    let runtime: MidiRuntimeState = INITIAL_MIDI_RUNTIME_STATE
    let now = 1_000
    let recordingId = 0
    const environment: RecorderEnvironment = {
      monotonicNow: () => now,
      wallClockNow: () => new Date('2026-08-21T12:00:00.000Z'),
      createId: () => `take-${++recordingId}`,
    }
    const recorder = new PerformanceRecorder(environment)
    const lifecycle = new RecordingDeviceLifecycle()
    service.subscribeToDevices((devices) => { runtime = reduceMidiRuntimeState(runtime, { type: 'devices-changed', devices }) })
    service.subscribeToEvents((event) => {
      runtime = reduceMidiRuntimeState(runtime, { type: 'event-received', event })
      recorder.capture(event)
    })

    await service.requestAccess()
    await service.selectInput(access.input.id)
    runtime = reduceMidiRuntimeState(runtime, { type: 'selection-changed', deviceId: access.input.id })
    recorder.start({ device: { id: access.input.id, name: access.input.name, manufacturer: access.input.manufacturer }, practiceContext: { speedMultiplier: 0.75 } })
    lifecycle.attach(access.input.id)
    access.input.emit([0x90, 60, 90], 1_010)
    access.input.emit([0xb0, 64, 127], 1_020)
    expect(runtime).toMatchObject({ selectedDeviceId: 'piano-1', sustainDown: true })
    expect(runtime.activeNotes).toHaveLength(1)

    access.input.state = 'disconnected'
    now = 1_030
    access.emitStateChange()
    const stopped = lifecycle.reconcile(runtime.selectedDeviceId, recorder)
    expect(runtime).toMatchObject({ selectedDeviceId: null, activeNotes: [], sustainDown: false })
    expect(stopped).toMatchObject({ id: 'take-1', stopReason: 'device-disconnected' })

    access.input.emit([0x90, 64, 80], 1_040)
    expect(stopped?.events).toHaveLength(2)

    access.input.state = 'connected'
    access.emitStateChange()
    await service.selectInput(access.input.id)
    runtime = reduceMidiRuntimeState(runtime, { type: 'selection-changed', deviceId: access.input.id })
    now = 2_000
    recorder.start({ device: { id: access.input.id, name: access.input.name, manufacturer: access.input.manufacturer }, practiceContext: { speedMultiplier: 1 } })
    lifecycle.attach(access.input.id)
    access.input.emit([0x90, 67, 70], 2_010)
    now = 2_020
    const fresh = recorder.stop()
    lifecycle.clear()
    expect(fresh).toMatchObject({ id: 'take-2', stopReason: 'user' })
    expect(fresh?.events).toHaveLength(1)
    expect(stopped?.events).toHaveLength(2)
    await service.dispose()
  })
})
