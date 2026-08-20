import type { MusicalTime } from '../musicxml/musicalTime'

export type GradingScopeType = 'aligned-span' | 'full-plan'
export type NoteGradingStatus = 'ready' | 'unavailable'
export type NoteGradingReliability = 'reliable' | 'provisional' | 'unavailable'
export type TargetExclusionReason = 'OUTSIDE_STANDARD_PIANO_RANGE'
export type FlexibleExclusionReason = 'GRACE_TIMING_FLEXIBLE' | 'CUE_EXCLUDED' | 'UNSUPPORTED_MIDI_PITCH'

export interface ExpectedKeyTarget {
  readonly id: string
  readonly onsetGroupId: string
  readonly midi: number
  readonly sourceExpectedAttackIds: readonly string[]
  readonly sourceNoteIds: readonly string[]
  readonly scorePosition: MusicalTime
  readonly partIds: readonly string[]
  readonly measureIndices: readonly number[]
  readonly measureNumbers: readonly string[]
  readonly staffs: readonly number[]
  readonly voices: readonly string[]
  readonly outsideStandardPianoRange: boolean
  readonly eligibility: 'gradeable' | 'excluded'
  readonly exclusionReason?: TargetExclusionReason
}

export interface ExpectedEventExclusion {
  readonly id: string
  readonly flexibleEventId: string
  readonly sourceNoteId: string
  readonly reason: FlexibleExclusionReason
  readonly midi: number | null
  readonly scorePosition: MusicalTime
  readonly partId: string
  readonly measureIndex: number
  readonly measureNumber: string
}

interface ExpectedTargetResultBase {
  readonly id: string
  readonly target: ExpectedKeyTarget
  readonly groupAlignmentId: string | null
}

export interface CorrectExpectedTargetResult extends ExpectedTargetResultBase {
  readonly kind: 'correct'
  readonly performedAttackId: string
}

export interface WrongPitchExpectedTargetResult extends ExpectedTargetResultBase {
  readonly kind: 'wrong-pitch'
  readonly performedAttackId: string
  readonly performedMidi: number
  readonly semitoneDelta: number
  readonly absoluteSemitoneDistance: number
  readonly octaveDisplacement: number | null
  readonly confidence: 'likely' | 'ambiguous'
  readonly pairingMethod: 'minimum-total-distance'
}

export interface MissedExpectedTargetResult extends ExpectedTargetResultBase {
  readonly kind: 'missed'
}

export interface UnattemptedExpectedTargetResult extends ExpectedTargetResultBase {
  readonly kind: 'unattempted'
  readonly reason: 'outside-grading-scope'
}

export interface ExcludedExpectedTargetResult extends ExpectedTargetResultBase {
  readonly kind: 'excluded'
  readonly reason: TargetExclusionReason
}

export type ExpectedTargetResult =
  | CorrectExpectedTargetResult
  | WrongPitchExpectedTargetResult
  | MissedExpectedTargetResult
  | UnattemptedExpectedTargetResult
  | ExcludedExpectedTargetResult

interface PerformedAttackResultBase {
  readonly id: string
  readonly performedAttackId: string
  readonly performedGroupId: string
  readonly groupAlignmentId: string | null
  readonly midi: number
  readonly sequence: number
  readonly attackMs: number
}

export interface CorrectPerformedAttackResult extends PerformedAttackResultBase {
  readonly kind: 'correct'
  readonly expectedTargetId: string
}

export interface WrongPitchPerformedAttackResult extends PerformedAttackResultBase {
  readonly kind: 'wrong-pitch'
  readonly expectedTargetId: string
  readonly expectedMidi: number
  readonly semitoneDelta: number
  readonly absoluteSemitoneDistance: number
  readonly octaveDisplacement: number | null
  readonly confidence: 'likely' | 'ambiguous'
}

export interface AdditionalPerformedAttackResult extends PerformedAttackResultBase {
  readonly kind: 'additional'
}

export interface OutsideScopePerformedAttackResult extends PerformedAttackResultBase {
  readonly kind: 'outside-scope'
  readonly reason: 'outside-grading-scope' | 'matched-excluded-target'
}

export type PerformedAttackResult =
  | CorrectPerformedAttackResult
  | WrongPitchPerformedAttackResult
  | AdditionalPerformedAttackResult
  | OutsideScopePerformedAttackResult

