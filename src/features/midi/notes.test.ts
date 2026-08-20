import { describe, expect, it } from 'vitest'
import { createPianoNotes, isBlackKey, midiNoteName } from './notes'

describe('piano note helpers', () => {
  it('creates the complete 88-key A0 to C8 range', () => {
    const notes = createPianoNotes()
    expect(notes).toHaveLength(88)
    expect(midiNoteName(notes[0] ?? -1)).toBe('A0')
    expect(midiNoteName(notes.at(-1) ?? -1)).toBe('C8')
  })

  it('identifies black keys', () => {
    expect(isBlackKey(61)).toBe(true)
    expect(isBlackKey(60)).toBe(false)
  })
})
