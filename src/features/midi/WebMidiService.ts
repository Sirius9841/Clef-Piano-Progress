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
  private deviceListeners = new Set<DeviceListener>()
  private eventListeners = new Set<EventListener>()

  constructor(private readonly requestMidiAccess: MidiAccessRequester | null = defaultMidiAccessRequester()) {}

  get isSupported(): boolean {
    return this.requestMidiAccess !== null
  }

  async requestAccess(): Promise<MidiDevice[]> {
    if (!this.requestMidiAccess) throw new Error('Web MIDI is not supported in this browser.')
    this.access = await this.requestMidiAccess({ sysex: false })
    this.access.onstatechange = () => {
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
    if (this.selectedInput) {
      this.selectedInput.onmidimessage = null
      await this.selectedInput.close()
      this.selectedInput = null
    }

    if (!deviceId || !this.access) return
    const input = this.access.inputs.get(deviceId)
    if (!input || input.state !== 'connected') throw new Error('The selected MIDI input is no longer available.')

    await input.open()
    input.onmidimessage = (message) => {
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
    await this.selectInput(null)
    if (this.access) this.access.onstatechange = null
    this.access = null
  }

  private emitDevices(devices: MidiDevice[]): void {
    this.deviceListeners.forEach((listener) => listener(devices))
  }
}
