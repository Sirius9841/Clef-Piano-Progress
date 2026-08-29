import { PerformanceRecorder } from './recorder'
import type { PerformanceRecording } from './types'

export class RecordingDeviceLifecycle {
  private recordingDeviceId: string | null = null

  attach(deviceId: string): void {
    this.recordingDeviceId = deviceId
  }

  clear(): void {
    this.recordingDeviceId = null
  }

  reconcile(selectedDeviceId: string | null, recorder: PerformanceRecorder): { changed: boolean; recording: PerformanceRecording | null } {
    if (this.recordingDeviceId === null || this.recordingDeviceId === selectedDeviceId) return { changed: false, recording: null }
    this.recordingDeviceId = null
    return { changed: true, recording: recorder.handleDeviceDisconnect() }
  }
}
