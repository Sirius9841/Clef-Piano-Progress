import type { MusicalTime } from '../musicxml/musicalTime'
import type { GradingScopeType } from '../note-grading/types'
import type { VelocityNormalizationDiagnostics } from '../expression-analysis/types'

export type VoicingReliability = 'reliable' | 'limited' | 'provisional' | 'unavailable'

export interface VoiceLane {
  readonly id: string
  readonly partId: string
  readonly partName: string | null
  readonly staff: number | null
  readonly voice: string | null
  readonly measureCoverage: readonly number[]
  readonly noteCount: number
  readonly ambiguous: boolean
  readonly label: string
}

export interface VoicingIntentRegion {
  readonly id: string
  readonly startMeasureIndex: number
  readonly endMeasureIndex: number
  readonly foregroundLaneIds: readonly string[]
  readonly supportLaneIds: readonly string[]
}

export interface VoicingIntentProfile {
  readonly id: string
  readonly scoreVersionId: string
  readonly regions: readonly VoicingIntentRegion[]
  readonly updatedAt: string
}

export interface VoicingScope {
  readonly type: GradingScopeType
  readonly expectedStartIndex: number | null
  readonly expectedEndIndex: number | null
  readonly expectedStartGroupId: string | null
  readonly expectedEndGroupId: string | null
}

export interface VoicingTarget {
  readonly id: string
  readonly regionId: string
  readonly position: MusicalTime
  readonly measureIndex: number
  readonly measureNumber: string
  readonly foregroundLaneIds: readonly string[]
  readonly supportLaneIds: readonly string[]
  readonly foregroundExpectedTargetIds: readonly string[]
  readonly supportExpectedTargetIds: readonly string[]
  readonly sourceNoteIds: readonly string[]
}

export interface VoicingObservation {
  readonly id: string
  readonly targetId: string
  readonly regionId: string
  readonly position: MusicalTime
  readonly measureIndex: number
  readonly measureNumber: string
  readonly foregroundObservationIds: readonly string[]
  readonly supportObservationIds: readonly string[]
  readonly foregroundIntensity: number
  readonly supportIntensity: number
  readonly focusAdvantage: number
  readonly score: number
  readonly summary: string
}

export interface VoicingRegionResult {
  readonly regionId: string
  readonly targetCount: number
  readonly analyzedTargetCount: number
  readonly score: number | null
}

export interface VoicingLaneStatistic {
  readonly laneId: string
  readonly sampleCount: number
  readonly medianNormalizedIntensity: number | null
}

export interface VoicingExclusion {
  readonly id: string
  readonly sourceId: string
  readonly measureNumber: string | null
  readonly reason: string
}

export interface VoicingAnalysisResult {
  readonly id: string
  readonly status: 'ready' | 'unavailable'
  readonly mode: 'descriptive' | 'configured'
  readonly score: number | null
  readonly reliability: VoicingReliability
  readonly unavailableReason: string | null
  readonly scoreId: string
  readonly scoreVersionId: string
  readonly expectedPlanId: string
  readonly recordingId: string
  readonly alignmentId: string
  readonly noteGradingId: string
  readonly expressionAnalysisId: string
  readonly scope: VoicingScope
  readonly intentProfileSnapshot: VoicingIntentProfile | null
  readonly lanes: readonly VoiceLane[]
  readonly targets: readonly VoicingTarget[]
  readonly observations: readonly VoicingObservation[]
  readonly regionResults: readonly VoicingRegionResult[]
  readonly laneStatistics: readonly VoicingLaneStatistic[]
  readonly coverage: { readonly configuredTargetCount: number; readonly analyzedTargetCount: number; readonly ratio: number | null }
  readonly exclusions: readonly VoicingExclusion[]
  readonly warnings: readonly { readonly code: string; readonly message: string }[]
  readonly diagnostics: {
    readonly voicingAnalysisEngineVersion: string
    readonly normalizationMethod: VelocityNormalizationDiagnostics['method']
    readonly configuredRegionCount: number
    readonly targetCount: number
    readonly analyzedTargetCount: number
  }
}