export interface WrongPitchCorrespondence {
  readonly id: string
  readonly expectedTargetId: string
  readonly performedAttackId: string
  readonly expectedMidi: number
  readonly performedMidi: number
  readonly semitoneDelta: number
  readonly absoluteSemitoneDistance: number
  readonly octaveDisplacement: number | null
  readonly groupAlignmentId: string
  readonly confidence: 'likely' | 'ambiguous'
  readonly pairingMethod: 'minimum-total-distance'
}

export type GroupNoteClassification = 'perfect' | 'partial' | 'wrong-only' | 'missed-group' | 'additional-group' | 'excluded-group' | 'outside-scope'

export interface GroupNoteResult {
  readonly id: string
  readonly groupAlignmentId: string
  readonly classification: GroupNoteClassification
  readonly expectedGroupId: string | null
  readonly performedGroupId: string | null
  readonly scorePosition: MusicalTime | null
  readonly measureIndices: readonly number[]
  readonly measureNumbers: readonly string[]
  readonly expectedTargetIds: readonly string[]
  readonly performedAttackIds: readonly string[]
  readonly expectedResultIds: readonly string[]
  readonly performedResultIds: readonly string[]
  readonly counts: Readonly<{ correct: number; wrongPitch: number; missed: number; additional: number }>
}

export interface GradingScope {
  readonly type: GradingScopeType
  readonly expectedStartIndex: number | null
  readonly expectedEndIndex: number | null
  readonly performedStartIndex: number | null
  readonly performedEndIndex: number | null
  readonly expectedStartGroupId: string | null
  readonly expectedEndGroupId: string | null
  readonly performedStartGroupId: string | null
  readonly performedEndGroupId: string | null
  readonly outsideScopeExpectedGroupCount: number
  readonly outsideScopePerformedGroupCount: number
}

export interface NoteGradingCounts {
  readonly correct: number
  readonly wrongPitch: number
  readonly missed: number
  readonly additional: number
  readonly gradeableExpectedTargets: number
  readonly gradedPerformedAttacks: number
  readonly excludedExpectedTargets: number
  readonly outsideScopeExpectedTargets: number
  readonly outsideScopePerformedAttacks: number
  readonly excludedFlexibleEvents: number
}

export interface NoteGradingMetrics {
  readonly precision: number | null
  readonly recall: number | null
  readonly noteScore: number | null
}

export type NoteGradingWarningCode =
  | 'INPUT_ID_MISMATCH'
  | 'ALIGNMENT_UNAVAILABLE'
  | 'PROVISIONAL_ALIGNMENT'
  | 'NO_GRADEABLE_TARGETS'
  | 'EXPECTED_EVENTS_EXCLUDED'
  | 'WRONG_PITCH_PAIRING_AMBIGUOUS'
  | 'WRONG_PITCH_PAIRING_GUARDRAIL'

export interface NoteGradingWarning {
  readonly code: NoteGradingWarningCode
  readonly severity: 'info' | 'warning'
  readonly message: string
  readonly groupAlignmentId?: string
}

export interface NoteGradingDiagnostics {
  readonly noteGradingEngineVersion: string
  readonly alignmentEngineVersion: string
  readonly expectedKeyTargetCount: number
  readonly gradeableTargetCount: number
  readonly excludedTargetCount: number
  readonly flexibleExclusionCount: number
  readonly groupResultCount: number
  readonly ambiguousWrongPitchCount: number
  readonly pairingGuardrailGroupCount: number
}

export interface NoteGradingResult {
  readonly id: string
  readonly status: NoteGradingStatus
  readonly reliability: NoteGradingReliability
  readonly unavailableReason: string | null
  readonly expectedPlanId: string
  readonly recordingId: string
  readonly alignmentId: string
  readonly scope: GradingScope
  readonly expectedTargets: readonly ExpectedKeyTarget[]
  readonly expectedExclusions: readonly ExpectedEventExclusion[]
  readonly expectedResults: readonly ExpectedTargetResult[]
  readonly performedResults: readonly PerformedAttackResult[]
  readonly wrongPitchCorrespondences: readonly WrongPitchCorrespondence[]
  readonly groupResults: readonly GroupNoteResult[]
  readonly counts: NoteGradingCounts
  readonly metrics: NoteGradingMetrics
  readonly diagnostics: NoteGradingDiagnostics
  readonly warnings: readonly NoteGradingWarning[]
}
