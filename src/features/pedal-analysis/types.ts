import type { MusicalTime } from '../musicxml/musicalTime'
import type { GradingScopeType } from '../note-grading/types'

export type PedalMetricStatus = 'ready' | 'unavailable'
export type PedalReliability = 'reliable' | 'limited' | 'provisional' | 'unavailable'
export type PedalControllerEvidenceMode = 'unknown' | 'binary-like' | 'continuous-evidence'
export type PedalChannelMode = 'none' | 'single-channel' | 'multi-channel-ambiguous'
export type PedalTimingAnchorSource = 'local-performed' | 'global-score-clock'

export interface PedalScope {
  readonly type: GradingScopeType
  readonly expectedStartIndex: number | null
  readonly expectedEndIndex: number | null
  readonly expectedStartGroupId: string | null
  readonly expectedEndGroupId: string | null
}

export interface PedalRawSample {
  readonly id: string
  readonly sequence: number
  readonly relativeMs: number
  /** Added in pedal-analysis-1.1.0. Absent only on frozen 1.0.0 snapshots. */
  readonly channel?: number
  readonly value: number
  readonly down: boolean
}

export interface PedalTransition {
  readonly id: string
  readonly kind: 'down' | 'up'
  readonly relativeMs: number
  readonly sequence: number
  readonly value: number
  readonly channel: number
  readonly sourceSampleId: string
}

export interface PedalControllerEvidence {
  readonly mode: PedalControllerEvidenceMode
  readonly initialStateKnown: boolean
  readonly initialDown: boolean | null
  readonly initialValue: number | null
  readonly rawSampleCount: number
  readonly downTransitionCount: number
  readonly upTransitionCount: number
  readonly distinctValueCount: number
  readonly intermediateValueCount: number
  readonly knownStateDurationMs: number
  readonly knownStateCoverage: number | null
  readonly extraUnassignedTransitionCount: number
  /** Added in pedal-analysis-1.1.0. Absent only on frozen 1.0.0 snapshots. */
  readonly channelMode?: PedalChannelMode
  /** Added in pedal-analysis-1.1.0. Absent only on frozen 1.0.0 snapshots. */
  readonly channels?: readonly number[]
  /** Added in pedal-analysis-1.1.0. Absent only on frozen 1.0.0 snapshots. */
  readonly authoritativeChannel?: number | null
}

export interface PedalTimeline {
  readonly rawSamples: readonly PedalRawSample[]
  readonly transitions: readonly PedalTransition[]
  readonly controllerEvidence: PedalControllerEvidence
}

export interface PedalTargetEvent {
  readonly id: string
  readonly kind: 'start' | 'change' | 'stop'
  readonly sourceEventId: string
  readonly position: MusicalTime
  readonly expectedPerformedMs: number
  /** Added in pedal-analysis-1.1.0. Absent only on frozen 1.0.0 snapshots. */
  readonly timingAnchor?: PedalTimingAnchor
  readonly measureIndex: number
  readonly measureNumber: string
}

export interface PedalTimingAnchor {
  readonly source: PedalTimingAnchorSource
  readonly scorePosition: MusicalTime
  readonly globalPredictedMs: number
  readonly anchoredPerformedMs: number
  readonly anchorOffsetFromGlobalMs: number
  readonly beforeExpectedGroupId: string | null
  readonly afterExpectedGroupId: string | null
  readonly matchedPerformedGroupIds: readonly string[]
  readonly confidence: number
}

export interface PedalPhraseTarget {
  readonly id: string
  readonly sourceEventIds: readonly string[]
  readonly partId: string
  readonly staff: number | null
  readonly voice: string | null
  readonly measureIndex: number
  readonly measureNumber: string
  readonly startPosition: MusicalTime
  readonly endPosition: MusicalTime
  readonly events: readonly PedalTargetEvent[]
}

export interface PedalObservation {
  readonly id: string
  readonly phraseTargetId: string
  readonly targetEventId: string
  readonly kind: 'start' | 'change' | 'stop'
  readonly score: number
  readonly expectedPerformedMs: number
  /** Added in pedal-analysis-1.1.0. Absent only on frozen 1.0.0 snapshots. */
  readonly timingAnchorSource?: PedalTimingAnchorSource
  /** Added in pedal-analysis-1.1.0. Absent only on frozen 1.0.0 snapshots. */
  readonly globalExpectedMs?: number
  /** Added in pedal-analysis-1.1.0. Absent only on frozen 1.0.0 snapshots. */
  readonly anchoredExpectedMs?: number
  /** Added in pedal-analysis-1.1.0. Absent only on frozen 1.0.0 snapshots. */
  readonly anchorOffsetFromGlobalMs?: number
  /** Added in pedal-analysis-1.1.0. Absent only on frozen 1.0.0 snapshots. */
  readonly beforeExpectedGroupId?: string | null
  /** Added in pedal-analysis-1.1.0. Absent only on frozen 1.0.0 snapshots. */
  readonly afterExpectedGroupId?: string | null
  /** Added in pedal-analysis-1.1.0. Absent only on frozen 1.0.0 snapshots. */
  readonly anchorPerformedGroupIds?: readonly string[]
  readonly transitionIds: readonly string[]
  readonly performedMs: number | null
  readonly timingErrorMs: number | null
  readonly releaseRedownGapMs: number | null
  readonly evidence: 'transition' | 'predepressed' | 'missing'
  readonly summary: string
}

