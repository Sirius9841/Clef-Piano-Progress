import type { MusicalTime } from '../musicxml/musicalTime'
import type { GradingScopeType, NoteGradingMetrics } from '../note-grading/types'
import type { TempoTrend } from '../timing-analysis/types'

export type PerformanceResultsStatus = 'ready' | 'unavailable'
export type PerformanceResultsReliability = 'reliable' | 'limited' | 'provisional' | 'unavailable'
export type ResultConfidenceCategory = 'high' | 'medium' | 'low' | 'insufficient'
export type MeasureAnalysisState = 'analyzed' | 'insufficient-evidence' | 'outside-scope'
export type ResultDimension = 'notes' | 'rhythm' | 'tempo'
export type HeatmapMode = 'practice-priority' | ResultDimension

export interface ResultConfidence {
  readonly category: ResultConfidenceCategory
  readonly weight: number
  readonly provisional: boolean
  readonly reasons: readonly string[]
}

export interface MeasureEvidence {
  readonly expectedNoteTargets: number
  readonly gradedNoteTargets: number
  readonly attributedAdditionalAttacks: number
  readonly rhythmObservationCount: number
  readonly scoredRhythmIntervalCount: number
  readonly tempoSampleCount: number
  readonly alignmentCorrespondenceCount: number
}

export interface MeasureNoteMetrics extends NoteGradingMetrics {
  readonly correct: number
  readonly wrongPitch: number
  readonly missed: number
  readonly additional: number
  readonly gradeableExpectedTargets: number
  readonly expectedResultIds: readonly string[]
  readonly attributedAdditionalResultIds: readonly string[]
}

export interface MeasureRhythmMetrics {
  readonly rhythmScore: number | null
  readonly observationCount: number
  readonly scoredIntervalCount: number
  readonly medianAbsoluteResidualMs: number | null
  readonly medianAbsoluteNormalizedError: number | null
  readonly proportionInsideTolerance: number | null
  readonly earlyCount: number
  readonly lateCount: number
  readonly observationIds: readonly string[]
  readonly boundaryAttributionPolicy: 'destination-onset-measure'
}

export interface MeasureTempoMetrics {
  readonly tempoScore: number | null
  readonly targetTempoAccuracyScore: number | null
  readonly tempoStabilityScore: number | null
  readonly sampleCount: number
  readonly medianTempoRatio: number | null
  readonly estimatedPerformedQuarterBpm: number | null
  readonly effectiveTargetQuarterBpm: number | null
  readonly minimumEffectiveTargetQuarterBpm: number | null
  readonly maximumEffectiveTargetQuarterBpm: number | null
  readonly targetVaries: boolean
  readonly targetSource: 'authored' | 'fallback' | 'mixed' | null
  readonly trend: TempoTrend
  readonly sampleIds: readonly string[]
  readonly qualitativeDirectionObservationIds: readonly string[]
}

export interface PracticePriorityComponent {
  readonly dimension: ResultDimension
  readonly score: number
  readonly deficit: number
  readonly configuredWeight: number
  readonly evidenceWeight: number
}

export type PracticePriorityLabel = 'high' | 'medium' | 'low' | 'unavailable'

export interface PracticePriority {
  readonly rawWeakness: number | null
  readonly confidenceAdjustedPriority: number | null
  readonly label: PracticePriorityLabel
  readonly components: readonly PracticePriorityComponent[]
}

export interface MeasureResult {
  readonly id: string
  readonly sourceMeasureIds: readonly string[]
  readonly partIds: readonly string[]
  readonly measureIndex: number
  readonly displayMeasureNumber: string
  readonly scorePositionStart: MusicalTime
  readonly scorePositionEnd: MusicalTime
  readonly analysisState: MeasureAnalysisState
  readonly note: MeasureNoteMetrics
  readonly rhythm: MeasureRhythmMetrics
  readonly tempo: MeasureTempoMetrics
  readonly evidence: MeasureEvidence
  readonly confidence: ResultConfidence
  readonly practicePriority: PracticePriority
  readonly mistakeIds: readonly string[]
  readonly mainIssues: readonly ResultIssueCategory[]
  readonly sourceExpectedAttackIds: readonly string[]
  readonly sourceNoteIds: readonly string[]
  readonly sourceEventIds: readonly string[]
  readonly staffs: readonly number[]
}

export interface SectionResult {
  readonly id: string
  readonly measureResultIds: readonly string[]
  readonly sourceMeasureIds: readonly string[]
  readonly startMeasureIndex: number
  readonly endMeasureIndex: number
  readonly displayRange: string
  readonly scorePositionStart: MusicalTime
  readonly scorePositionEnd: MusicalTime
  readonly note: MeasureNoteMetrics
  readonly rhythm: MeasureRhythmMetrics
  readonly tempo: MeasureTempoMetrics
  readonly evidence: MeasureEvidence
  readonly confidence: ResultConfidence
  readonly practicePriority: PracticePriority
  readonly strengthIndex: number | null
  readonly mistakeIds: readonly string[]
  readonly mainIssues: readonly ResultIssueCategory[]
}

