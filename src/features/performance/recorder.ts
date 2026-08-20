import type { MidiEvent } from '../midi/types'
import { deriveKeyPresses } from './deriveKeyPresses'
import { calculateRecordingStatistics } from './statistics'
import type {
  PerformanceRecording,
  RecordedMidiEvent,
  RecorderState,
  RecordingStopReason,
  RecordingWarning,
  StartRecordingOptions,
} from './types'

export interface RecorderEnvironment {
  monotonicNow: () => number
  wallClockNow: () => Date
  createId: () => string
}

interface ActiveRecording {
  id: string
  startedAt: string
  startedAtMonotonicMs: number
  options: StartRecordingOptions
  events: RecordedMidiEvent[]
  warnings: RecordingWarning[]
  lastTimestampMs: number
}

function defaultCreateId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `recording-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

const defaultEnvironment: RecorderEnvironment = {
  monotonicNow: () => globalThis.performance?.now() ?? 0,
  wallClockNow: () => new Date(),
  createId: defaultCreateId,
}

function frozenEvent(event: MidiEvent): Readonly<MidiEvent> {
  return Object.freeze({ ...event }) as Readonly<MidiEvent>
}

function freezeRecording(recording: PerformanceRecording): PerformanceRecording {
  recording.events.forEach((event) => Object.freeze(event))
  recording.keyPresses.forEach((press) => Object.freeze(press))
  recording.warnings.forEach((warning) => Object.freeze(warning))
  Object.freeze(recording.events)
  Object.freeze(recording.keyPresses)
  Object.freeze(recording.warnings)
  Object.freeze(recording.device)
  if (recording.practiceContext.includedPartIds) Object.freeze(recording.practiceContext.includedPartIds)
  Object.freeze(recording.practiceContext)
  if (recording.statistics.velocity) Object.freeze(recording.statistics.velocity)
  Object.freeze(recording.statistics)
  return Object.freeze(recording)
}

export class PerformanceRecorder {
  private active: ActiveRecording | null = null
  private stopped: PerformanceRecording | null = null

  constructor(private readonly environment: RecorderEnvironment = defaultEnvironment) {}

  get state(): RecorderState {
    if (this.active) {
      return {
        status: 'recording',
        recordingId: this.active.id,
        startedAt: this.active.startedAt,
        startedAtMonotonicMs: this.active.startedAtMonotonicMs,
        eventCount: this.active.events.length,
      }
    }
    return this.stopped ? { status: 'stopped', recording: this.stopped } : { status: 'idle' }
  }

  start(options: StartRecordingOptions): RecorderState {
    if (this.active) this.stop('replaced')
    const startedAtMonotonicMs = this.environment.monotonicNow()
    if (!Number.isFinite(startedAtMonotonicMs)) throw new RangeError('Recorder monotonic start time must be finite.')
    this.stopped = null
    this.active = {
      id: this.environment.createId(),
      startedAt: this.environment.wallClockNow().toISOString(),
      startedAtMonotonicMs,
      options: {
        device: { ...options.device },
        practiceContext: options.practiceContext ? { ...options.practiceContext, includedPartIds: options.practiceContext.includedPartIds ? [...options.practiceContext.includedPartIds] : undefined } : {},
      },
      events: [],
      warnings: [],
      lastTimestampMs: startedAtMonotonicMs,
    }
    return this.state
  }

  capture(event: MidiEvent): boolean {
    const active = this.active
    if (!active || !Number.isFinite(event.timestampMs) || event.timestampMs < active.startedAtMonotonicMs) return false
    const sequence = active.events.length
    if (event.timestampMs < active.lastTimestampMs) {
      active.warnings.push({ code: 'NON_MONOTONIC_TIMESTAMP', sequence, message: 'A MIDI event arrived with a timestamp earlier than the preceding captured event; arrival sequence remains authoritative.' })
    }
    active.events.push(Object.freeze({ sequence, relativeMs: event.timestampMs - active.startedAtMonotonicMs, event: frozenEvent(event) }))
    active.lastTimestampMs = event.timestampMs
    return true
  }

  stop(reason: RecordingStopReason = 'user'): PerformanceRecording | null {
    const active = this.active
    if (!active) return this.stopped
    const stopTimestampMs = this.environment.monotonicNow()
    const latestEventMs = active.events.reduce((latest, event) => Math.max(latest, event.relativeMs), 0)
    const durationMs = Math.max(0, stopTimestampMs - active.startedAtMonotonicMs, latestEventMs)
    const { keyPresses, warnings: pairingWarnings } = deriveKeyPresses(active.events)
    const warnings = [...active.warnings, ...pairingWarnings]
    const statistics = calculateRecordingStatistics(active.events, keyPresses, warnings)
    const recording: PerformanceRecording = {
      id: active.id,
      startedAt: active.startedAt,
      durationMs,
      stopReason: reason,
      device: { ...active.options.device },
      practiceContext: { ...active.options.practiceContext, includedPartIds: active.options.practiceContext?.includedPartIds ? [...active.options.practiceContext.includedPartIds] : undefined },
      events: [...active.events],
      keyPresses,
      statistics,
      warnings,
    }
    this.active = null
    this.stopped = freezeRecording(recording)
    return this.stopped
  }

  handleDeviceDisconnect(): PerformanceRecording | null {
    return this.active ? this.stop('device-disconnected') : this.stopped
  }

  discard(): void {
    this.active = null
    this.stopped = null
  }
}
