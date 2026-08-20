import type { RecordedKeyPress, RecordedMidiEvent, RecordingStatistics, RecordingWarning } from './types'

export function calculateRecordingStatistics(
  events: readonly RecordedMidiEvent[],
  keyPresses: readonly RecordedKeyPress[],
  warnings: readonly RecordingWarning[],
): RecordingStatistics {
  const velocities = keyPresses.map((press) => press.velocity)
  return {
    eventCount: events.length,
    noteAttackCount: keyPresses.length,
    noteReleaseCount: keyPresses.filter((press) => press.releaseMs !== null).length,
    uniquePitchCount: new Set(keyPresses.map((press) => press.note)).size,
    velocity: velocities.length ? {
      minimum: Math.min(...velocities),
      maximum: Math.max(...velocities),
      average: velocities.reduce((total, velocity) => total + velocity, 0) / velocities.length,
    } : null,
    sustainChangeCount: events.filter(({ event }) => event.type === 'sustain').length,
    openNoteCount: keyPresses.filter((press) => press.releaseMs === null).length,
    orphanReleaseCount: warnings.filter((warning) => warning.code === 'ORPHAN_NOTE_OFF').length,
  }
}
