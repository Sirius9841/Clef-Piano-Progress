import type { RecordedKeyPress, RecordedMidiEvent, RecordingWarning } from './types'

interface MutableKeyPress {
  id: string
  channel: number
  note: number
  velocity: number
  attackSequence: number
  attackMs: number
  releaseSequence: number | null
  releaseMs: number | null
  releaseVelocity: number | null
}

function noteKey(channel: number, note: number): string {
  return `${channel}:${note}`
}

export function deriveKeyPresses(events: readonly RecordedMidiEvent[]): { keyPresses: RecordedKeyPress[]; warnings: RecordingWarning[] } {
  const keyPresses: MutableKeyPress[] = []
  const openByPitch = new Map<string, MutableKeyPress[]>()
  const warnings: RecordingWarning[] = []

  for (const recorded of events) {
    const event = recorded.event
    if (event.type === 'note-on') {
      const keyPress: MutableKeyPress = {
        id: `key-press:${recorded.sequence}`,
        channel: event.channel,
        note: event.note,
        velocity: event.velocity,
        attackSequence: recorded.sequence,
        attackMs: recorded.relativeMs,
        releaseSequence: null,
        releaseMs: null,
        releaseVelocity: null,
      }
      keyPresses.push(keyPress)
      const key = noteKey(event.channel, event.note)
      const queue = openByPitch.get(key)
      if (queue) queue.push(keyPress)
      else openByPitch.set(key, [keyPress])
      continue
    }

    if (event.type === 'note-off') {
      const key = noteKey(event.channel, event.note)
      const queue = openByPitch.get(key)
      const keyPress = queue?.shift()
      if (!keyPress) {
        warnings.push({ code: 'ORPHAN_NOTE_OFF', sequence: recorded.sequence, message: `Note Off ${event.note} on channel ${event.channel + 1} has no earlier unmatched Note On.` })
        continue
      }
      keyPress.releaseSequence = recorded.sequence
      keyPress.releaseMs = recorded.relativeMs
      keyPress.releaseVelocity = event.velocity
      if (queue?.length === 0) openByPitch.delete(key)
    }
  }

  return { keyPresses, warnings }
}
