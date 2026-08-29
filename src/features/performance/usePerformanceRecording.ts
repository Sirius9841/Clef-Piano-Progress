import { useCallback, useEffect, useRef, useState } from 'react'
import { useMidi } from '../midi/MidiContext'
import { PerformanceRecorder } from './recorder'
import { RecordingDeviceLifecycle } from './recordingDeviceLifecycle'
import type { PerformanceRecording, RecorderState, RecordingPracticeContext } from './types'

export function usePerformanceRecording(practiceContext: RecordingPracticeContext) {
  const midi = useMidi()
  const subscribeToEvents = midi.subscribeToEvents
  const [recorder] = useState(() => new PerformanceRecorder())
  const [state, setState] = useState<RecorderState>({ status: 'idle' })
  const [elapsedMs, setElapsedMs] = useState(0)
  const recordingDeviceLifecycle = useRef(new RecordingDeviceLifecycle())
  const presentationFrame = useRef<number | null>(null)
  const recordingStartedAt = state.status === 'recording' ? state.startedAtMonotonicMs : null

  useEffect(() => {
    const unsubscribe = subscribeToEvents((event) => {
      if (!recorder.capture(event) || presentationFrame.current !== null) return
      presentationFrame.current = window.requestAnimationFrame(() => {
        presentationFrame.current = null
        setState(recorder.state)
      })
    })
    return () => {
      unsubscribe()
      if (presentationFrame.current !== null) window.cancelAnimationFrame(presentationFrame.current)
      presentationFrame.current = null
    }
  }, [recorder, subscribeToEvents])

  useEffect(() => {
    if (recordingStartedAt === null) return
    const update = () => setElapsedMs(Math.max(0, performance.now() - recordingStartedAt))
    update()
    const interval = window.setInterval(update, 50)
    return () => window.clearInterval(interval)
  }, [recordingStartedAt])

  useEffect(() => {
    if (state.status !== 'recording' && state.status !== 'armed') return
    const reconciliation = recordingDeviceLifecycle.current.reconcile(midi.selectedDeviceId, recorder)
    if (!reconciliation.changed) return
    setElapsedMs(reconciliation.recording?.durationMs ?? 0)
    setState(recorder.state)
  }, [midi.selectedDeviceId, recorder, state.status])

  const start = useCallback(() => {
    if (!midi.selectedDevice) return false
    recordingDeviceLifecycle.current.attach(midi.selectedDevice.id)
    const next = recorder.start({
      device: { id: midi.selectedDevice.id, name: midi.selectedDevice.name, manufacturer: midi.selectedDevice.manufacturer },
      practiceContext,
      initialSustain: {
        observed: midi.sustainObserved,
        down: midi.sustainObserved ? midi.sustainDown : null,
        value: midi.sustainObserved ? midi.sustainValue : null,
      },
    })
    setElapsedMs(0)
    setState(next)
    return true
  }, [midi.selectedDevice, midi.sustainDown, midi.sustainObserved, midi.sustainValue, practiceContext, recorder])

  const stop = useCallback(() => {
    const recording = recorder.stop('user')
    recordingDeviceLifecycle.current.clear()
    setElapsedMs(recording?.durationMs ?? 0)
    setState(recorder.state)
    return recording
  }, [recorder])

  const discard = useCallback(() => {
    recorder.discard()
    recordingDeviceLifecycle.current.clear()
    setElapsedMs(0)
    setState(recorder.state)
  }, [recorder])

  const recording: PerformanceRecording | null = state.status === 'stopped' ? state.recording : null
  return { state, recording, elapsedMs, start, stop, discard }
}
