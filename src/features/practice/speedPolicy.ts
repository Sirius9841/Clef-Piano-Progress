import type { PerformanceRecording, RecorderStatus } from '../performance/types'

export function isPracticeSpeedLocked(recorderStatus: RecorderStatus): boolean {
  return recorderStatus !== 'idle'
}

export function resolvePracticeSpeedChange(current: number, requested: number, recorderStatus: RecorderStatus): number {
  return isPracticeSpeedLocked(recorderStatus) ? current : requested
}

export function capturedTakeSpeed(recording: PerformanceRecording | null, sessionSpeed: number): number {
  return recording?.practiceContext.speedMultiplier ?? sessionSpeed
}
