import { alignPerformance } from '../../alignment/alignPerformance'
import { makePlan, makeRecording } from '../../alignment/__tests__/fixtures'
import type { ExpectedPerformancePlan } from '../../expected-performance/types'
import { musicalTime } from '../../musicxml/musicalTime'
import type { NormalizedMeasure, NormalizedNote, NormalizedScore, ScorePitch } from '../../musicxml/types'
import { gradeNotes } from '../../note-grading/gradeNotes'
import type { GradingScopeType } from '../../note-grading/types'
import type { PerformanceRecording } from '../../performance/types'
import { analyzeTiming } from '../../timing-analysis/analyzeTiming'
import { buildPerformanceResults } from '../buildPerformanceResults'

function pitch(midi: number): ScorePitch {
  return { step: 'C', alter: 0, octave: Math.floor(midi / 12) - 1, midi, spelling: `MIDI ${midi}`, outsidePianoRange: midi < 21 || midi > 108 }
}

export function makeResultPlan(measureCount: number, groupsPerMeasure = 4, options: { tempoPoints?: readonly { position: number; bpm: number }[] } = {}): ExpectedPerformancePlan {
  const groupCount = measureCount * groupsPerMeasure
  return makePlan(
    Array.from({ length: groupCount }, (_, index) => [60 + index % 8]),
    {
      positions: Array.from({ length: groupCount }, (_, index) => index),
      measureIndices: Array.from({ length: groupCount }, (_, index) => Math.floor(index / groupsPerMeasure)),
      tempoPoints: options.tempoPoints,
    },
  )
}

export function makeScore(plan: ExpectedPerformancePlan, measureCount?: number, groupsPerMeasure = 4): NormalizedScore {
  const count = measureCount ?? Math.max(0, ...plan.attacks.map((attack) => attack.measureIndex)) + 1
  const measures: NormalizedMeasure[] = Array.from({ length: count }, (_, index) => {
    const events: NormalizedNote[] = plan.attacks.filter((attack) => attack.measureIndex === index).map((attack, eventIndex) => ({
      id: attack.sourceNoteIds[0] ?? `source-note:${index}:${eventIndex}`,
      type: 'note',
      xmlOrder: eventIndex,
      measureIndex: index,
      measureNumber: String(index + 1),
      onset: musicalTime(eventIndex),
      absoluteOnset: attack.onset,
      voice: attack.voice,
      staff: attack.staff,
      pitch: pitch(attack.midi),
      duration: musicalTime(1),
      chordId: null,
      isChordTone: false,
      isGrace: false,
      isCue: false,
      accidental: null,
      dotCount: 0,
      tuplet: null,
      tieStart: false,
      tieStop: false,
      notationTieStart: false,
      notationTieStop: false,
      articulations: [],
      slurs: [],
    }))
    return {
      id: `measure:P1:${index}`,
      index,
      number: String(index + 1),
      implicit: false,
      absoluteOnset: musicalTime(index * groupsPerMeasure),
      expectedDuration: musicalTime(groupsPerMeasure),
      actualContentDuration: musicalTime(groupsPerMeasure),
      divisions: 1,
      timeSignature: { beats: String(groupsPerMeasure), beatType: 4, expectedDuration: musicalTime(groupsPerMeasure) },
      keySignature: null,
      clefs: [],
      events,
    }
  })
  return {
    id: plan.scoreId,
    metadata: { workTitle: 'Test work', movementTitle: null, title: 'Test score', composer: null, creators: [], partNames: ['Piano'] },
    parts: [{ id: 'P1', name: 'Piano', abbreviation: 'Pno.', measures }],
    tempoEvents: [],
    tempoDirectionEvents: [],
    dynamicEvents: [],
    wedgeEvents: [],
    pedalEvents: [],
    warnings: [],
    statistics: {
      partCount: 1,
      measureCount: count,
      pitchedNoteCount: plan.attacks.length,
      restCount: 0,
      chordCount: 0,
      uniqueVoices: [...new Set(plan.attacks.map((attack) => attack.voice).filter((voice): voice is string => voice !== null))],
      staffCount: 2,
      pitchRange: null,
      pianoRangeViolationCount: 0,
      tempoEventCount: 0,
      timeSignatureChangeCount: 0,
      keySignatureChangeCount: 0,
      dynamicEventCount: 0,
      notatedDuration: musicalTime(count * groupsPerMeasure),
    },
  }
}

export function recordingForPlan(plan: ExpectedPerformancePlan, mutate?: (attack: { ms: number; midi: number }, index: number) => { ms: number; midi: number } | null): PerformanceRecording {
  const attacks = plan.attacks.map((attack, index) => ({ ms: 1_000 + index * 500, midi: attack.midi })).map((attack, index) => mutate ? mutate(attack, index) : attack).filter((attack): attack is { ms: number; midi: number } => attack !== null)
  return makeRecording(attacks, { planId: plan.id })
}

export function analyzeResult(plan: ExpectedPerformancePlan, recording: PerformanceRecording, scope: GradingScopeType = 'full-plan') {
  const score = makeScore(plan, undefined, Math.ceil(plan.onsetGroups.length / (Math.max(...plan.attacks.map((attack) => attack.measureIndex)) + 1)))
  const alignment = alignPerformance(plan, recording)
  const noteGrading = gradeNotes({ expectedPlan: plan, recording, alignment, options: { gradingScope: scope } })
  const timingAnalysis = analyzeTiming({ expectedPlan: plan, recording, alignment, noteGrading })
  return { score, alignment, noteGrading, timingAnalysis, results: buildPerformanceResults({ normalizedScore: score, expectedPlan: plan, alignment, noteGrading, timingAnalysis }) }
}
