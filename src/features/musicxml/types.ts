import type { MusicalTime } from './musicalTime'

export type ScoreSourceFormat = 'musicxml' | 'xml' | 'mxl'
export type ScoreWarningSeverity = 'info' | 'warning'
export type PitchStep = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G'

export type ScoreWarningCode =
  | 'MICROTONAL_PITCH'
  | 'OUTSIDE_PIANO_RANGE'
  | 'UNPITCHED_NOTE'
  | 'MEASURE_DURATION_MISMATCH'
  | 'MISSING_VOICE'
  | 'MISSING_STAFF'
  | 'UNSUPPORTED_TEMPO_MARK'
  | 'UNSUPPORTED_ELEMENT'
  | 'UNSUPPORTED_PEDAL'

export interface ScoreWarning {
  code: ScoreWarningCode
  severity: ScoreWarningSeverity
  message: string
  partId?: string
  measureIndex?: number
  measureNumber?: string
  eventId?: string
}

export interface ScorePitch {
  step: PitchStep
  alter: number
  octave: number
  midi: number | null
  spelling: string
  outsidePianoRange: boolean
}

export interface TimeSignature {
  beats: string
  beatType: number
  expectedDuration: MusicalTime | null
}

export interface KeySignature {
  fifths: number
  mode: string | null
}

export interface Clef {
  staff: number
  sign: string
  line: number | null
  octaveChange: number | null
}

export interface TupletRatio {
  actualNotes: number
  normalNotes: number
}

export type Articulation = 'staccato' | 'staccatissimo' | 'tenuto' | 'accent' | 'strong-accent' | 'fermata'

export interface SlurMark {
  type: 'start' | 'stop' | 'continue'
  number: string | null
}

interface ScoreEventBase {
  id: string
  xmlOrder: number
  measureIndex: number
  measureNumber: string
  onset: MusicalTime
  absoluteOnset: MusicalTime
  voice: string | null
  staff: number | null
}

export interface NormalizedNote extends ScoreEventBase {
  type: 'note'
  pitch: ScorePitch | null
  duration: MusicalTime | null
  chordId: string | null
  isChordTone: boolean
  isGrace: boolean
  isCue: boolean
  accidental: string | null
  dotCount: number
  tuplet: TupletRatio | null
  tieStart: boolean
  tieStop: boolean
  notationTieStart: boolean
  notationTieStop: boolean
  articulations: Articulation[]
  slurs: SlurMark[]
}

export interface NormalizedRest extends ScoreEventBase {
  type: 'rest'
  duration: MusicalTime
  isMeasureRest: boolean
  isCue: boolean
  dotCount: number
  tuplet: TupletRatio | null
}

export interface NormalizedForward extends ScoreEventBase {
  type: 'forward'
  duration: MusicalTime
}

export type NormalizedMeasureEvent = NormalizedNote | NormalizedRest | NormalizedForward

export interface NormalizedMeasure {
  id: string
  index: number
  number: string
  implicit: boolean
  absoluteOnset: MusicalTime
  expectedDuration: MusicalTime | null
  actualContentDuration: MusicalTime
  divisions: number | null
  timeSignature: TimeSignature | null
  keySignature: KeySignature | null
  clefs: Clef[]
  events: NormalizedMeasureEvent[]
}

export interface NormalizedPart {
  id: string
  name: string | null
  abbreviation: string | null
  measures: NormalizedMeasure[]
}

export interface ScoreMetadata {
  workTitle: string | null
  movementTitle: string | null
  title: string | null
  composer: string | null
  creators: Array<{ type: string | null; name: string }>
  partNames: string[]
}

export interface TempoEvent {
  id: string
  position: MusicalTime
  measureOnset: MusicalTime
  partId: string
  measureIndex: number
  staff: number | null
  voice: string | null
  quarterBpm: number
  source: 'sound' | 'metronome'
  display: string | null
}

export type DynamicMarking = 'ppp' | 'pp' | 'p' | 'mp' | 'mf' | 'f' | 'ff' | 'fff'

export interface DynamicEvent {
  id: string
  position: MusicalTime
  measureOnset: MusicalTime
  partId: string
  measureIndex: number
  staff: number | null
  voice: string | null
  marking: DynamicMarking
}

export interface WedgeEvent {
  id: string
  position: MusicalTime
  partId: string
  measureIndex: number
  type: 'crescendo' | 'diminuendo' | 'stop' | 'continue'
  number: string | null
}

export interface PedalEvent {
  id: string
  position: MusicalTime
  partId: string
  measureIndex: number
  staff: number | null
  type: 'start' | 'stop' | 'change' | 'continue'
}

export interface ScoreStatistics {
  partCount: number
  measureCount: number
  pitchedNoteCount: number
  restCount: number
  chordCount: number
  uniqueVoices: string[]
  staffCount: number
  pitchRange: { lowest: ScorePitch; highest: ScorePitch } | null
  pianoRangeViolationCount: number
  tempoEventCount: number
  timeSignatureChangeCount: number
  keySignatureChangeCount: number
  dynamicEventCount: number
  notatedDuration: MusicalTime
}

export interface NormalizedScore {
  id: string
  metadata: ScoreMetadata
  parts: NormalizedPart[]
  tempoEvents: TempoEvent[]
  dynamicEvents: DynamicEvent[]
  wedgeEvents: WedgeEvent[]
  pedalEvents: PedalEvent[]
  warnings: ScoreWarning[]
  statistics: ScoreStatistics
}

export interface LoadedMusicXml {
  fileName: string
  sourceFormat: ScoreSourceFormat
  musicXmlText: string
  sourceBytes: number
  uncompressedBytes: number
}

export interface ScoreFileLike {
  readonly name: string
  readonly size: number
  text(): Promise<string>
  arrayBuffer(): Promise<ArrayBuffer>
}
