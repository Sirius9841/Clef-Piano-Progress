import { describe, expect, it } from 'vitest'
import { PerformanceRecorder, type RecorderEnvironment } from '../performance/recorder'
import { RecordingDeviceLifecycle } from '../performance/recordingDeviceLifecycle'
import { INITIAL_MIDI_RUNTIME_STATE, reduceMidiRuntimeState, type MidiRuntimeState } from './runtimeState'
import { WebMidiService } from './WebMidiService'

class FakeMidiInput {
  readonly name: string
  readonly manufacturer = 'Tests'
  state: MIDIPortDeviceState = 'connected'
  onmidimessage: ((event: MIDIMessageEvent) => void) | null = null
  rejectClose = false
  private closeBarrier: Promise<void> | null = null
  private releaseClose: (() => void) | null = null

  constructor(readonly id = 'piano-1') {
    this.name = `Test Piano ${id}`
  }

  async open(): Promise<MIDIPort> { return this as unknown as MIDIPort }
  async close(): Promise<MIDIPort> {
    if (this.rejectClose) throw new Error('Driver rejected close')
    await this.closeBarrier
    return this as unknown as MIDIPort
  }
  deferClose(): void {
    this.closeBarrier = new Promise((resolve) => { this.releaseClose = resolve })
  }
  resolveClose(): void {
    this.releaseClose?.()
    this.releaseClose = null
    this.closeBarrier = null
  }
  emit(data: readonly number[], timeStamp: number): void {
    this.onmidimessage?.({ data: Uint8Array.from(data), timeStamp } as unknown as MIDIMessageEvent)
  }
}

class FakeMidiAccess {
  readonly input = new FakeMidiInput()
  readonly inputMap = new Map<string, FakeMidiInput>([[this.input.id, this.input]])
  readonly inputs = this.inputMap as unknown as MIDIInputMap
  onstatechange: ((event: MIDIConnectionEvent) => void) | null = null

  addInput(id: string): FakeMidiInput {
    const input = new FakeMidiInput(id)
    this.inputMap.set(id, input)
    return input
  }

  emitStateChange(): void {
    this.onstatechange?.({ port: this.input } as unknown as MIDIConnectionEvent)
  }
}

describe('WebMidiService lifecycle', () => {
  it('reports a missing Web MIDI API without affecting non-MIDI application state', async () => {
    const service = new WebMidiService(null)
    expect(service.isSupported).toBe(false)
    await expect(service.requestAccess()).rejects.toThrow('not supported')
    expect(service.getDevices()).toEqual([])
  })

  it('surfaces denied MIDI access and remains safe to retry', async () => {
    let requests = 0
    const service = new WebMidiService(async () => { requests += 1; throw new DOMException('Permission denied', 'NotAllowedError') })
    await expect(service.requestAccess()).rejects.toThrow('Permission denied')
    await expect(service.requestAccess()).rejects.toThrow('Permission denied')
    expect(requests).toBe(2)
    expect(service.getDevices()).toEqual([])
  })
  it('detaches locally when close rejects and can select a replacement device', async () => {
    const access = new FakeMidiAccess()
    const replacement = access.addInput('piano-2')
    const service = new WebMidiService(async () => access as unknown as MIDIAccess)
    const events: number[] = []
    service.subscribeToEvents((event) => { if (event.type === 'note-on') events.push(event.note) })
    await service.requestAccess()
    await service.selectInput(access.input.id)
    access.input.emit([0x90, 60, 90], 10)
    access.input.rejectClose = true

    await expect(service.selectInput(null)).resolves.toBeUndefined()
    access.input.emit([0x90, 61, 90], 20)
    await service.selectInput(replacement.id)
    replacement.emit([0x90, 62, 90], 30)
    expect(events).toEqual([60, 62])
  })

  it('does not let a slow stale teardown clear a newer selection', async () => {
    const access = new FakeMidiAccess()
    const replacement = access.addInput('piano-2')
    const service = new WebMidiService(async () => access as unknown as MIDIAccess)
    const events: number[] = []
    service.subscribeToEvents((event) => { if (event.type === 'note-on') events.push(event.note) })
    await service.requestAccess()
    await service.selectInput(access.input.id)
    access.input.deferClose()

    const staleTeardown = service.selectInput(null)
    await service.selectInput(replacement.id)
    replacement.emit([0x90, 64, 90], 40)
    access.input.resolveClose()
    await staleTeardown
    replacement.emit([0x90, 65, 90], 50)
    expect(events).toEqual([64, 65])
  })

  it('detaches an earlier access object when access is requested again', async () => {
    const first = new FakeMidiAccess()
    const second = new FakeMidiAccess()
    let requestCount = 0
    const service = new WebMidiService(async () => (++requestCount === 1 ? first : second) as unknown as MIDIAccess)
    await service.requestAccess()
    await service.requestAccess()
    expect(first.onstatechange).toBeNull()
    expect(second.onstatechange).not.toBeNull()
    await service.dispose()
    expect(second.onstatechange).toBeNull()
  })

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
    const stopped = lifecycle.reconcile(runtime.selectedDeviceId, recorder).recording
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
