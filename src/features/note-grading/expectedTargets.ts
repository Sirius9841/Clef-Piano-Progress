import type { ExpectedFlexibleEvent, ExpectedPerformancePlan } from '../expected-performance/types'
import type { NoteGradingOptions } from './options'
import type { ExpectedEventExclusion, ExpectedKeyTarget, FlexibleExclusionReason } from './types'

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)]
}

function flexibleReason(event: ExpectedFlexibleEvent): FlexibleExclusionReason {
  if (event.kind === 'grace') return 'GRACE_TIMING_FLEXIBLE'
  if (event.kind === 'cue') return 'CUE_EXCLUDED'
  return 'UNSUPPORTED_MIDI_PITCH'
}

export function deriveExpectedKeyTargets(
  plan: ExpectedPerformancePlan,
  options: NoteGradingOptions,
): { targets: ExpectedKeyTarget[]; exclusions: ExpectedEventExclusion[] } {
  const attackById = new Map(plan.attacks.map((attack) => [attack.id, attack]))
  const targets: ExpectedKeyTarget[] = []

  for (const group of plan.onsetGroups) {
    const attacksByMidi = new Map<number, NonNullable<ReturnType<typeof attackById.get>>[]>()
    for (const attackId of group.attackIds) {
      const attack = attackById.get(attackId)
      if (!attack) continue
      const sameKey = attacksByMidi.get(attack.midi)
      if (sameKey) sameKey.push(attack)
      else attacksByMidi.set(attack.midi, [attack])
    }
    for (const [midi, attacks] of attacksByMidi) {
      const outsideStandardPianoRange = attacks.some((attack) => attack.outsideStandardPianoRange)
      const excluded = options.excludeOutsideStandardPianoRange && outsideStandardPianoRange
      targets.push({
        id: `expected-key:${group.id}:${midi}`,
        onsetGroupId: group.id,
        midi,
        sourceExpectedAttackIds: attacks.map((attack) => attack.id),
        sourceNoteIds: unique(attacks.flatMap((attack) => attack.sourceNoteIds)),
        scorePosition: { ...group.position },
        partIds: unique(attacks.map((attack) => attack.partId)),
        measureIndices: unique(attacks.map((attack) => attack.measureIndex)),
        measureNumbers: unique(attacks.map((attack) => attack.measureNumber)),
        staffs: unique(attacks.flatMap((attack) => attack.staff === null ? [] : [attack.staff])),
        voices: unique(attacks.flatMap((attack) => attack.voice === null ? [] : [attack.voice])),
        outsideStandardPianoRange,
        eligibility: excluded ? 'excluded' : 'gradeable',
        ...(excluded ? { exclusionReason: 'OUTSIDE_STANDARD_PIANO_RANGE' as const } : {}),
      })
    }
  }

  const exclusions = plan.flexibleEvents.map((event): ExpectedEventExclusion => ({
    id: `note-exclusion:${event.id}`,
    flexibleEventId: event.id,
    sourceNoteId: event.sourceNoteId,
    reason: flexibleReason(event),
    midi: event.midi,
    scorePosition: { ...event.anchorPosition },
    partId: event.partId,
    measureIndex: event.measureIndex,
    measureNumber: event.measureNumber,
  }))
  return { targets, exclusions }
}