export interface PedalPhraseResult {
  readonly id: string
  readonly targetId: string
  readonly score: number | null
  readonly observationIds: readonly string[]
  /** Added in pedal-analysis-1.1.0. Absent only on frozen 1.0.0 snapshots. */
  readonly authoredEventCount?: number
  /** Added in pedal-analysis-1.1.0. Absent only on frozen 1.0.0 snapshots. */
  readonly analyzedEventCount?: number
  /** Added in pedal-analysis-1.1.0. Absent only on frozen 1.0.0 snapshots. */
  readonly truncatedEventCount?: number
  /** Added in pedal-analysis-1.1.0. Absent only on frozen 1.0.0 snapshots. */
  readonly unavailableEventCount?: number
  /** Added in pedal-analysis-1.1.0. Absent only on frozen 1.0.0 snapshots. */
  readonly coverageRatio?: number
  /** Added in pedal-analysis-1.1.0. Absent only on frozen 1.0.0 snapshots. */
  readonly completeness?: 'complete' | 'partial' | 'unanalyzed'
}

export interface PedalExclusion {
  readonly id: string
  readonly sourceEventId: string
  readonly reason: string
  readonly measureNumber: string | null
}

export interface PedalWarning {
  readonly code: string
  readonly severity: 'info' | 'warning'
  readonly message: string
  readonly sourceId?: string
}

export interface DamperHoldInterval {
  readonly id: string
  readonly matchedObservationId: string
  readonly recordedKeyPressId: string
  readonly channel: number
  readonly physicalReleaseMs: number
  readonly damperReleaseMs: number | null
  readonly pedalExtensionMs: number | null
  readonly pedalDownAtPhysicalRelease: boolean | null
  readonly openAtRecordingEnd: boolean
}

export type PedalInteractionKind = 'pedal-connects-detached-keys' | 'pedal-bridges-key-gap'
export interface PedalInteraction {
  readonly id: string
  readonly kind: PedalInteractionKind
  readonly articulationTargetId: string
  readonly articulationObservationId: string
  readonly matchedObservationIds: readonly string[]
  readonly summary: string
}

export interface PedalAnalysisResult {
  readonly id: string
  readonly status: PedalMetricStatus
  readonly reliability: PedalReliability
  readonly unavailableReason: string | null
  readonly score: number | null
  readonly scoreId: string
  readonly expectedPlanId: string
  readonly recordingId: string
  readonly alignmentId: string
  readonly noteGradingId: string
  readonly expressionAnalysisId: string
  readonly scope: PedalScope
  readonly coverage: {
    readonly authoredPhraseCount: number
    readonly analyzedPhraseCount: number
    readonly ratio: number | null
    /** Added in pedal-analysis-1.1.0. Absent only on frozen 1.0.0 snapshots. */
    readonly fullyAnalyzedPhraseCount?: number
    /** Added in pedal-analysis-1.1.0. Absent only on frozen 1.0.0 snapshots. */
    readonly partiallyAnalyzedPhraseCount?: number
    /** Added in pedal-analysis-1.1.0. Absent only on frozen 1.0.0 snapshots. */
    readonly unanalyzedPhraseCount?: number
    /** Added in pedal-analysis-1.1.0. Absent only on frozen 1.0.0 snapshots. */
    readonly authoredEventCount?: number
    /** Added in pedal-analysis-1.1.0. Absent only on frozen 1.0.0 snapshots. */
    readonly analyzedEventCount?: number
    /** Added in pedal-analysis-1.1.0. Absent only on frozen 1.0.0 snapshots. */
    readonly truncatedEventCount?: number
    /** Added in pedal-analysis-1.1.0. Absent only on frozen 1.0.0 snapshots. */
    readonly unavailableEventCount?: number
    /** Added in pedal-analysis-1.1.0. Absent only on frozen 1.0.0 snapshots. */
    readonly eventCoverageRatio?: number | null
  }
  readonly controllerEvidence: PedalControllerEvidence
  readonly targets: readonly PedalPhraseTarget[]
  readonly observations: readonly PedalObservation[]
  readonly phraseResults: readonly PedalPhraseResult[]
  readonly timeline: PedalTimeline
  readonly damperHolds: readonly DamperHoldInterval[]
  readonly interactions: readonly PedalInteraction[]
  readonly exclusions: readonly PedalExclusion[]
  readonly warnings: readonly PedalWarning[]
  readonly diagnostics: {
    readonly pedalAnalysisEngineVersion: string
    readonly musicXmlParserVersion: string
    readonly expressionAnalysisEngineVersion: string
    readonly alignmentEngineVersion: string
    readonly noteGradingEngineVersion: string
    readonly authoredPedalEventCount: number
    readonly truncatedTargetCount: number
    readonly predepressedObservationCount: number
    /** Added in pedal-analysis-1.1.0. Absent only on frozen 1.0.0 snapshots. */
    readonly localTimingAnchorCount?: number
    /** Added in pedal-analysis-1.1.0. Absent only on frozen 1.0.0 snapshots. */
    readonly globalTimingFallbackCount?: number
    /** Added in pedal-analysis-1.1.0. Absent only on frozen 1.0.0 snapshots. */
    readonly meanTimingAnchorConfidence?: number | null
  }
}
