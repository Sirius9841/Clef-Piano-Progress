import type { MusicalTime } from '../musicxml/musicalTime'
import type { DynamicMarking } from '../musicxml/types'
import type { GradingScopeType } from '../note-grading/types'

export type ExpressionMetricStatus = 'ready' | 'unavailable'
export type ExpressionReliability = 'reliable' | 'limited' | 'provisional' | 'unavailable'

export interface ExpressionScope {
  readonly type: GradingScopeType
  readonly expectedStartIndex: number | null
  readonly expectedEndIndex: number | null
  readonly expectedStartGroupId: string | null
  readonly expectedEndGroupId: string | null
}

export interface ExpressionCoverage {
  readonly authoredTargetCount: number
  readonly analyzedTargetCount: number
  readonly ratio: number | null
}

export interface MatchedPerformanceObservation {
  readonly id: string
  readonly expectedTargetId: string
  readonly expectedAttackIds: readonly string[]
  readonly sourceNoteIds: readonly string[]
  readonly performedAttackId: string
  readonly recordedKeyPressId: string
  readonly alignmentGroupId: string | null
  readonly partIds: readonly string[]
  readonly staffs: readonly number[]
  readonly voices: readonly string[]
  readonly measureIndices: readonly number[]
  readonly measureNumbers: readonly string[]
  readonly scorePosition: MusicalTime
  readonly midi: number
  readonly rawVelocity: number
  readonly normalizedIntensity: number | null
  readonly attackMs: number
  readonly releaseMs: number | null
  readonly expectedDuration: MusicalTime
  readonly expectedDurations: readonly MusicalTime[]
}

export interface VelocityNormalizationDiagnostics {
  readonly method: 'attempt-scope-q10-q90'
  readonly sampleCount: number
  readonly uniqueVelocityCount: number
  readonly rawMinimum: number | null
  readonly rawMaximum: number | null
  readonly median: number | null
  readonly q10: number | null
  readonly q90: number | null
  readonly robustRange: number | null
  readonly evidenceSufficient: boolean
}

export type DynamicsTargetKind = 'dynamic-change' | 'wedge' | 'accent'
export type DynamicsDirection = 'increase' | 'decrease'

export interface DynamicsTarget {
  readonly id: string
  readonly kind: DynamicsTargetKind
  readonly sourceEventIds: readonly string[]
  readonly expectedTargetIds: readonly string[]
  readonly partId: string
  readonly staff: number | null
  readonly voice: string | null
  readonly measureIndex: number
  readonly measureNumber: string
  readonly position: MusicalTime
  readonly endPosition: MusicalTime | null
  readonly expectedDirection: DynamicsDirection
  readonly fromMarking: DynamicMarking | null
  readonly toMarking: DynamicMarking | null
  readonly emphasis: 'accent' | 'strong-accent' | null
}

export interface DynamicsObservation {
  readonly id: string
  readonly targetId: string
  readonly score: number
  readonly matchedObservationIds: readonly string[]
  readonly beforeMedian: number | null
  readonly afterMedian: number | null
  readonly normalizedChange: number | null
  readonly trend: number | null
  readonly summary: string
}

export interface ExpressionExclusion {
  readonly id: string
  readonly sourceId: string
  readonly reason: string
  readonly measureNumber: string | null
}

export interface ExpressionWarning {
  readonly code: string
  readonly severity: 'info' | 'warning'
  readonly message: string
  readonly sourceId?: string
}

export interface DynamicsAnalysis {
  readonly status: ExpressionMetricStatus
  readonly reliability: ExpressionReliability
  readonly unavailableReason: string | null
  readonly score: number | null
  readonly coverage: ExpressionCoverage
  readonly targets: readonly DynamicsTarget[]
  readonly observations: readonly DynamicsObservation[]
  readonly exclusions: readonly ExpressionExclusion[]
  readonly warnings: readonly ExpressionWarning[]
  readonly diagnostics: {
    readonly normalization: VelocityNormalizationDiagnostics
    readonly explicitChangeCount: number
    readonly wedgeCount: number
    readonly accentCount: number
  }
}

export type ArticulationTargetKind = 'staccato' | 'staccatissimo' | 'tenuto' | 'legato-transition'

export interface ArticulationTarget {
  readonly id: string
  readonly kind: ArticulationTargetKind
  readonly sourceNoteIds: readonly string[]
  readonly expectedTargetIds: readonly string[]
  readonly partId: string
  readonly staff: number | null
  readonly voice: string | null
  readonly measureIndex: number
  readonly measureNumber: string
  readonly position: MusicalTime
  readonly nextPosition: MusicalTime | null
  readonly repeatedPitch: boolean
}

export interface ArticulationObservation {
  readonly id: string
  readonly targetId: string
  readonly score: number
  readonly matchedObservationIds: readonly string[]
  readonly keyDownDurationMs: number | null
  readonly predictedNominalDurationMs: number | null
  readonly gateRatio: number | null
  readonly transitionGapMs: number | null
  readonly transitionToleranceMs: number | null
  readonly pedalAffected: boolean
  readonly summary: string
}

export interface ArticulationAnalysis {
  readonly status: ExpressionMetricStatus
  readonly reliability: ExpressionReliability
  readonly unavailableReason: string | null
  readonly score: number | null
  readonly coverage: ExpressionCoverage
  readonly targets: readonly ArticulationTarget[]
  readonly observations: readonly ArticulationObservation[]
  readonly exclusions: readonly ExpressionExclusion[]
  readonly warnings: readonly ExpressionWarning[]
  readonly diagnostics: {
    readonly gateTargetCount: number
    readonly legatoTargetCount: number
    readonly missingReleaseCount: number
    readonly pedalAffectedCount: number
  }
}

export interface ExpressionAnalysisResult {
  readonly id: string
  readonly status: 'ready' | 'unavailable'
  readonly unavailableReason: string | null
  readonly scoreId: string
  readonly expectedPlanId: string
  readonly recordingId: string
  readonly alignmentId: string
  readonly noteGradingId: string
  readonly scope: ExpressionScope
  readonly matchedObservations: readonly MatchedPerformanceObservation[]
  readonly dynamics: DynamicsAnalysis
  readonly articulation: ArticulationAnalysis
  readonly warnings: readonly ExpressionWarning[]
  readonly diagnostics: {
    readonly expressionAnalysisEngineVersion: string
    readonly musicXmlParserVersion: string
    readonly alignmentEngineVersion: string
    readonly noteGradingEngineVersion: string
    readonly correctlyMatchedObservationCount: number
  }
}
