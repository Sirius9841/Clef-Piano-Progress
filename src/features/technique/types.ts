import type { AlignmentResult } from '../alignment/types'
import type { ExpectedPerformancePlan } from '../expected-performance/types'
import type { MusicalTime } from '../musicxml/musicalTime'
import type { NormalizedScore } from '../musicxml/types'
import type { NoteGradingResult } from '../note-grading/types'
import type { PerformanceRecording } from '../performance/types'
import type { TimingAnalysisResult } from '../timing-analysis/types'

export const TECHNIQUE_EXERCISE_ENGINE_VERSION_V1 = 'technique-exercise-1.0.0'
export const TECHNIQUE_ANALYSIS_ENGINE_VERSION_V1 = 'technique-analysis-1.0.0'
export const TECHNIQUE_EXERCISE_ENGINE_VERSION_V2_1_1_0 = 'technique-exercise-1.1.0'
export const TECHNIQUE_ANALYSIS_ENGINE_VERSION_V2_1_1_0 = 'technique-analysis-1.1.0'
export const TECHNIQUE_EXERCISE_ENGINE_VERSION = 'technique-exercise-1.1.1'
export const TECHNIQUE_ANALYSIS_ENGINE_VERSION_V2_1_1_1 = 'technique-analysis-1.1.1'
export const TECHNIQUE_ANALYSIS_ENGINE_VERSION = 'technique-analysis-1.1.2'
export const SUPPORTED_TECHNIQUE_ENGINE_PAIRS_V2 = [
  { exercise: TECHNIQUE_EXERCISE_ENGINE_VERSION_V2_1_1_0, analysis: TECHNIQUE_ANALYSIS_ENGINE_VERSION_V2_1_1_0 },
  { exercise: TECHNIQUE_EXERCISE_ENGINE_VERSION, analysis: TECHNIQUE_ANALYSIS_ENGINE_VERSION_V2_1_1_1 },
  { exercise: TECHNIQUE_EXERCISE_ENGINE_VERSION, analysis: TECHNIQUE_ANALYSIS_ENGINE_VERSION },
] as const
export type TechniqueExerciseEngineVersionV2 = typeof SUPPORTED_TECHNIQUE_ENGINE_PAIRS_V2[number]['exercise']
export type TechniqueAnalysisEngineVersionV2 = typeof SUPPORTED_TECHNIQUE_ENGINE_PAIRS_V2[number]['analysis']
export const SUPPORTED_TECHNIQUE_EXERCISE_ENGINE_VERSIONS_V2: readonly TechniqueExerciseEngineVersionV2[] = [...new Set(SUPPORTED_TECHNIQUE_ENGINE_PAIRS_V2.map((pair) => pair.exercise))]
export const SUPPORTED_TECHNIQUE_ANALYSIS_ENGINE_VERSIONS_V2: readonly TechniqueAnalysisEngineVersionV2[] = [...new Set(SUPPORTED_TECHNIQUE_ENGINE_PAIRS_V2.map((pair) => pair.analysis))]

export const TECHNIQUE_MODULE_IDS = ['sight-reading', 'rhythm', 'chord-fluency', 'scales', 'arpeggios', 'octaves', 'keyboard-jumps', 'tempo-control'] as const
export type TechniqueModuleId = typeof TECHNIQUE_MODULE_IDS[number]
export type TechniqueDirection = 'ascending' | 'descending' | 'both'
export type DeclaredHandContext = 'left' | 'right' | 'both'
export type TechniqueMode = 'major' | 'natural-minor'
export type TechniqueTempoShape = 'steady' | 'accelerate' | 'decelerate' | 'arch'

