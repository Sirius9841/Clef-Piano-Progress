import type { ExpectedNoteAttack } from '../expected-performance/types'
import type { MusicalTime } from '../musicxml/musicalTime'

export type AlignmentStatus = 'aligned' | 'insufficient-data' | 'ambiguous' | 'failed'

export type ScoreRegionLocalizationHint =
  | Readonly<{ mode: 'auto' }>
  | Readonly<{ mode: 'beginning' }>
  | Readonly<{
      mode: 'section'
      scoreVersionId: string
      startMeasureIndex: number
      endMeasureIndex: number
      sourceMeasureIds: readonly string[]
    }>
  | Readonly<{ mode: 'confirmed'; expectedStartIndex: number; expectedEndIndex: number }>

export type ScoreRegionLocalizationStatus = 'confident' | 'limited' | 'ambiguous' | 'divergent' | 'insufficient-data'
export type ScoreRegionLocalizationResolution = 'automatic' | 'intended-start' | 'user-confirmed' | 'unresolved'

export interface ScoreRegionCandidateEvidence {
  readonly normalizedPitchCost: number
  readonly exactPitchAnchorCount: number
  readonly exactPitchPairCount: number
  readonly exactPitchAnchorDensity: number
  readonly correspondenceCount: number
  readonly correspondenceDensity: number
  readonly performedCoverage: number
  readonly longestUnsupportedGap: number
  readonly quality: number
}

export interface ScoreRegionCandidate {
  readonly id: string
  readonly expectedStartIndex: number
  readonly expectedEndIndex: number
  readonly expectedStartGroupId: string
  readonly expectedEndGroupId: string
  readonly performedStartIndex: number
  readonly performedEndIndex: number
  readonly measureIndices: readonly number[]
  readonly measureNumbers: readonly string[]
  readonly displayRange: string
  readonly hintAgreement: 'exact' | 'near' | 'none'
  readonly evidence: ScoreRegionCandidateEvidence
}

export interface MatchedTakeRegion {
  readonly expectedStartIndex: number
  readonly expectedEndIndex: number
  readonly expectedStartGroupId: string
  readonly expectedEndGroupId: string
  readonly performedStartIndex: number
  readonly performedEndIndex: number
  readonly performedStartGroupId: string
  readonly performedEndGroupId: string
  readonly measureIndices: readonly number[]
  readonly measureNumbers: readonly string[]
  readonly displayRange: string
  readonly confidence: 'confident' | 'limited'
}

export interface ScoreRegionLocalization {
  readonly status: ScoreRegionLocalizationStatus
  readonly resolution: ScoreRegionLocalizationResolution
  readonly intendedStart: ScoreRegionLocalizationHint
  readonly selectedCandidateId: string | null
  readonly candidates: readonly ScoreRegionCandidate[]
  readonly bestVsSecondQualitySeparation: number | null
  readonly takeRegion: MatchedTakeRegion | null
  readonly explanation: string
}

export interface PerformedAttack {
  readonly id: string
  readonly sourceKeyPressId: string
  readonly midi: number
  readonly velocity: number
  readonly attackMs: number
  readonly channel: number
  readonly sequence: number
}

export interface PerformedOnsetGroup {
  readonly id: string
  readonly attacks: readonly PerformedAttack[]
  readonly startMs: number
  readonly endMs: number
  readonly representativeMs: number
  readonly spreadMs: number
  readonly pitches: readonly number[]
}

export interface ExpectedAlignmentGroup {
  readonly id: string
  readonly position: MusicalTime
  readonly referenceMs: number
  readonly attackIds: readonly string[]
  readonly attacks: readonly ExpectedNoteAttack[]
  readonly pitches: readonly number[]
  readonly measureIndices: readonly number[]
  readonly measureNumbers: readonly string[]
}

export interface PitchComparison {
  readonly exactPitchCount: number
  readonly unpairedExpectedCount: number
  readonly unpairedPerformedCount: number
  readonly cost: number
}

export interface AttackPair {
  readonly expectedAttackId: string
  readonly performedAttackId: string
  readonly midi: number
}

