import type { MidiEvent } from './types'

const NOTE_OFF = 0x80
const NOTE_ON = 0x90
const CONTROL_CHANGE = 0xb0
const SUSTAIN_CONTROLLER = 64
const SUSTAIN_THRESHOLD = 64

function monotonicNow(): number {
  return globalThis.performance?.now() ?? 0
}

export function parseMidiMessage(data: ArrayLike<number>, timestampMs = monotonicNow()): MidiEvent | null {
  if (data.length < 2) return null

  const status = data[0]
  const data1 = data[1]
  if (status === undefined || data1 === undefined || status < 0x80) return null

  const command = status & 0xf0
  const channel = status & 0x0f

  if (command === NOTE_ON || command === NOTE_OFF) {
    const velocity = data[2]
    if (velocity === undefined || data1 > 127 || velocity > 127) return null

    if (command === NOTE_OFF || velocity === 0) {
      return { type: 'note-off', channel, note: data1, velocity, timestampMs }
    }

    return { type: 'note-on', channel, note: data1, velocity, timestampMs }
  }

  if (command === CONTROL_CHANGE) {
    const value = data[2]
    if (value === undefined || data1 !== SUSTAIN_CONTROLLER || value > 127) return null
    return { type: 'sustain', channel, down: value >= SUSTAIN_THRESHOLD, value, timestampMs }
  }

  return null
}
