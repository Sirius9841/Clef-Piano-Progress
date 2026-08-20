const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'] as const
const BLACK_KEY_CLASSES = new Set([1, 3, 6, 8, 10])

export const PIANO_LOW_NOTE = 21
export const PIANO_HIGH_NOTE = 108

export function midiNoteName(note: number): string {
  if (!Number.isInteger(note) || note < 0 || note > 127) return `MIDI ${note}`
  const name = NOTE_NAMES[note % 12]
  return `${name}${Math.floor(note / 12) - 1}`
}

export function isBlackKey(note: number): boolean {
  return BLACK_KEY_CLASSES.has(note % 12)
}

export function createPianoNotes(): number[] {
  return Array.from({ length: PIANO_HIGH_NOTE - PIANO_LOW_NOTE + 1 }, (_, index) => PIANO_LOW_NOTE + index)
}
