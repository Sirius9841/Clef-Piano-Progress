import type { MusicalTime } from '../musicxml/musicalTime'
import type { ScorePitch } from '../musicxml/types'

export type ExpectedPerformanceWarningCode =
  | 'AMBIGUOUS_TIE_CHAIN'
  | 'UNSUPPORTED_MIDI_PITCH'
  | 'OUTSIDE_PIANO_RANGE'
  | 'CUE_NOTE_EXCLUDED'
  | 'GRACE_TIMING_FLEXIBLE'
  | 'MISSING_TEMPO_BEFORE_FIRST_EVENT'
  | 'CONFLICTING_TEMPO_EVENTS'

export interface ExpectedPerformanceWarning {
  code: ExpectedPerformanceWarningCode
  severity: 'info' | 'warning'
  message: string
  sourceNoteId?: string
  partId?: string
  measureIndex?: number
  measureNumber?: string
  position?: MusicalTime
}

export interface ExpectedNoteAttack {
  id: string
  sourceNoteIds: string[]
  partId: string
  measureIndex: number
  measureNumber: string
  staff: number | null
  voice: string | null
  pitch: ScorePitch
  midi: number
  onset: MusicalTime
  expectedDuration: MusicalTime
  required: true
  outsideStandardPianoRange: boolean
}

export interface ExpectedSoundingNote {
  id: string
  attackId: string
  sourceNoteIds: string[]
  partId: string
  staff: number | null
  voice: string | null
  pitch: ScorePitch
  onset: MusicalTime
  end: MusicalTime
  duration: MusicalTime
}

export type FlexibleEventKind = 'grace' | 'cue' | 'unsupported-pitch'

export interface ExpectedFlexibleEvent {
  id: string
  sourceNoteId: string
  kind: FlexibleEventKind
  timingPolicy: 'flexible' | 'excluded'
  required: false
  anchorPosition: MusicalTime
  anchorAttackId: string | null
  partId: string
  measureIndex: number
  measureNumber: string
  staff: number | null
  voice: string | null
  pitch: ScorePitch | null
  midi: number | null
  unsupportedMidiPitch: boolean
  outsideStandardPianoRange: boolean
  sourceOrder: number
}

export interface ExpectedOnsetGroup {
  id: string
  position: MusicalTime
  attackIds: string[]
  midiNotes: number[]
  measureIndices: number[]
  measureNumbers: string[]
  isMultiNote: boolean
}

export interface TempoTimelinePoint {
  id: string
  position: MusicalTime
  quarterBpm: number
  source: 'authored' | 'fallback'
  sourceEventIds: string[]
}

export interface TempoTimeline {
  fallbackQuarterBpm: number
  points: TempoTimelinePoint[]
  usesFallback: boolean
}

export interface ExpectedPerformanceStatistics {
  requiredAttackCount: number
  onsetGroupCount: number
  multiNoteGroupCount: number
  soundingNoteCount: number
  flexibleGraceCount: number
  excludedCueCount: number
  includedPartCount: number
  pitchRange: { lowest: number; highest: number } | null
  outsideStandardPianoRangeCount: number
  unsupportedPitchCount: number
  totalScoreDuration: MusicalTime
  tempoEventCount: number
}

export interface ExpectedPerformancePlan {
  id: string
  scoreId: string
  includedPartIds: string[]
  soundingNotes: ExpectedSoundingNote[]
  attacks: ExpectedNoteAttack[]
  onsetGroups: ExpectedOnsetGroup[]
  flexibleEvents: ExpectedFlexibleEvent[]
  tempoTimeline: TempoTimeline
  warnings: ExpectedPerformanceWarning[]
  statistics: ExpectedPerformanceStatistics
}

export type ExpectedPerformanceBuildErrorCode = 'PART_SELECTION_REQUIRED' | 'INVALID_PART_SELECTION' | 'INVALID_FALLBACK_TEMPO'

export class ExpectedPerformanceBuildError extends Error {
  constructor(readonly code: ExpectedPerformanceBuildErrorCode, message: string) {
    super(message)
    this.name = 'ExpectedPerformanceBuildError'
  }
}
