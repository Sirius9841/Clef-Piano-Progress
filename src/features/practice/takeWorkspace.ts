export interface TakeClearActionCopy {
  readonly label: 'Clear current take' | 'Discard take'
  readonly detail: string | null
}

export function takeClearActionCopy(recordingId: string | null, savedRecordingId: string | null): TakeClearActionCopy {
  const savedCurrentTake = recordingId !== null && recordingId === savedRecordingId
  return savedCurrentTake
    ? { label: 'Clear current take', detail: 'Saved history will be kept.' }
    : { label: 'Discard take', detail: null }
}

export function clearCurrentTake(discardWorkspaceTake: () => void): void {
  discardWorkspaceTake()
}