export interface TechniqueExerciseSpecV1 {
  readonly moduleId: TechniqueModuleId; readonly templateId: string; readonly seed: string; readonly tonic: number
  readonly mode: 'major' | 'minor'; readonly targetTempoBpm: number; readonly eventCount: number; readonly direction: TechniqueDirection
  readonly octaveSpan: 1 | 2; readonly subdivision: 1 | 2 | 4; readonly chordInversion: 0 | 1 | 2
  readonly jumpSemitones: 7 | 12 | 19 | 24; readonly tempoShape: TechniqueTempoShape
  readonly exerciseEngineVersion: typeof TECHNIQUE_EXERCISE_ENGINE_VERSION_V1
}

export interface TechniqueExerciseSpecV2 {
  readonly moduleId: TechniqueModuleId; readonly templateId: string; readonly seed: string; readonly tonic: number
  readonly mode: TechniqueMode; readonly targetTempoBpm: number; readonly eventCount: number; readonly direction: TechniqueDirection
  readonly octaveSpan: 1 | 2; readonly subdivision: 1 | 2 | 4; readonly chordInversion: 0 | 1 | 2
  readonly jumpSemitones: 7 | 12 | 19 | 24; readonly tempoShape: TechniqueTempoShape
  readonly declaredHandContext: DeclaredHandContext
  readonly exerciseEngineVersion: TechniqueExerciseEngineVersionV2
}
export type TechniqueExerciseSpec = TechniqueExerciseSpecV2

export type TechniqueEventRoleV1 = 'opening' | 'continuation' | 'turn' | 'landing' | 'closing'
export type TechniqueEventRole = TechniqueEventRoleV1 | 'recovery'
export type TechniqueTransitionKind = 'opening' | 'ordinary' | 'direction-change' | 'register-boundary' | 'jump-landing' | 'jump-recovery'

export interface TechniqueGeneratedEventV1 {
  readonly id: string; readonly position: MusicalTime; readonly duration: MusicalTime; readonly midiNotes: readonly number[]
  readonly role: TechniqueEventRoleV1; readonly targetTempoBpm: number
}
export interface TechniqueGeneratedEventV2 {
  readonly id: string; readonly position: MusicalTime; readonly duration: MusicalTime; readonly midiNotes: readonly number[]
  readonly role: TechniqueEventRole; readonly transitionKind: TechniqueTransitionKind; readonly targetTempoBpm: number
}
export type TechniqueGeneratedEvent = TechniqueGeneratedEventV2

export interface TechniqueChallengeProfileV1 {
  readonly targetTempoBpm: number; readonly eventCount: number; readonly expectedDuration: MusicalTime; readonly expectedDurationMs: number
  readonly minimumMidi: number; readonly maximumMidi: number; readonly pitchSpanSemitones: number; readonly maximumChordSize: number
  readonly maximumJumpSemitones: number; readonly rhythmicDensity: number; readonly smallestSubdivision: number
  readonly tempoChangeCount: number; readonly octaveSpan: number; readonly moduleSpecific: Readonly<Record<string, string | number | boolean>>
}
export interface TechniqueChallengeProfileV2 extends TechniqueChallengeProfileV1 {
  readonly tonic: number; readonly mode: TechniqueMode; readonly declaredHandContext: DeclaredHandContext
  readonly direction: TechniqueDirection; readonly subdivision: 1 | 2 | 4; readonly chordInversion: 0 | 1 | 2
  readonly jumpSemitones: 7 | 12 | 19 | 24; readonly tempoShape: TechniqueTempoShape
}
export type TechniqueChallengeProfile = TechniqueChallengeProfileV2

export interface TechniqueExerciseSnapshotV1 {
  readonly id: string; readonly title: string; readonly spec: TechniqueExerciseSpecV1; readonly generatedMusicXml: string
  readonly parserVersion: string; readonly events: readonly TechniqueGeneratedEventV1[]; readonly challenge: TechniqueChallengeProfileV1
}
export interface TechniqueExerciseSnapshotV2 {
  readonly id: string; readonly title: string; readonly spec: TechniqueExerciseSpecV2; readonly generatedMusicXml: string
  readonly parserVersion: string; readonly events: readonly TechniqueGeneratedEventV2[]; readonly challenge: TechniqueChallengeProfileV2
}
export type TechniqueExerciseSnapshot = TechniqueExerciseSnapshotV2

