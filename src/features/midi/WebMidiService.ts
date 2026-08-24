import { parseMidiMessage } from './parser'
import type { MidiDevice, MidiEvent } from './types'

type DeviceListener = (devices: MidiDevice[]) => void
type EventListener = (event: MidiEvent) => void
export type MidiAccessRequester = (options: MIDIOptions) => Promise<MIDIAccess>

function defaultMidiAccessRequester(): MidiAccessRequester | null {
  if (typeof navigator === 'undefined' || typeof navigator.requestMIDIAccess !== 'function') return null
  const request = navigator.requestMIDIAccess.bind(navigator)
  return (options) => request(options)
}

export class WebMidiService {
  private access: MIDIAccess | null = null
  private selectedInput: MIDIInput | null = null
  private accessOperation = 0
  private selectionOperation = 0
  private deviceListeners = new Set<DeviceListener>()
  private eventListeners = new Set<EventListener>()

  constructor(private readonly requestMidiAccess: MidiAccessRequester | null = defaultMidiAccessRequester()) {}

  get isSupported(): boolean {
    return this.requestMidiAccess !== null
  }

  async requestAccess(): Promise<MidiDevice[]> {
    if (!this.requestMidiAccess) throw new Error('Web MIDI is not supported in this browser.')
    const operation = ++this.accessOperation
    const access = await this.requestMidiAccess({ sysex: false })
    if (operation !== this.accessOperation) {
      if (this.access !== access) access.onstatechange = null
      return this.getDevices()
    }
    if (this.access && this.access !== access) this.access.onstatechange = null
    this.access = access
    access.onstatechange = () => {
      if (this.access !== access) return
      const devices = this.getDevices()
      if (this.selectedInput && !devices.some((device) => device.id === this.selectedInput?.id && device.state === 'connected')) {
        void this.selectInput(null).catch(() => { /* state change still clears the unavailable selection */ })
      }
      this.emitDevices(devices)
    }
    const devices = this.getDevices()
    this.emitDevices(devices)
    return devices
  }

  getDevices(): MidiDevice[] {
    if (!this.access) return []
    return Array.from(this.access.inputs.values()).map((input) => ({
      id: input.id,
      name: input.name || 'Unnamed MIDI input',
      manufacturer: input.manufacturer || 'Unknown manufacturer',
      state: input.state,
    }))
  }

  async selectInput(deviceId: string | null): Promise<void> {
    const operation = ++this.selectionOperation
    const previousInput = this.selectedInput
    this.selectedInput = null
    if (previousInput) {
      previousInput.onmidimessage = null
      try {
        await previousInput.close()
      } catch {
        // Local teardown is authoritative even when a browser or driver rejects close().
      }
    }

    if (operation !== this.selectionOperation || !deviceId || !this.access) return
    const selectedAccess = this.access
    const input = selectedAccess.inputs.get(deviceId)
    if (!input || input.state !== 'connected') throw new Error('The selected MIDI input is no longer available.')

    await input.open()
    if (operation !== this.selectionOperation || this.access !== selectedAccess) {
      input.onmidimessage = null
      try {
        await input.close()
      } catch {
        // A stale open cannot regain authority even if its compensating close fails.
      }
      return
    }
    input.onmidimessage = (message) => {
      if (this.selectedInput !== input) return
      if (!message.data) return
      const event = parseMidiMessage(message.data, message.timeStamp)
      if (event) this.eventListeners.forEach((listener) => listener(event))
    }
    this.selectedInput = input
  }

  subscribeToDevices(listener: DeviceListener): () => void {
    this.deviceListeners.add(listener)
    return () => this.deviceListeners.delete(listener)
  }

  subscribeToEvents(listener: EventListener): () => void {
    this.eventListeners.add(listener)
    return () => this.eventListeners.delete(listener)
  }

  async dispose(): Promise<void> {
    ++this.accessOperation
    const access = this.access
    this.access = null
    if (access) access.onstatechange = null
    await this.selectInput(null)
  }

  private emitDevices(devices: MidiDevice[]): void {
    this.deviceListeners.forEach((listener) => listener(devices))
  }
}
