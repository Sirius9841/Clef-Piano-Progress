import { musicalTime } from '../../musicxml/musicalTime'
import type { ScorePitch } from '../../musicxml/types'
import type { ExpectedNoteAttack, ExpectedPerformancePlan, TempoTimelinePoint } from '../../expected-performance/types'
import type { PerformanceRecording, RecordedKeyPress } from '../../performance/types'

function pitch(midi: number): ScorePitch {
  return { step: 'C', alter: 0, octave: Math.floor(midi / 12) - 1, midi, spelling: `MIDI ${midi}`, outsidePianoRange: midi < 21 || midi > 108 }
}

export function makePlan(
  pitchGroups: readonly (readonly number[])[],
  options: { id?: string; positions?: readonly number[]; tempoPoints?: readonly { position: number; bpm: number }[] } = {},
): ExpectedPerformancePlan {
  const attacks: ExpectedNoteAttack[] = []
  const onsetGroups = pitchGroups.map((pitches, groupIndex) => {
    const position = musicalTime(options.positions?.[groupIndex] ?? groupIndex)
    const groupAttacks = pitches.map((midi, attackIndex): ExpectedNoteAttack => ({
      id: `expected-attack:${groupIndex}:${attackIndex}`,
      sourceNoteIds: [`source-note:${groupIndex}:${attackIndex}`],
      partId: 'P1',
      measureIndex: groupIndex,
      measureNumber: String(groupIndex + 1),
      staff: attackIndex % 2 + 1,
      voice: String(attackIndex + 1),
      pitch: pitch(midi),
      midi,
      onset: position,
      expectedDuration: musicalTime(1),
      required: true,
      outsideStandardPianoRange: midi < 21 || midi > 108,
    }))
    attacks.push(...groupAttacks)
    return {
      id: `expected-group:${groupIndex}`,
      position,
      attackIds: groupAttacks.map((attack) => attack.id),
      midiNotes: [...pitches],
      measureIndices: [groupIndex],
      measureNumbers: [String(groupIndex + 1)],
      isMultiNote: pitches.length > 1,
    }
  })
  const authored = options.tempoPoints ?? [{ position: 0, bpm: 120 }]
  const tempoPoints: TempoTimelinePoint[] = authored.map((point, index) => ({
    id: `tempo:${index}`,
    position: musicalTime(point.position),
    quarterBpm: point.bpm,
    source: 'authored',
    sourceEventIds: [`tempo-event:${index}`],
  }))
  const lowest = attacks.length ? Math.min(...attacks.map((attack) => attack.midi)) : 0
  const highest = attacks.length ? Math.max(...attacks.map((attack) => attack.midi)) : 0
  return {
    id: options.id ?? 'plan:test',
    scoreId: 'score:test',
    includedPartIds: ['P1'],
    attacks,
    soundingNotes: [],
    onsetGroups,
    flexibleEvents: [],
    tempoTimeline: { fallbackQuarterBpm: 120, points: tempoPoints, usesFallback: false },
    warnings: [],
    statistics: {
      requiredAttackCount: attacks.length,
      onsetGroupCount: onsetGroups.length,
      multiNoteGroupCount: onsetGroups.filter((group) => group.isMultiNote).length,
      soundingNoteCount: attacks.length,
      flexibleGraceCount: 0,
      excludedCueCount: 0,
      includedPartCount: 1,
      pitchRange: attacks.length ? { lowest, highest } : null,
      outsideStandardPianoRangeCount: 0,
      unsupportedPitchCount: 0,
      totalScoreDuration: musicalTime(pitchGroups.length),
      tempoEventCount: tempoPoints.length,
    },
  }
}

export function makeRecording(
  attacks: readonly { ms: number; midi: number; velocity?: number; channel?: number }[],
  options: { id?: string; planId?: string; speed?: number } = {},
): PerformanceRecording {
  const keyPresses: RecordedKeyPress[] = attacks.map((attack, index) => ({
    id: `key-press:${index}`,
    channel: attack.channel ?? 0,
    note: attack.midi,
    velocity: attack.velocity ?? 80,
    attackSequence: index,
    attackMs: attack.ms,
    releaseSequence: null,
    releaseMs: null,
    releaseVelocity: null,
  }))
  return {
    id: options.id ?? 'recording:test',
    startedAt: '2026-08-20T12:00:00.000Z',
    durationMs: attacks.length ? Math.max(...attacks.map((attack) => attack.ms)) + 100 : 0,
    stopReason: 'user',
    device: { id: 'device:test', name: 'Test Piano', manufacturer: 'Tests' },
    practiceContext: { expectedPerformancePlanId: options.planId ?? 'plan:test', includedPartIds: ['P1'], speedMultiplier: options.speed ?? 1 },
    events: [],
    keyPresses,
    statistics: {
      eventCount: attacks.length,
      noteAttackCount: attacks.length,
      noteReleaseCount: 0,
      uniquePitchCount: new Set(attacks.map((attack) => attack.midi)).size,
      velocity: attacks.length ? { minimum: 80, maximum: 80, average: 80 } : null,
      sustainChangeCount: 0,
      openNoteCount: attacks.length,
      orphanReleaseCount: 0,
    },
    warnings: [],
  }
}

export function melodyRecording(pitches: readonly number[], times: readonly number[], options: { id?: string; planId?: string; speed?: number } = {}): PerformanceRecording {
  return makeRecording(pitches.map((midi, index) => ({ midi, ms: times[index]! })), options)
}
