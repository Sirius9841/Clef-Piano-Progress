export interface MidiSelectionOperationRef {
  current: number
}

export interface MidiSelectionHandlers {
  readonly onStart: () => void
  readonly onSuccess: (deviceId: string | null) => void
  readonly onError: (cause: unknown) => void
}

export async function selectLatestMidiInput(
  operationRef: MidiSelectionOperationRef,
  deviceId: string | null,
  selectInput: (deviceId: string | null) => Promise<void>,
  handlers: MidiSelectionHandlers,
): Promise<void> {
  const operation = ++operationRef.current
  handlers.onStart()
  try {
    await selectInput(deviceId)
  } catch (cause) {
    if (operation !== operationRef.current) return
    handlers.onError(cause)
    return
  }
  if (operation !== operationRef.current) return
  handlers.onSuccess(deviceId)
}
