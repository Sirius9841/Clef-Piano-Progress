import { createContext, useContext } from 'react'
import type { ActiveNote, MidiAccessState, MidiDevice, MidiEvent } from './types'

export interface MidiContextValue {
  supported: boolean
  accessState: MidiAccessState
  devices: MidiDevice[]
  selectedDeviceId: string | null
  selectedDevice: MidiDevice | null
  activeNotes: ActiveNote[]
  sustainDown: boolean
  recentEvents: MidiEvent[]
  error: string | null
  requestAccess: () => Promise<void>
  selectDevice: (id: string | null) => Promise<void>
  clearEvents: () => void
}

export const MidiContext = createContext<MidiContextValue | null>(null)

export function useMidi(): MidiContextValue {
  const context = useContext(MidiContext)
  if (!context) throw new Error('useMidi must be used inside MidiProvider')
  return context
}
