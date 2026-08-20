import { addTime, compareTime, equalTime, maxTime, ZERO_TIME } from './musicalTime'
import type { KeySignature, NormalizedMeasure, NormalizedScore, ScorePitch, ScoreStatistics, TimeSignature } from './types'

function timeSignatureEqual(left: TimeSignature | null, right: TimeSignature | null): boolean {
  return left?.beats === right?.beats && left?.beatType === right?.beatType
}

function keySignatureEqual(left: KeySignature | null, right: KeySignature | null): boolean {
  return left?.fifths === right?.fifths && left?.mode === right?.mode
}

function measureSpan(measure: NormalizedMeasure) {
  return compareTime(measure.actualContentDuration, ZERO_TIME) > 0
    ? measure.actualContentDuration
    : measure.expectedDuration ?? ZERO_TIME
}

export function calculateScoreStatistics(score: Omit<NormalizedScore, 'statistics'>): ScoreStatistics {
  const events = score.parts.flatMap((part) => part.measures.flatMap((measure) => measure.events))
  const notes = events.filter((event) => event.type === 'note')
  const pitchedNotes = notes.filter((note) => note.pitch !== null)
  const pitches = pitchedNotes.map((note) => note.pitch).filter((pitch): pitch is ScorePitch => pitch !== null && pitch.midi !== null)
  const uniqueVoices = [...new Set(events.map((event) => event.voice).filter((voice): voice is string => voice !== null))].sort()
  const staffKeys = new Set(score.parts.flatMap((part) => part.measures.flatMap((measure) => measure.events.map((event) => event.staff === null ? null : `${part.id}:${event.staff}`))).filter((staff): staff is string => staff !== null))
  const chordIds = new Set(notes.map((note) => note.chordId).filter((id): id is string => id !== null))

  let lowest: ScorePitch | null = null
  let highest: ScorePitch | null = null
  for (const pitch of pitches) {
    if (!lowest || (pitch.midi ?? 128) < (lowest.midi ?? 128)) lowest = pitch
    if (!highest || (pitch.midi ?? -1) > (highest.midi ?? -1)) highest = pitch
  }

  let timeSignatureChangeCount = 0
  let keySignatureChangeCount = 0
  for (const part of score.parts) {
    let previousTime: TimeSignature | null = null
    let previousKey: KeySignature | null = null
    part.measures.forEach((measure, index) => {
      if (index > 0 && measure.timeSignature && !timeSignatureEqual(previousTime, measure.timeSignature)) timeSignatureChangeCount += 1
      if (index > 0 && measure.keySignature && !keySignatureEqual(previousKey, measure.keySignature)) keySignatureChangeCount += 1
      previousTime = measure.timeSignature
      previousKey = measure.keySignature
    })
  }

  let notatedDuration = ZERO_TIME
  for (const part of score.parts) {
    const duration = part.measures.reduce((total, measure) => addTime(total, measureSpan(measure)), ZERO_TIME)
    notatedDuration = maxTime(notatedDuration, duration)
  }

  return {
    partCount: score.parts.length,
    measureCount: Math.max(0, ...score.parts.map((part) => part.measures.length)),
    pitchedNoteCount: pitchedNotes.length,
    restCount: events.filter((event) => event.type === 'rest').length,
    chordCount: chordIds.size,
    uniqueVoices,
    staffCount: staffKeys.size,
    pitchRange: lowest && highest ? { lowest, highest } : null,
    pianoRangeViolationCount: pitchedNotes.filter((note) => note.pitch?.outsidePianoRange).length,
    tempoEventCount: score.tempoEvents.length,
    timeSignatureChangeCount,
    keySignatureChangeCount,
    dynamicEventCount: score.dynamicEvents.length,
    notatedDuration,
  }
}

export function measuresHaveEqualDurations(left: NormalizedMeasure, right: NormalizedMeasure): boolean {
  return equalTime(left.actualContentDuration, right.actualContentDuration)
}
