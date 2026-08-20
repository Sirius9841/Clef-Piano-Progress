import { addTime, compareTime, equalTime, maxTime, subtractTime, ZERO_TIME, type MusicalTime } from '../musicxml/musicalTime'
import type { NormalizedNote, NormalizedPart, NormalizedScore } from '../musicxml/types'
import { buildTempoTimeline } from './tempoTimeline'
import {
  ExpectedPerformanceBuildError,
  type ExpectedFlexibleEvent,
  type ExpectedNoteAttack,
  type ExpectedOnsetGroup,
  type ExpectedPerformancePlan,
  type ExpectedPerformanceStatistics,
  type ExpectedPerformanceWarning,
  type ExpectedSoundingNote,
} from './types'

export interface ExpectedPerformanceOptions {
  includedPartIds?: string[]
  fallbackQuarterBpm: number
}

interface PositionedNote {
  note: NormalizedNote
  partId: string
  partOrder: number
}

interface OpenTieChain {
  attack: ExpectedNoteAttack
  sounding: ExpectedSoundingNote
  lastNote: NormalizedNote
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function timeKey(value: MusicalTime): string {
  return `${value.numerator}/${value.denominator}`
}

function tieKey(partId: string, note: NormalizedNote): string | null {
  if (!note.pitch) return null
  return [partId, note.voice ?? 'voice:null', note.staff ?? 'staff:null', note.pitch.spelling, note.pitch.midi ?? 'midi:null'].join('|')
}

function noteWarningContext(partId: string, note: NormalizedNote) {
  return { sourceNoteId: note.id, partId, measureIndex: note.measureIndex, measureNumber: note.measureNumber, position: note.absoluteOnset }
}

function selectedParts(score: NormalizedScore, requestedPartIds?: string[]): NormalizedPart[] {
  if (score.parts.length === 1 && requestedPartIds === undefined) return [score.parts[0]!]
  if (!requestedPartIds || requestedPartIds.length === 0) {
    throw new ExpectedPerformanceBuildError('PART_SELECTION_REQUIRED', 'Select at least one score part before building a performance plan.')
  }
  const uniqueIds = [...new Set(requestedPartIds)]
  const selected = uniqueIds.map((id) => score.parts.find((part) => part.id === id))
  if (selected.some((part) => !part)) throw new ExpectedPerformanceBuildError('INVALID_PART_SELECTION', 'The selected score parts are not present in this score.')
  return selected as NormalizedPart[]
}

function collectNotes(parts: NormalizedPart[], score: NormalizedScore): PositionedNote[] {
  const partOrder = new Map(score.parts.map((part, index) => [part.id, index]))
  return parts.flatMap((part) => part.measures.flatMap((measure) => measure.events.flatMap((event) =>
    event.type === 'note' ? [{ note: event, partId: part.id, partOrder: partOrder.get(part.id) ?? 0 }] : [])))
    .sort((left, right) => compareTime(left.note.absoluteOnset, right.note.absoluteOnset)
      || left.partOrder - right.partOrder
      || left.note.measureIndex - right.note.measureIndex
      || left.note.xmlOrder - right.note.xmlOrder
      || left.note.id.localeCompare(right.note.id))
}

function scoreDuration(parts: NormalizedPart[]): MusicalTime {
  let duration = ZERO_TIME
  for (const part of parts) {
    for (const measure of part.measures) {
      const span = compareTime(measure.actualContentDuration, ZERO_TIME) > 0 ? measure.actualContentDuration : measure.expectedDuration ?? ZERO_TIME
      duration = maxTime(duration, addTime(measure.absoluteOnset, span))
    }
  }
  return duration
}

function createFlexibleEvent(note: NormalizedNote, partId: string, kind: ExpectedFlexibleEvent['kind']): ExpectedFlexibleEvent {
  return {
    id: `expected:flexible:${note.id}:${kind}`,
    sourceNoteId: note.id,
    kind,
    timingPolicy: kind === 'grace' ? 'flexible' : 'excluded',
    required: false,
    anchorPosition: note.absoluteOnset,
    anchorAttackId: null,
    partId,
    measureIndex: note.measureIndex,
    measureNumber: note.measureNumber,
    staff: note.staff,
    voice: note.voice,
    pitch: note.pitch,
    midi: note.pitch?.midi ?? null,
    unsupportedMidiPitch: note.pitch?.midi === null || note.pitch === null,
    outsideStandardPianoRange: note.pitch?.outsidePianoRange ?? false,
    sourceOrder: note.xmlOrder,
  }
}

function createRequiredNote(note: NormalizedNote, partId: string): OpenTieChain {
  const pitch = note.pitch!
  const duration = note.duration!
  const attackId = `expected:attack:${note.id}`
  const soundingId = `expected:sounding:${note.id}`
  const attack: ExpectedNoteAttack = {
    id: attackId,
    sourceNoteIds: [note.id],
    partId,
    measureIndex: note.measureIndex,
    measureNumber: note.measureNumber,
    staff: note.staff,
    voice: note.voice,
    pitch,
    midi: pitch.midi!,
    onset: note.absoluteOnset,
    expectedDuration: duration,
    required: true,
    outsideStandardPianoRange: pitch.outsidePianoRange,
  }
  const sounding: ExpectedSoundingNote = {
    id: soundingId,
    attackId,
    sourceNoteIds: [note.id],
    partId,
    staff: note.staff,
    voice: note.voice,
    pitch,
    onset: note.absoluteOnset,
    end: addTime(note.absoluteOnset, duration),
    duration,
  }
  return { attack, sounding, lastNote: note }
}

function extendTieChain(chain: OpenTieChain, note: NormalizedNote): void {
  const duration = note.duration!
  chain.attack.sourceNoteIds.push(note.id)
  chain.sounding.sourceNoteIds.push(note.id)
  chain.sounding.end = addTime(note.absoluteOnset, duration)
  chain.sounding.duration = subtractTime(chain.sounding.end, chain.sounding.onset)
  chain.attack.expectedDuration = chain.sounding.duration
  chain.lastNote = note
}

function buildOnsetGroups(attacks: ExpectedNoteAttack[]): ExpectedOnsetGroup[] {
  const groups = new Map<string, ExpectedNoteAttack[]>()
  for (const attack of attacks) {
    const key = timeKey(attack.onset)
    const group = groups.get(key)
    if (group) group.push(attack)
    else groups.set(key, [attack])
  }
  return [...groups.values()].map((group) => {
    const first = group[0]!
    const measureIndices = [...new Set(group.map((attack) => attack.measureIndex))]
    const measureNumbers = [...new Set(group.map((attack) => attack.measureNumber))]
    return {
      id: `expected:onset:${timeKey(first.onset)}:${stableHash(group.map((attack) => attack.id).join('|'))}`,
      position: first.onset,
      attackIds: group.map((attack) => attack.id),
      midiNotes: group.map((attack) => attack.midi),
      measureIndices,
      measureNumbers,
      isMultiNote: group.length > 1,
    }
  })
}

function attachFlexibleAnchors(events: ExpectedFlexibleEvent[], attacks: ExpectedNoteAttack[]): void {
  for (const event of events) {
    if (event.kind !== 'grace') continue
    const anchor = attacks.find((attack) => attack.partId === event.partId
      && compareTime(attack.onset, event.anchorPosition) >= 0
      && (event.voice === null || attack.voice === event.voice)
      && (event.staff === null || attack.staff === event.staff))
    event.anchorAttackId = anchor?.id ?? null
  }
}

function calculateStatistics(
  parts: NormalizedPart[],
  attacks: ExpectedNoteAttack[],
  soundingNotes: ExpectedSoundingNote[],
  onsetGroups: ExpectedOnsetGroup[],
  flexibleEvents: ExpectedFlexibleEvent[],
  totalScoreDuration: MusicalTime,
  tempoEventCount: number,
): ExpectedPerformanceStatistics {
  const midiNotes = attacks.map((attack) => attack.midi)
  return {
    requiredAttackCount: attacks.length,
    onsetGroupCount: onsetGroups.length,
    multiNoteGroupCount: onsetGroups.filter((group) => group.isMultiNote).length,
    soundingNoteCount: soundingNotes.length,
    flexibleGraceCount: flexibleEvents.filter((event) => event.kind === 'grace').length,
    excludedCueCount: flexibleEvents.filter((event) => event.kind === 'cue').length,
    includedPartCount: parts.length,
    pitchRange: midiNotes.length ? { lowest: Math.min(...midiNotes), highest: Math.max(...midiNotes) } : null,
    outsideStandardPianoRangeCount: attacks.filter((attack) => attack.outsideStandardPianoRange).length + flexibleEvents.filter((event) => event.outsideStandardPianoRange).length,
    unsupportedPitchCount: flexibleEvents.filter((event) => event.unsupportedMidiPitch).length,
    totalScoreDuration,
    tempoEventCount,
  }
}

export function buildExpectedPerformancePlan(score: NormalizedScore, options: ExpectedPerformanceOptions): ExpectedPerformancePlan {
  if (!Number.isFinite(options.fallbackQuarterBpm) || options.fallbackQuarterBpm <= 0) {
    throw new ExpectedPerformanceBuildError('INVALID_FALLBACK_TEMPO', 'Fallback quarter-note BPM must be positive.')
  }
  const parts = selectedParts(score, options.includedPartIds)
  const partIds = parts.map((part) => part.id)
  const notes = collectNotes(parts, score)
  const attacks: ExpectedNoteAttack[] = []
  const soundingNotes: ExpectedSoundingNote[] = []
  const flexibleEvents: ExpectedFlexibleEvent[] = []
  const warnings: ExpectedPerformanceWarning[] = []
  const openTies = new Map<string, OpenTieChain>()

  for (const { note, partId } of notes) {
    const context = noteWarningContext(partId, note)
    if (note.isCue) {
      flexibleEvents.push(createFlexibleEvent(note, partId, 'cue'))
      warnings.push({ ...context, code: 'CUE_NOTE_EXCLUDED', severity: 'info', message: `Cue note ${note.pitch?.spelling ?? note.id} is preserved but excluded from required attacks.` })
      if (!note.pitch || note.pitch.midi === null) warnings.push({ ...context, code: 'UNSUPPORTED_MIDI_PITCH', severity: 'warning', message: `${note.pitch?.spelling ?? 'This cue note'} has no standard MIDI pitch and remains excluded.` })
      if (note.pitch?.outsidePianoRange) warnings.push({ ...context, code: 'OUTSIDE_PIANO_RANGE', severity: 'warning', message: `${note.pitch.spelling} is outside the standard 88-key piano range.` })
      continue
    }
    if (note.isGrace) {
      flexibleEvents.push(createFlexibleEvent(note, partId, 'grace'))
      warnings.push({ ...context, code: 'GRACE_TIMING_FLEXIBLE', severity: 'info', message: `Grace note ${note.pitch?.spelling ?? note.id} has flexible timing and is not placed in a fixed onset group.` })
      if (!note.pitch || note.pitch.midi === null) warnings.push({ ...context, code: 'UNSUPPORTED_MIDI_PITCH', severity: 'warning', message: `${note.pitch?.spelling ?? 'This grace note'} has no standard MIDI pitch and cannot be mapped to a piano key.` })
      if (note.pitch?.outsidePianoRange) warnings.push({ ...context, code: 'OUTSIDE_PIANO_RANGE', severity: 'warning', message: `${note.pitch.spelling} is outside the standard 88-key piano range.` })
      continue
    }
    if (!note.pitch || note.pitch.midi === null || note.duration === null) {
      flexibleEvents.push(createFlexibleEvent(note, partId, 'unsupported-pitch'))
      warnings.push({ ...context, code: 'UNSUPPORTED_MIDI_PITCH', severity: 'warning', message: `${note.pitch?.spelling ?? 'This notation event'} has no standard MIDI pitch and cannot become a required piano attack.` })
      if (note.pitch?.outsidePianoRange) warnings.push({ ...context, code: 'OUTSIDE_PIANO_RANGE', severity: 'warning', message: `${note.pitch.spelling} is outside the standard 88-key piano range.` })
      continue
    }

    const key = tieKey(partId, note)!
    const openChain = openTies.get(key)
    if (note.tieStop && openChain && equalTime(note.absoluteOnset, openChain.sounding.end)) {
      extendTieChain(openChain, note)
      if (!note.tieStart) openTies.delete(key)
      continue
    }

    if (note.tieStop) {
      warnings.push({ ...context, code: 'AMBIGUOUS_TIE_CHAIN', severity: 'warning', message: `Tie continuation ${note.pitch.spelling} could not be joined safely by exact pitch, voice, staff, and onset continuity; it remains a separate attack.` })
    } else if (openChain) {
      warnings.push({ ...context, code: 'AMBIGUOUS_TIE_CHAIN', severity: 'warning', message: `A new ${note.pitch.spelling} attack arrived before the preceding tie chain was closed.` })
      openTies.delete(key)
    }

    const chain = createRequiredNote(note, partId)
    attacks.push(chain.attack)
    soundingNotes.push(chain.sounding)
    if (note.tieStart) openTies.set(key, chain)
    if (note.pitch.outsidePianoRange) {
      warnings.push({ ...context, code: 'OUTSIDE_PIANO_RANGE', severity: 'warning', message: `${note.pitch.spelling} remains an expected MIDI attack but is outside the standard 88-key piano range.` })
    }
  }

  for (const chain of openTies.values()) {
    warnings.push({
      code: 'AMBIGUOUS_TIE_CHAIN',
      severity: 'warning',
      sourceNoteId: chain.attack.sourceNoteIds[chain.attack.sourceNoteIds.length - 1],
      partId: chain.attack.partId,
      measureIndex: chain.lastNote.measureIndex,
      measureNumber: chain.lastNote.measureNumber,
      position: chain.sounding.end,
      message: `Tie chain ${chain.sounding.pitch.spelling} has no safely matched stopping segment.`,
    })
  }

  attachFlexibleAnchors(flexibleEvents, attacks)
  const onsetGroups = buildOnsetGroups(attacks)
  const selectedTempoEvents = score.tempoEvents.filter((event) => partIds.includes(event.partId))
  const { timeline, warnings: tempoWarnings } = buildTempoTimeline(selectedTempoEvents, options.fallbackQuarterBpm)
  warnings.push(...tempoWarnings)
  const totalScoreDuration = scoreDuration(parts)
  const statistics = calculateStatistics(parts, attacks, soundingNotes, onsetGroups, flexibleEvents, totalScoreDuration, selectedTempoEvents.length)
  const idSeed = JSON.stringify({ scoreId: score.id, partIds, fallbackQuarterBpm: options.fallbackQuarterBpm })
  return {
    id: `expected-plan:${stableHash(idSeed)}`,
    scoreId: score.id,
    includedPartIds: partIds,
    soundingNotes,
    attacks,
    onsetGroups,
    flexibleEvents,
    tempoTimeline: timeline,
    warnings,
    statistics,
  }
}
