import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { MidiContext, type MidiContextValue } from './MidiContext'
import { WebMidiService } from './WebMidiService'
import type { ActiveNote, MidiAccessState, MidiDevice, MidiEvent } from './types'
const MAX_RECENT_EVENTS = 12

export function MidiProvider({ children }: { children: ReactNode }) {
  const [service] = useState(() => new WebMidiService())

  const [accessState, setAccessState] = useState<MidiAccessState>('idle')
  const [devices, setDevices] = useState<MidiDevice[]>([])
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null)
  const [activeNotes, setActiveNotes] = useState<ActiveNote[]>([])
  const [sustainDown, setSustainDown] = useState(false)
  const [recentEvents, setRecentEvents] = useState<MidiEvent[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const unsubscribeDevices = service.subscribeToDevices((nextDevices) => {
      setDevices(nextDevices)
      setSelectedDeviceId((current) => {
        if (current && !nextDevices.some((device) => device.id === current)) {
          setError('The selected MIDI input was disconnected.')
          setActiveNotes([])
          setSustainDown(false)
          return null
        }
        return current
      })
    })
    const unsubscribeEvents = service.subscribeToEvents((event) => {
      setRecentEvents((current) => [event, ...current].slice(0, MAX_RECENT_EVENTS))
      if (event.type === 'note-on') {
        setActiveNotes((current) => [...current.filter((note) => note.note !== event.note), { note: event.note, velocity: event.velocity }])
      } else if (event.type === 'note-off') {
        setActiveNotes((current) => current.filter((note) => note.note !== event.note))
      } else {
        setSustainDown(event.down)
      }
    })

    return () => {
      unsubscribeDevices()
      unsubscribeEvents()
      void service.dispose()
    }
  }, [service])

  const requestAccess = useCallback(async () => {
    if (!service.isSupported) {
      setAccessState('error')
      setError('Web MIDI is unavailable. Use a Chromium-based desktop browser and a secure connection.')
      return
    }

    setAccessState('requesting')
    setError(null)
    try {
      const nextDevices = await service.requestAccess()
      setDevices(nextDevices)
      setAccessState('granted')
      if (nextDevices.length === 0) setError('MIDI access is ready, but no input devices were detected.')
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not access MIDI devices.'
      const denied = /denied|permission|security/i.test(message)
      setAccessState(denied ? 'denied' : 'error')
      setError(denied ? 'MIDI permission was denied. Allow MIDI access in your browser settings and try again.' : message)
    }
  }, [service])

  const selectDevice = useCallback(async (id: string | null) => {
    setError(null)
    setActiveNotes([])
    setSustainDown(false)
    try {
      await service.selectInput(id)
      setSelectedDeviceId(id)
    } catch (cause) {
      setSelectedDeviceId(null)
      setError(cause instanceof Error ? cause.message : 'Could not connect to the selected MIDI input.')
    }
  }, [service])

  const subscribeToEvents = useCallback((listener: (event: MidiEvent) => void) => service.subscribeToEvents(listener), [service])

  const selectedDevice = devices.find((device) => device.id === selectedDeviceId) ?? null
  const value = useMemo<MidiContextValue>(() => ({
    supported: service.isSupported,
    accessState,
    devices,
    selectedDeviceId,
    selectedDevice,
    activeNotes,
    sustainDown,
    recentEvents,
    error,
    requestAccess,
    selectDevice,
    subscribeToEvents,
    clearEvents: () => setRecentEvents([]),
  }), [accessState, activeNotes, devices, error, recentEvents, requestAccess, selectDevice, selectedDevice, selectedDeviceId, service.isSupported, subscribeToEvents, sustainDown])

  return <MidiContext.Provider value={value}>{children}</MidiContext.Provider>
}