export type MistakeType = 'wrong-pitch' | 'missed' | 'additional' | 'timing-early' | 'timing-late' | 'tempo-region' | 'tempo-direction'
export type MistakeSeverityLabel = 'high' | 'medium' | 'low'

export interface MistakeResult {
  readonly id: string
  readonly type: MistakeType
  readonly dimension: ResultDimension
  readonly measureResultId: string | null
  readonly measureIndex: number | null
  readonly displayMeasureNumber: string | null
  readonly scorePosition: MusicalTime | null
  readonly expectedResultIds: readonly string[]
  readonly sourceExpectedAttackIds: readonly string[]
  readonly sourceNoteIds: readonly string[]
  readonly performedAttackIds: readonly string[]
  readonly timingObservationIds: readonly string[]
  readonly tempoSampleIds: readonly string[]
  readonly severity: number
  readonly severityLabel: MistakeSeverityLabel
  readonly title: string
  readonly detail: string
  readonly attribution: 'expected-target' | 'aligned-group' | 'bracketed-region' | 'destination-onset-measure' | 'measure-tempo' | 'unattributed'
}

export type ResultIssueCategory = 'pitch-accuracy' | 'missed-notes' | 'additional-notes' | 'rhythm-consistency' | 'tempo-control' | 'tempo-direction'

export interface HeatmapCell {
  readonly id: string
  readonly measureResultId: string
  readonly displayMeasureNumber: string
  readonly analysisState: MeasureAnalysisState
  readonly confidence: ResultConfidenceCategory
  readonly practicePriority: number | null
  readonly noteScore: number | null
  readonly rhythmScore: number | null
  readonly tempoScore: number | null
  readonly semanticLevel: 'focus' | 'review' | 'steady' | 'strong' | 'unavailable' | 'outside-scope'
  readonly accessibleSummary: string
}

export interface ScoreResultReference {
  readonly expectedTargetResultIds: readonly string[]
  readonly mistakeIds: readonly string[]
  readonly measureResultIds: readonly string[]
  readonly resultKinds: readonly ('correct' | 'wrong-pitch' | 'missed' | 'unattempted' | 'excluded')[]
}

export interface MeasureResultReference {
  readonly measureResultId: string
  readonly mistakeIds: readonly string[]
  readonly sourceNoteIds: readonly string[]
}

export interface ScoreResultMapping {
  readonly byExpectedAttackId: Readonly<Record<string, ScoreResultReference>>
  readonly bySourceNoteId: Readonly<Record<string, ScoreResultReference>>
  readonly bySourceMeasureId: Readonly<Record<string, MeasureResultReference>>
  readonly unattributedMistakeIds: readonly string[]
}

export interface PerformanceResultsWarning {
  readonly code: 'INPUT_ID_MISMATCH' | 'NOTE_RESULTS_UNAVAILABLE' | 'TIMING_RESULTS_UNAVAILABLE' | 'NO_INCLUDED_MEASURES' | 'PROVISIONAL_SOURCE_ANALYSIS'
  readonly severity: 'info' | 'warning'
  readonly message: string
}

export interface PerformanceResultsDiagnostics {
  readonly resultAggregationVersion: string
  readonly alignmentEngineVersion: string
  readonly noteGradingEngineVersion: string
  readonly timingAnalysisEngineVersion: string
  readonly includedMeasureCount: number
  readonly analyzedMeasureCount: number
  readonly sectionWindowCount: number
  readonly weakSectionCount: number
  readonly strongSectionCount: number
  readonly mistakeCount: number
  readonly unattributedMistakeCount: number
}

export interface PerformanceResults {
  readonly id: string
  readonly status: PerformanceResultsStatus
  readonly reliability: PerformanceResultsReliability
  readonly unavailableReason: string | null
  readonly normalizedScoreId: string
  readonly expectedPlanId: string
  readonly alignmentId: string
  readonly noteGradingId: string
  readonly timingAnalysisId: string
  readonly scope: GradingScopeType
  readonly summary: Readonly<{ notes: number | null; rhythm: number | null; tempo: number | null }>
  readonly measures: readonly MeasureResult[]
  readonly sections: readonly SectionResult[]
  readonly weakestSections: readonly SectionResult[]
  readonly strongestSections: readonly SectionResult[]
  readonly mistakes: readonly MistakeResult[]
  readonly heatmap: readonly HeatmapCell[]
  readonly mapping: ScoreResultMapping
  readonly warnings: readonly PerformanceResultsWarning[]
  readonly diagnostics: PerformanceResultsDiagnostics
}
