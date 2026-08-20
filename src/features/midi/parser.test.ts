import { describe, expect, it } from 'vitest'
import { parseMidiMessage } from './parser'

describe('parseMidiMessage', () => {
  it('parses Note On and extracts velocity', () => {
    expect(parseMidiMessage([0x92, 60, 61], 100)).toEqual({
      type: 'note-on', channel: 2, note: 60, velocity: 61, receivedAt: 100,
    })
  })

  it('parses Note Off', () => {
    expect(parseMidiMessage([0x81, 64, 18], 101)).toEqual({
      type: 'note-off', channel: 1, note: 64, velocity: 18, receivedAt: 101,
    })
  })

  it('normalizes Note On with zero velocity to Note Off', () => {
    expect(parseMidiMessage([0x90, 67, 0], 102)).toMatchObject({ type: 'note-off', note: 67, velocity: 0 })
  })

  it('parses sustain pedal down', () => {
    expect(parseMidiMessage([0xb0, 64, 127], 103)).toMatchObject({ type: 'sustain', down: true, value: 127 })
  })

  it('parses sustain pedal up', () => {
    expect(parseMidiMessage([0xb0, 64, 0], 104)).toMatchObject({ type: 'sustain', down: false, value: 0 })
  })

  it('ignores unsupported and malformed messages safely', () => {
    expect(parseMidiMessage([0xe0, 0, 64])).toBeNull()
    expect(parseMidiMessage([0x90, 60])).toBeNull()
    expect(parseMidiMessage([])).toBeNull()
    expect(parseMidiMessage([0x01, 60, 80])).toBeNull()
  })
})
