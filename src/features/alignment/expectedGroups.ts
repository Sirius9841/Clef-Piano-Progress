import { scoreTimeToMilliseconds } from '../expected-performance/tempoTimeline'
import type { ExpectedPerformancePlan } from '../expected-performance/types'
import type { AlignmentWarning, ExpectedAlignmentGroup } from './types'

function hasDuplicatePitch(pitches: readonly number[]): boolean {
  return new Set(pitches).size !== pitches.length
}

export function deriveExpectedAlignmentGroups(
  plan: ExpectedPerformancePlan,
  practiceSpeedMultiplier: number,
): { groups: ExpectedAlignmentGroup[]; warnings: AlignmentWarning[] } {
  const attackById = new Map(plan.attacks.map((attack) => [attack.id, attack]))
  const warnings: AlignmentWarning[] = []
  const groups = plan.onsetGroups.map((group) => {
    const attacks = group.attackIds.map((id) => attackById.get(id)).filter((attack) => attack !== undefined).map((attack) => ({
      ...attack,
      sourceNoteIds: [...attack.sourceNoteIds],
      pitch: { ...attack.pitch },
      onset: { ...attack.onset },
      expectedDuration: { ...attack.expectedDuration },
    }))
    const derived: ExpectedAlignmentGroup = {
      id: group.id,
      position: { ...group.position },
      referenceMs: scoreTimeToMilliseconds(group.position, plan.tempoTimeline, practiceSpeedMultiplier),
      attackIds: [...group.attackIds],
      attacks,
      pitches: attacks.map((attack) => attack.midi),
      measureIndices: [...group.measureIndices],
      measureNumbers: [...group.measureNumbers],
    }
    if (hasDuplicatePitch(derived.pitches)) {
      warnings.push({
        code: 'DUPLICATE_SIMULTANEOUS_EXPECTED_PITCH',
        severity: 'warning',
        expectedGroupId: group.id,
        message: 'This expected onset contains duplicate MIDI pitches from separate notation attacks. Provenance is preserved, but a physical piano key cannot express simultaneous multiplicity directly.',
      })
    }
    return derived
  })
  return { groups, warnings }
}