export interface CompiledTechniqueExercise {
  readonly snapshot: TechniqueExerciseSnapshotV2; readonly normalizedScore: NormalizedScore; readonly expectedPerformancePlan: ExpectedPerformancePlan
}

export const TECHNIQUE_FACET_IDS_V1 = [
  'note-accuracy', 'rhythm-precision', 'pulse-continuity', 'onset-evenness', 'chord-accuracy', 'chord-synchronization',
  'transition-consistency', 'direction-change-continuity', 'octave-integrity', 'landing-accuracy', 'jump-timing-consistency',
  'recovery-continuity', 'target-tempo-control', 'tempo-stability', 'tempo-transition-control', 'sight-reading-first-pass',
] as const
export type TechniqueFacetIdV1 = typeof TECHNIQUE_FACET_IDS_V1[number]
export const TECHNIQUE_FACET_IDS = [
  'note-accuracy', 'rhythm-precision', 'pulse-continuity', 'onset-evenness', 'chord-accuracy', 'chord-synchronization',
  'arpeggio-transition-consistency', 'direction-change-continuity', 'octave-integrity', 'landing-accuracy',
  'jump-timing-consistency', 'recovery-continuity', 'target-tempo-control', 'tempo-stability', 'tempo-transition-control',
] as const
export type TechniqueFacetId = typeof TECHNIQUE_FACET_IDS[number]
export type TechniqueFacetStatus = 'ready' | 'unavailable'
export type TechniqueReliability = 'reliable' | 'limited' | 'provisional' | 'unavailable'
export type TechniqueEvidenceFamily = 'pitch' | 'interval-precision' | 'continuity' | 'synchronization' | 'tempo'
export type TechniqueEvidenceContext = 'first-pass' | 'repeat-practice' | 'technical-drill'

export interface TechniqueFacetResultV1 {
  readonly id: TechniqueFacetIdV1; readonly label: string; readonly status: TechniqueFacetStatus; readonly score: number | null
  readonly reliability: TechniqueReliability; readonly evidenceCount: number; readonly eligibleCount: number; readonly coverage: number
  readonly summary: string; readonly challengeEvidence: TechniqueChallengeProfileV1
}
export interface TechniqueFacetResultV2 {
  readonly id: TechniqueFacetId; readonly label: string; readonly status: TechniqueFacetStatus; readonly score: number | null
  readonly reliability: TechniqueReliability; readonly evidenceCount: number; readonly eligibleCount: number; readonly coverage: number
  readonly evidenceFamily: TechniqueEvidenceFamily; readonly evidenceContext: TechniqueEvidenceContext
  readonly observationIds: readonly string[]; readonly minimumEvidence: number; readonly summary: string
  readonly challengeEvidence: TechniqueChallengeProfileV2
}
export type TechniqueFacetResult = TechniqueFacetResultV2

export type TechniqueObservationMethod = 'event-pitch' | 'rhythm-loss' | 'median-centered-interval' | 'hesitation-expansion' | 'chord-spread' | 'turn-neighborhood' | 'jump-landing-interval' | 'jump-recovery-interval' | 'target-tempo-ratio' | 'local-tempo-stability' | 'authored-tempo-trajectory'
export type TechniqueObservationUnit = 'ratio' | 'milliseconds' | 'count' | 'percent' | 'log-ratio'
export interface TechniqueObservationV1 {
  readonly id: string; readonly facetId: TechniqueFacetIdV1; readonly expectedGroupIds: readonly string[]
  readonly score: number; readonly value: number; readonly unit: 'ratio' | 'milliseconds' | 'count'; readonly summary: string
}
export interface TechniqueObservationV2 {
  readonly id: string; readonly facetId: TechniqueFacetId; readonly expectedEventIds: readonly string[]; readonly expectedGroupIds: readonly string[]
  readonly performedGroupIds: readonly string[]; readonly sourceTimingObservationIds: readonly string[]; readonly sourceNoteResultIds: readonly string[]
  readonly score: number; readonly value: number; readonly unit: TechniqueObservationUnit; readonly method: TechniqueObservationMethod; readonly summary: string
}
export type TechniqueObservation = TechniqueObservationV2

