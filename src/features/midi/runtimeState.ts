import type { ActiveNote, MidiDevice, MidiEvent } from './types'

export interface MidiRuntimeState {
  readonly devices: readonly MidiDevice[]
  readonly selectedDeviceId: string | null
  readonly activeNotes: readonly ActiveNote[]
  readonly sustainDown: boolean
  readonly sustainValue: number | null
  readonly sustainObserved: boolean
  readonly disconnectError: string | null
}

export type MidiRuntimeAction =
  | { readonly type: 'devices-changed'; readonly devices: readonly MidiDevice[] }
  | { readonly type: 'selection-changed'; readonly deviceId: string | null }
  | { readonly type: 'event-received'; readonly event: MidiEvent }

export const INITIAL_MIDI_RUNTIME_STATE: MidiRuntimeState = {
  devices: [],
  selectedDeviceId: null,
  activeNotes: [],
  sustainDown: false,
  sustainValue: null,
  sustainObserved: false,
  disconnectError: null,
}

export function reduceMidiRuntimeState(state: MidiRuntimeState, action: MidiRuntimeAction): MidiRuntimeState {
  if (action.type === 'devices-changed') {
    const selected = action.devices.find((device) => device.id === state.selectedDeviceId)
    const disconnected = state.selectedDeviceId !== null && selected?.state !== 'connected'
    return {
      ...state,
      devices: [...action.devices],
      ...(disconnected ? {
        selectedDeviceId: null,
        activeNotes: [],
        sustainDown: false,
        sustainValue: null,
        sustainObserved: false,
        disconnectError: 'The selected MIDI input was disconnected.',
      } : {}),
    }
  }
  if (action.type === 'selection-changed') {
    return { ...state, selectedDeviceId: action.deviceId, activeNotes: [], sustainDown: false, sustainValue: null, sustainObserved: false, disconnectError: null }
  }
  const event = action.event
  if (event.type === 'note-on') {
    return { ...state, activeNotes: [...state.activeNotes.filter((note) => note.note !== event.note), { note: event.note, velocity: event.velocity }] }
  }
  if (event.type === 'note-off') {
    return { ...state, activeNotes: state.activeNotes.filter((note) => note.note !== event.note) }
  }
  return { ...state, sustainDown: event.down, sustainValue: event.value, sustainObserved: true }
}
