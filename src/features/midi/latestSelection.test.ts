import { describe, expect, it } from 'vitest'
import { selectLatestMidiInput, type MidiSelectionHandlers } from './latestSelection'

interface Deferred {
  readonly promise: Promise<void>
  readonly resolve: () => void
  readonly reject: (cause: unknown) => void
}

function deferred(): Deferred {
  let resolvePromise!: () => void
  let rejectPromise!: (cause: unknown) => void
  const promise = new Promise<void>((resolve, reject) => {
    resolvePromise = resolve
    rejectPromise = reject
  })
  return { promise, resolve: resolvePromise, reject: rejectPromise }
}

function selectionState() {
  let selectedDeviceId: string | null = null
  let error: string | null = null
  const handlers: MidiSelectionHandlers = {
    onStart: () => { selectedDeviceId = null; error = null },
    onSuccess: (deviceId) => { selectedDeviceId = deviceId },
    onError: (cause) => { selectedDeviceId = null; error = cause instanceof Error ? cause.message : 'Selection failed.' },
  }
  return {
    handlers,
    snapshot: () => ({ selectedDeviceId, error }),
  }
}

describe('latest MIDI provider selection', () => {
  it('keeps B selected when B finishes before an older A request', async () => {
    const operationRef = { current: 0 }
    const state = selectionState()
    const inputA = deferred()
    const inputB = deferred()
    const selectInput = (deviceId: string | null) => deviceId === 'A' ? inputA.promise : inputB.promise

    const selectA = selectLatestMidiInput(operationRef, 'A', selectInput, state.handlers)
    const selectB = selectLatestMidiInput(operationRef, 'B', selectInput, state.handlers)
    inputB.resolve()
    await selectB
    inputA.resolve()
    await selectA

    expect(state.snapshot()).toEqual({ selectedDeviceId: 'B', error: null })
  })

  it('keeps selection null when deselection finishes before an older A request', async () => {
    const operationRef = { current: 0 }
    const state = selectionState()
    const inputA = deferred()
    const selectInput = (deviceId: string | null) => deviceId === 'A' ? inputA.promise : Promise.resolve()

    const selectA = selectLatestMidiInput(operationRef, 'A', selectInput, state.handlers)
    await selectLatestMidiInput(operationRef, null, selectInput, state.handlers)
    inputA.resolve()
    await selectA

    expect(state.snapshot()).toEqual({ selectedDeviceId: null, error: null })
  })

  it('ignores a stale A error after B succeeds', async () => {
    const operationRef = { current: 0 }
    const state = selectionState()
    const inputA = deferred()
    const inputB = deferred()
    const selectInput = (deviceId: string | null) => deviceId === 'A' ? inputA.promise : inputB.promise

    const selectA = selectLatestMidiInput(operationRef, 'A', selectInput, state.handlers)
    const selectB = selectLatestMidiInput(operationRef, 'B', selectInput, state.handlers)
    inputB.resolve()
    await selectB
    inputA.reject(new Error('A failed late.'))
    await selectA

    expect(state.snapshot()).toEqual({ selectedDeviceId: 'B', error: null })
  })
})