export interface TechniqueNovelty { readonly exerciseInstanceId: string; readonly priorSavedAttemptCount: number; readonly firstSavedAttempt: boolean }
export interface TechniqueCompletionV2 {
  readonly expectedEventCount: number; readonly attemptedEventCount: number; readonly completeCorrectOrIncorrectEventCount: number
  readonly reachedSpanEndIndex: number | null; readonly eventCoverageRatio: number; readonly spanReachedRatio: number; readonly completeEnoughForEvidence: boolean
}

export interface TechniqueAnalysisResultV1 {
  readonly id: string; readonly status: 'ready' | 'unavailable'; readonly moduleId: TechniqueModuleId; readonly exerciseInstanceId: string
  readonly recordingId: string; readonly alignmentId: string; readonly noteGradingId: string; readonly timingAnalysisId: string
  readonly analysisEngineVersion: typeof TECHNIQUE_ANALYSIS_ENGINE_VERSION_V1
  readonly completion: { readonly reachedEventCount: number; readonly expectedEventCount: number; readonly ratio: number }
  readonly novelty: TechniqueNovelty; readonly challenge: TechniqueChallengeProfileV1; readonly facets: readonly TechniqueFacetResultV1[]
  readonly observations: readonly TechniqueObservationV1[]; readonly exclusions: readonly string[]; readonly warnings: readonly string[]
}
export interface TechniqueAnalysisResultV2 {
  readonly id: string; readonly status: 'ready' | 'unavailable'; readonly moduleId: TechniqueModuleId; readonly exerciseInstanceId: string
  readonly recordingId: string; readonly alignmentId: string; readonly noteGradingId: string; readonly timingAnalysisId: string
  readonly analysisEngineVersion: TechniqueAnalysisEngineVersionV2
  readonly completion: TechniqueCompletionV2; readonly novelty: TechniqueNovelty; readonly challenge: TechniqueChallengeProfileV2
  readonly facets: readonly TechniqueFacetResultV2[]; readonly observations: readonly TechniqueObservationV2[]
  readonly findings: readonly string[]; readonly exclusions: readonly string[]; readonly warnings: readonly string[]
}
export type TechniqueAnalysisResult = TechniqueAnalysisResultV2

export interface TechniqueIntervalEvidence {
  readonly previousEventId: string; readonly currentEventId: string; readonly previousExpectedGroupId: string; readonly currentExpectedGroupId: string
  readonly previousPerformedGroupId: string; readonly currentPerformedGroupId: string; readonly timingObservationId: string
  readonly expectedIntervalMs: number; readonly performedIntervalMs: number; readonly ratio: number; readonly logRatio: number
  readonly signedDifferenceMs: number; readonly scorePosition: MusicalTime; readonly previousRole: TechniqueEventRole; readonly currentRole: TechniqueEventRole
  readonly transitionKind: TechniqueTransitionKind; readonly rhythmLoss: number; readonly sourceNoteResultIds: readonly string[]
}

export interface TechniqueTempoOpportunity {
  readonly id: string
  readonly startEventId: string
  readonly endEventId: string
  readonly startExpectedGroupId: string
  readonly endExpectedGroupId: string
  readonly startPosition: MusicalTime
  readonly endPosition: MusicalTime
  readonly windowScoreDuration: MusicalTime
  readonly anchorCount: number
  readonly targetQuarterBpm: number
}

export interface AnalyzeTechniqueInput {
  readonly exercise: TechniqueExerciseSnapshotV2; readonly recording: PerformanceRecording; readonly alignment: AlignmentResult
  readonly noteGrading: NoteGradingResult; readonly timingAnalysis: TimingAnalysisResult; readonly novelty: TechniqueNovelty
}
