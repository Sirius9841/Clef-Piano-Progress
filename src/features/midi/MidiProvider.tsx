import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react'
import { MidiContext, type MidiContextValue } from './MidiContext'
import { selectLatestMidiInput } from './latestSelection'
import { WebMidiService } from './WebMidiService'
import { INITIAL_MIDI_RUNTIME_STATE, reduceMidiRuntimeState } from './runtimeState'
import type { MidiAccessState, MidiEvent } from './types'
const MAX_RECENT_EVENTS = 12

export function MidiProvider({ children }: { children: ReactNode }) {
  const [service] = useState(() => new WebMidiService())

  const [accessState, setAccessState] = useState<MidiAccessState>('idle')
  const [runtime, dispatchRuntime] = useReducer(reduceMidiRuntimeState, INITIAL_MIDI_RUNTIME_STATE)
  const [recentEvents, setRecentEvents] = useState<MidiEvent[]>([])
  const [error, setError] = useState<string | null>(null)
  const selectionRequestRef = useRef(0)

  useEffect(() => {
    const unsubscribeDevices = service.subscribeToDevices((nextDevices) => {
      dispatchRuntime({ type: 'devices-changed', devices: nextDevices })
    })
    const unsubscribeEvents = service.subscribeToEvents((event) => {
      setRecentEvents((current) => [event, ...current].slice(0, MAX_RECENT_EVENTS))
      dispatchRuntime({ type: 'event-received', event })
    })

    return () => {
      selectionRequestRef.current += 1
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
      dispatchRuntime({ type: 'devices-changed', devices: nextDevices })
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
    await selectLatestMidiInput(selectionRequestRef, id, (deviceId) => service.selectInput(deviceId), {
      onStart: () => {
        setError(null)
        dispatchRuntime({ type: 'selection-changed', deviceId: null })
      },
      onSuccess: (deviceId) => dispatchRuntime({ type: 'selection-changed', deviceId }),
      onError: (cause) => {
        dispatchRuntime({ type: 'selection-changed', deviceId: null })
        setError(cause instanceof Error ? cause.message : 'Could not connect to the selected MIDI input.')
      },
    })
  }, [service])

  const subscribeToEvents = useCallback((listener: (event: MidiEvent) => void) => service.subscribeToEvents(listener), [service])

  const selectedDevice = runtime.devices.find((device) => device.id === runtime.selectedDeviceId && device.state === 'connected') ?? null
  const presentedError = error ?? runtime.disconnectError
  const value = useMemo<MidiContextValue>(() => ({
    supported: service.isSupported,
    accessState,
    devices: [...runtime.devices],
    selectedDeviceId: runtime.selectedDeviceId,
    selectedDevice,
    activeNotes: [...runtime.activeNotes],
    sustainDown: runtime.sustainDown,
    recentEvents,
    error: presentedError,
    requestAccess,
    selectDevice,
    subscribeToEvents,
    clearEvents: () => setRecentEvents([]),
  }), [accessState, presentedError, recentEvents, requestAccess, runtime.activeNotes, runtime.devices, runtime.selectedDeviceId, runtime.sustainDown, selectDevice, selectedDevice, service.isSupported, subscribeToEvents])

  return <MidiContext.Provider value={value}>{children}</MidiContext.Provider>
}
