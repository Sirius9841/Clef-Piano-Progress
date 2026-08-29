import type { MusicalTime } from '../musicxml/musicalTime'
import type { TempoDirectionKind } from '../musicxml/types'
import type { GradingScopeType } from '../note-grading/types'

export type TimingAnalysisStatus = 'ready' | 'unavailable'
export type TimingAnalysisReliability = 'reliable' | 'limited' | 'provisional' | 'unavailable'
export type TimingAnchorQuality = 'strong-anchor' | 'usable-observation' | 'excluded'
export type TimingCategory = 'early' | 'on-time' | 'late'
export type RhythmIntervalCategory = 'compressed' | 'within-tolerance' | 'expanded'

export interface TimingAnalysisScope {
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

export type RhythmIntervalExclusionReason = 'first-usable-anchor' | 'structural-gap' | 'zero-reference-interval' | 'non-monotonic-performance-time' | 'anchor-excluded'

export interface RhythmObservation {
  readonly id: string
  readonly groupAlignmentId: string
  readonly expectedGroupId: string
  readonly performedGroupId: string
  readonly expectedPosition: MusicalTime
  readonly measureIndices: readonly number[]
  readonly measureNumbers: readonly string[]
  readonly referenceMs: number
  readonly predictedPerformedMs: number
  readonly observedMs: number
  readonly residualMs: number
  readonly timingCategory: TimingCategory
  readonly anchorQuality: TimingAnchorQuality
  readonly anchorReason: string
  readonly chordSpreadMs: number
  readonly previousExpectedGroupId: string | null
  readonly previousPerformedGroupId: string | null
  readonly referenceIntervalMs: number | null
  readonly predictedIntervalMs: number | null
  readonly performedIntervalMs: number | null
  readonly intervalDifferenceMs: number | null
  readonly normalizedIntervalError: number | null
  readonly allowedDeviationMs: number | null
  readonly rhythmLoss: number | null
  readonly intervalCategory: RhythmIntervalCategory | null
  readonly intervalExclusionReason: RhythmIntervalExclusionReason | null
}

export interface ChordSpreadDiagnostic {
  readonly id: string
  readonly expectedGroupId: string
  readonly performedGroupId: string
  readonly measureNumbers: readonly string[]
  readonly spreadMs: number
  readonly classification: 'tight' | 'moderate' | 'wide'
  readonly affectsRhythmScore: false
}

export interface RhythmRegionAggregate {
  readonly id: string
  readonly measureIndex: number
  readonly measureNumber: string
  readonly observationCount: number
  readonly scoredIntervalCount: number
  readonly rhythmScore: number | null
  readonly medianAbsoluteResidualMs: number | null
  readonly maximumAbsoluteIntervalDifferenceMs: number | null
}

export interface RhythmAnalysis {
  readonly rhythmScore: number | null
  readonly normalizationTimeScale: number | null
  readonly observations: readonly RhythmObservation[]
  readonly chordSpreadDiagnostics: readonly ChordSpreadDiagnostic[]
  readonly regions: readonly RhythmRegionAggregate[]
  readonly usableObservationCount: number
  readonly strongAnchorCount: number
  readonly scoredIntervalCount: number
  readonly excludedObservationCount: number
  readonly medianAbsoluteNormalizedIntervalError: number | null
  readonly medianAbsoluteResidualMs: number | null
  readonly proportionInsideTolerance: number | null
}

export interface NumericTempoRegion {
  readonly id: string
  readonly position: MusicalTime
  readonly authoredQuarterBpm: number
  readonly effectiveQuarterBpm: number
  readonly source: 'authored' | 'fallback'
}

export interface TempoTargetSummary {
  readonly source: 'authored' | 'fallback' | 'mixed'
  readonly practiceSpeedMultiplier: number
  readonly variableNumericTempo: boolean
  readonly constantEffectiveQuarterBpm: number | null
  readonly minimumEffectiveQuarterBpm: number
  readonly maximumEffectiveQuarterBpm: number
  readonly averageEffectiveQuarterBpm: number | null
  readonly numericRegions: readonly NumericTempoRegion[]
}

export interface LocalTempoSample {
  readonly id: string
  readonly startExpectedGroupId: string
  readonly endExpectedGroupId: string
  readonly position: MusicalTime
  readonly measureNumbers: readonly string[]
  readonly windowScoreDuration: MusicalTime
  readonly anchorCount: number
  readonly referenceIntervalMs: number
  readonly performedIntervalMs: number
  readonly localTimeScale: number
  readonly tempoRatio: number
  readonly targetQuarterBpm: number
  readonly performedQuarterBpm: number
  readonly targetSource: 'authored' | 'fallback'
}

export type TempoTrend = 'stable' | 'rushing' | 'dragging' | 'insufficient-data'
export type DirectionOutcome = 'followed' | 'not-followed' | 'insufficient-data'

export interface QualitativeTempoDirectionObservation {
  readonly id: string
  readonly sourceEventId: string
  readonly kind: TempoDirectionKind
  readonly text: string
  readonly position: MusicalTime
  readonly measureIndex: number
  readonly measureNumber: string
  readonly regionEnd: MusicalTime
  readonly sampleCount: number
  readonly observedTrend: TempoTrend
  readonly outcome: DirectionOutcome
  readonly effectiveBaseQuarterBpm: number
  readonly exactNumericCurveAvailable: false
}

export interface TempoAnalysis {
  readonly tempoScore: number | null
  readonly targetTempoAccuracyScore: number | null
  readonly tempoStabilityScore: number | null
  readonly globalTimeScale: number | null
  readonly globalTempoRatio: number | null
  readonly estimatedAverageQuarterBpm: number | null
  readonly target: TempoTargetSummary
  readonly localSamples: readonly LocalTempoSample[]
  readonly trend: TempoTrend
  readonly trendLogRatioChange: number | null
  readonly medianLocalTempoRatio: number | null
  readonly medianAbsoluteLocalLogDeviation: number | null
  readonly directionObservations: readonly QualitativeTempoDirectionObservation[]
}

export type TimingAnalysisWarningCode =
  | 'INPUT_ID_MISMATCH'
  | 'ALIGNMENT_UNAVAILABLE'
  | 'NOTE_GRADING_UNAVAILABLE'
  | 'INSUFFICIENT_TIMING_OBSERVATIONS'
  | 'LIMITED_TIMING_EVIDENCE'
  | 'PROVISIONAL_ALIGNMENT'
  | 'REJECTED_LOCAL_TEMPO_GEOMETRY'
  | 'WIDE_CHORD_SPREAD'
  | 'QUALITATIVE_TEMPO_ONLY'

export interface TimingAnalysisWarning {
  readonly code: TimingAnalysisWarningCode
  readonly severity: 'info' | 'warning'
  readonly message: string
  readonly groupAlignmentId?: string
  readonly sourceEventId?: string
}

export interface TimingAnalysisDiagnostics {
  readonly timingAnalysisEngineVersion: string
  readonly alignmentEngineVersion: string
  readonly correspondenceCount: number
  readonly inScopeCorrespondenceCount: number
  readonly strongAnchorCount: number
  readonly usableObservationCount: number
  readonly scoredRhythmIntervalCount: number
  readonly localTempoSampleCount: number
  /** Added by timing-analysis 1.1.0. Absent only on frozen 1.0.0 snapshots. */
  readonly rejectedLocalTempoWindowCount?: number
  readonly qualitativeDirectionCount: number
  readonly wideChordCount: number
}

export interface TimingAnalysisResult {
  readonly id: string
  readonly status: TimingAnalysisStatus
  readonly reliability: TimingAnalysisReliability
  readonly unavailableReason: string | null
  readonly expectedPlanId: string
  readonly recordingId: string
  readonly alignmentId: string
  readonly noteGradingId: string
  readonly scope: TimingAnalysisScope
  readonly rhythm: RhythmAnalysis
  readonly tempo: TempoAnalysis
  readonly warnings: readonly TimingAnalysisWarning[]
  readonly diagnostics: TimingAnalysisDiagnostics
}