export interface AttackCorrespondence {
  readonly pairs: readonly AttackPair[]
  readonly unpairedExpectedAttackIds: readonly string[]
  readonly unpairedPerformedAttackIds: readonly string[]
}

export interface MatchCostComponents {
  readonly pitchCost: number
  readonly timingCost: number
  readonly totalCost: number
}

interface AlignmentStepBase {
  readonly id: string
}

export interface GroupCorrespondence extends AlignmentStepBase {
  readonly kind: 'correspondence'
  readonly expectedGroup: ExpectedAlignmentGroup
  readonly performedGroup: PerformedOnsetGroup
  readonly predictedPerformedMs: number
  readonly timingResidualMs: number
  readonly attacks: AttackCorrespondence
  readonly cost: MatchCostComponents
}

export interface ExpectedOnlyGroup extends AlignmentStepBase {
  readonly kind: 'expected-only'
  readonly expectedGroup: ExpectedAlignmentGroup
}

export interface PerformedOnlyGroup extends AlignmentStepBase {
  readonly kind: 'performed-only'
  readonly performedGroup: PerformedOnsetGroup
}

export type GroupAlignment = GroupCorrespondence | ExpectedOnlyGroup | PerformedOnlyGroup

export type TimeTransformSource = 'robust-fit' | 'single-anchor' | 'fallback'

export interface AlignmentTimeTransform {
  readonly offsetMs: number
  readonly scale: number
  readonly source: TimeTransformSource
  readonly anchorCount: number
  readonly retainedAnchorCount: number
  readonly offsetFitted: boolean
  readonly scaleFitted: boolean
  readonly scaleClamped: boolean
}

export type AlignmentWarningCode =
  | 'INSUFFICIENT_ATTACKS'
  | 'EMPTY_EXPECTED_PLAN'
  | 'WEAK_TIME_FIT'
  | 'TIME_SCALE_OUTLIER'
  | 'AMBIGUOUS_ALIGNMENT'
  | 'DUPLICATE_SIMULTANEOUS_EXPECTED_PITCH'
  | 'PERFORMED_GROUP_WIDE_SPREAD'
  | 'PARTIAL_PERFORMANCE'
  | 'SCORE_REGION_AMBIGUOUS'
  | 'SCORE_REGION_DIVERGENT'
  | 'NO_TIME_ANCHORS'
  | 'INPUT_TOO_LARGE'
  | 'PLAN_CONTEXT_MISMATCH'

export interface AlignmentWarning {
  readonly code: AlignmentWarningCode
  readonly severity: 'info' | 'warning'
  readonly message: string
  readonly expectedGroupId?: string
  readonly performedGroupId?: string
}

export interface AlignmentDiagnostics {
  readonly alignmentEngineVersion: string
  readonly expectedGroupCount: number
  readonly performedGroupCount: number
  readonly groupCorrespondenceCount: number
  readonly expectedOnlyGroupCount: number
  readonly performedOnlyGroupCount: number
  readonly exactPitchPairCount: number
  readonly coarseAlignmentCost: number
  readonly finalAlignmentCost: number
  readonly fitAnchorCount: number
  readonly retainedFitAnchorCount: number
  readonly medianAbsoluteTimingResidualMs: number | null
  readonly maximumAbsoluteTimingResidualMs: number | null
  readonly maximumPerformedGroupSpreadMs: number
  readonly matrixCellCount: number
}

export interface AlignmentResult {
  readonly id: string
  readonly status: AlignmentStatus
  readonly expectedPlanId: string
  readonly recordingId: string
  readonly practiceSpeedMultiplier: number
  /** Added by alignment 2.0.0. Absent only on frozen historical 1.0.0 snapshots. */
  readonly localization?: ScoreRegionLocalization
  readonly expectedGroups: readonly ExpectedAlignmentGroup[]
  readonly performedGroups: readonly PerformedOnsetGroup[]
  readonly groupAlignments: readonly GroupAlignment[]
  readonly unmatchedExpectedGroupIds: readonly string[]
  readonly unmatchedPerformedGroupIds: readonly string[]
  readonly timeTransform: AlignmentTimeTransform
  readonly diagnostics: AlignmentDiagnostics
  readonly warnings: readonly AlignmentWarning[]
}
