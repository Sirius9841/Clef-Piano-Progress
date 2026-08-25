import type { MusicalTime } from '../musicxml/musicalTime'
import type { ExpressionReliability } from '../expression-analysis/types'
import type { PedalReliability } from '../pedal-analysis/types'
import type { TimingAnalysisReliability } from '../timing-analysis/types'
import type { VoicingAnalysisResult, VoicingReliability } from '../voicing-analysis/types'

export type ReferenceComparisonReliability = 'reliable' | 'limited' | 'provisional' | 'unavailable'
export type SimilarityDescriptor = 'very-similar' | 'similar' | 'noticeably-different' | 'strongly-different'

export interface InterpretationScope {
  readonly type: 'full-plan' | 'aligned-span'
  readonly start: MusicalTime | null
  readonly end: MusicalTime | null
  readonly expectedStartGroupId: string | null
  readonly expectedEndGroupId: string | null
}

export interface TempoInterpretationGesture { readonly key: string; readonly position: MusicalTime; readonly measureNumbers: readonly string[]; readonly logTempoRatio: number; readonly performedQuarterBpm: number }
export interface DynamicsInterpretationGesture { readonly key: string; readonly position: MusicalTime; readonly measureNumber: string; readonly kind: string; readonly value: number }
export interface ArticulationInterpretationGesture { readonly key: string; readonly position: MusicalTime; readonly measureNumber: string; readonly kind: string; readonly value: number }
export interface PedalInterpretationGesture { readonly key: string; readonly position: MusicalTime; readonly measureNumber: string; readonly kind: string; readonly relativeTimingMs: number; readonly engineVersion: string }
export interface VoicingInterpretationGesture { readonly key: string; readonly position: MusicalTime; readonly measureNumber: string; readonly focusAdvantage: number }

export interface InterpretationProfile {
  readonly attemptId: string
  readonly arrangementId: string
  readonly scoreVersionId: string
  readonly includedPartIds: readonly string[]
  readonly performedAt: string
  readonly practiceSpeed: number
  readonly schemaVersion: 1 | 2 | 3 | 4
  readonly recordingId: string
  readonly scope: InterpretationScope
  readonly tempoShape: readonly TempoInterpretationGesture[]
  readonly dynamicsGestures: readonly DynamicsInterpretationGesture[] | null
  readonly articulationGestures: readonly ArticulationInterpretationGesture[] | null
  readonly pedalGestures: readonly PedalInterpretationGesture[] | null
  readonly voicingGestures: readonly VoicingInterpretationGesture[] | null
  readonly reliability: {
    readonly tempo: TimingAnalysisReliability
    readonly dynamics: ExpressionReliability | null
    readonly articulation: ExpressionReliability | null
    readonly pedal: PedalReliability | null
    readonly voicing: VoicingReliability | null
  }
  readonly evidenceVersions: Readonly<Record<string, string>>
}

export interface ReferenceDifferenceObservation {
  readonly id: string
  readonly key: string
  readonly position: MusicalTime
  readonly measureNumbers: readonly string[]
  readonly currentValue: number
  readonly referenceValue: number
  readonly signedDifference: number
  readonly magnitude: number
  readonly similarity: SimilarityDescriptor
  readonly description: string
}

export interface ReferenceDimensionComparison {
  readonly status: 'ready' | 'unavailable'
  readonly reliability: ReferenceComparisonReliability
  readonly unavailableReason: string | null
  readonly coverage: { readonly currentCount: number; readonly referenceCount: number; readonly sharedCount: number; readonly ratio: number | null }
  readonly observations: readonly ReferenceDifferenceObservation[]
  readonly summary: string
}

export interface ReferenceComparisonResult {
  readonly id: string
  readonly status: 'ready' | 'unavailable'
  readonly reliability: ReferenceComparisonReliability
  readonly unavailableReason: string | null
  readonly scoreVersionId: string
  readonly currentAttemptOrRecordingId: string
  readonly currentVoicingAnalysisId: string
  readonly referenceAttemptId: string | null
  readonly referencePerformedAt: string | null
  readonly referencePracticeSpeed: number | null
  readonly referenceSchemaVersion: 1 | 2 | 3 | 4 | null
  readonly referenceEngineVersions: Readonly<Record<string, string>>
  readonly overlapScope: { readonly start: MusicalTime | null; readonly end: MusicalTime | null }
  readonly tempo: ReferenceDimensionComparison
  readonly dynamics: ReferenceDimensionComparison
  readonly articulation: ReferenceDimensionComparison
  readonly pedal: ReferenceDimensionComparison
  readonly voicing: ReferenceDimensionComparison
  readonly warnings: readonly { readonly code: string; readonly message: string }[]
  readonly diagnostics: {
    readonly referenceComparisonEngineVersion: string
    readonly currentEngineVersions: Readonly<Record<string, string>>
    readonly referenceEngineVersions: Readonly<Record<string, string>>
  }
}

export interface InterpretationProfileInput {
  readonly attemptId: string
  readonly arrangementId: string
  readonly scoreVersionId: string
  readonly includedPartIds: readonly string[]
  readonly performedAt: string
  readonly practiceSpeed: number
  readonly schemaVersion: 1 | 2 | 3 | 4
  readonly recordingId: string
  readonly fullPlanStart: MusicalTime
  readonly fullPlanEnd: MusicalTime
  readonly expectedGroupPositions: readonly { readonly id: string; readonly position: MusicalTime }[]
  readonly timingAnalysis: import('../timing-analysis/types').TimingAnalysisResult
  readonly expressionAnalysis?: import('../expression-analysis/types').ExpressionAnalysisResult
  readonly pedalAnalysis?: import('../pedal-analysis/types').PedalAnalysisResult
  readonly voicingAnalysis?: VoicingAnalysisResult
  readonly engineVersions: Readonly<Record<string, string>>
}
