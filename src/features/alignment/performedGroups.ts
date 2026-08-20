import type { PerformanceRecording } from '../performance/types'
import type { AlignmentOptions } from './options'
import type { AlignmentWarning, PerformedAttack, PerformedOnsetGroup } from './types'

export function derivePerformedAttacks(recording: PerformanceRecording): PerformedAttack[] {
  return recording.keyPresses.map((press) => ({
    id: `performed-attack:${recording.id}:${press.attackSequence}`,
    sourceKeyPressId: press.id,
    midi: press.note,
    velocity: press.velocity,
    attackMs: press.attackMs,
    channel: press.channel,
    sequence: press.attackSequence,
  }))
}

function finishGroup(recordingId: string, attacks: PerformedAttack[]): PerformedOnsetGroup {
  const times = attacks.map((attack) => attack.attackMs)
  const startMs = Math.min(...times)
  const endMs = Math.max(...times)
  return {
    id: `performed-group:${recordingId}:${attacks[0]!.sequence}-${attacks[attacks.length - 1]!.sequence}`,
    attacks: [...attacks],
    startMs,
    endMs,
    representativeMs: (startMs + endMs) / 2,
    spreadMs: endMs - startMs,
    pitches: attacks.map((attack) => attack.midi),
  }
}

/**
 * A group grows only while both the adjacent gap and total spread stay bounded.
 * Repeated physical keys always begin a new group so a fast repeated-note melody
 * cannot collapse into one impossible same-key chord; the second attack is kept.
 */
export function clusterPerformedOnsets(
  recordingId: string,
  attacks: readonly PerformedAttack[],
  options: AlignmentOptions,
): { groups: PerformedOnsetGroup[]; warnings: AlignmentWarning[] } {
  const groups: PerformedOnsetGroup[] = []
  const warnings: AlignmentWarning[] = []
  let current: PerformedAttack[] = []

  const flush = () => {
    if (current.length === 0) return
    const group = finishGroup(recordingId, current)
    groups.push(group)
    if (group.spreadMs >= options.performedGroupWarningSpreadMs) {
      warnings.push({ code: 'PERFORMED_GROUP_WIDE_SPREAD', severity: 'info', performedGroupId: group.id, message: `Performed onset group spans ${group.spreadMs.toFixed(1)} ms; the spread is preserved as neutral alignment data.` })
    }
    current = []
  }

  for (const attack of attacks) {
    if (current.length === 0) {
      current.push(attack)
      continue
    }
    const first = current[0]!
    const last = current[current.length - 1]!
    const localGap = attack.attackMs - last.attackMs
    const totalSpread = attack.attackMs - first.attackMs
    const repeatsPitch = current.some((candidate) => candidate.midi === attack.midi)
    if (localGap < 0 || localGap > options.performedGroupGapMs || totalSpread > options.performedGroupMaxSpreadMs || repeatsPitch) flush()
    current.push(attack)
  }
  flush()
  return { groups, warnings }
}
