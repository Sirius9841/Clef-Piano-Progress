import type { MidiEvent } from '../midi/types'

export type RecorderStatus = 'idle' | 'recording' | 'stopped'
export type RecordingStopReason = 'user' | 'device-disconnected' | 'replaced'

export interface RecordedDeviceInfo {
  id: string
  name: string
  manufacturer: string
}

export interface RecordingPracticeContext {
  expectedPerformancePlanId?: string
  scoreId?: string
  includedPartIds?: string[]
  speedMultiplier?: number
}

export interface StartRecordingOptions {
  device: RecordedDeviceInfo
  practiceContext?: RecordingPracticeContext
}

export interface RecordedMidiEvent {
  readonly sequence: number
  readonly relativeMs: number
  readonly event: Readonly<MidiEvent>
}

export interface RecordedKeyPress {
  readonly id: string
  readonly channel: number
  readonly note: number
  readonly velocity: number
  readonly attackSequence: number
  readonly attackMs: number
  readonly releaseSequence: number | null
  readonly releaseMs: number | null
  readonly releaseVelocity: number | null
}

export type RecordingWarningCode = 'ORPHAN_NOTE_OFF' | 'NON_MONOTONIC_TIMESTAMP'

export interface RecordingWarning {
  readonly code: RecordingWarningCode
  readonly message: string
  readonly sequence: number
}

export interface RecordingStatistics {
  readonly eventCount: number
  readonly noteAttackCount: number
  readonly noteReleaseCount: number
  readonly uniquePitchCount: number
  readonly velocity: { readonly minimum: number; readonly maximum: number; readonly average: number } | null
  readonly sustainChangeCount: number
  readonly openNoteCount: number
  readonly orphanReleaseCount: number
}

export interface PerformanceRecording {
  readonly id: string
  readonly startedAt: string
  readonly durationMs: number
  readonly stopReason: RecordingStopReason
  readonly device: Readonly<RecordedDeviceInfo>
  readonly practiceContext: Readonly<RecordingPracticeContext>
  readonly events: readonly RecordedMidiEvent[]
  readonly keyPresses: readonly RecordedKeyPress[]
  readonly statistics: Readonly<RecordingStatistics>
  readonly warnings: readonly RecordingWarning[]
}

export type RecorderState =
  | { readonly status: 'idle' }
  | { readonly status: 'recording'; readonly recordingId: string; readonly startedAt: string; readonly startedAtMonotonicMs: number; readonly eventCount: number }
  | { readonly status: 'stopped'; readonly recording: PerformanceRecording }
