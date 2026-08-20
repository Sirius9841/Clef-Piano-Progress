export interface MidiDevice {
  id: string
  name: string
  manufacturer: string
  state: 'connected' | 'disconnected'
}

interface MidiEventBase {
  channel: number
  /** Monotonic, high-resolution timestamp in the browser performance clock domain. */
  timestampMs: number
}

export interface NoteOnEvent extends MidiEventBase {
  type: 'note-on'
  note: number
  velocity: number
}

export interface NoteOffEvent extends MidiEventBase {
  type: 'note-off'
  note: number
  velocity: number
}

export interface SustainEvent extends MidiEventBase {
  type: 'sustain'
  down: boolean
  value: number
}

export type MidiEvent = NoteOnEvent | NoteOffEvent | SustainEvent
export type MidiAccessState = 'idle' | 'requesting' | 'granted' | 'denied' | 'error'

export interface ActiveNote {
  note: number
  velocity: number
}
