import { describe, expect, it } from 'vitest'
import type { MidiDevice } from './types'
import { INITIAL_MIDI_RUNTIME_STATE, reduceMidiRuntimeState } from './runtimeState'

const connected: MidiDevice = { id: 'piano-1', name: 'Test Piano', manufacturer: 'Tests', state: 'connected' }

function selectedState() {
  let state = reduceMidiRuntimeState(INITIAL_MIDI_RUNTIME_STATE, { type: 'devices-changed', devices: [connected] })
  state = reduceMidiRuntimeState(state, { type: 'selection-changed', deviceId: connected.id })
  state = reduceMidiRuntimeState(state, { type: 'event-received', event: { type: 'note-on', note: 60, velocity: 90, channel: 0, timestampMs: 1 } })
  return reduceMidiRuntimeState(state, { type: 'event-received', event: { type: 'sustain', down: true, value: 127, channel: 0, timestampMs: 2 } })
}

describe('MIDI runtime connection state', () => {
  it('clears selection, active keys, and sustain when the selected device disappears', () => {
    const state = reduceMidiRuntimeState(selectedState(), { type: 'devices-changed', devices: [] })
    expect(state).toMatchObject({ selectedDeviceId: null, activeNotes: [], sustainDown: false, disconnectError: 'The selected MIDI input was disconnected.' })
  })

  it('treats a same-ID disconnected device as a real disconnect', () => {
    const state = reduceMidiRuntimeState(selectedState(), { type: 'devices-changed', devices: [{ ...connected, state: 'disconnected' }] })
    expect(state).toMatchObject({ selectedDeviceId: null, activeNotes: [], sustainDown: false })
    expect(state.devices[0]).toMatchObject({ id: connected.id, state: 'disconnected' })
  })
})
