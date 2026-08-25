import type { AlignmentResult } from '../alignment/types'
import type { ExpectedPerformancePlan } from '../expected-performance/types'
import type { MusicalTime } from '../musicxml/musicalTime'
import type { NormalizedScore } from '../musicxml/types'
import type { NoteGradingResult } from '../note-grading/types'
import type { PerformanceRecording } from '../performance/types'
import type { TimingAnalysisResult } from '../timing-analysis/types'

export const TECHNIQUE_EXERCISE_ENGINE_VERSION = 'technique-exercise-1.0.0'
export const TECHNIQUE_ANALYSIS_ENGINE_VERSION = 'technique-analysis-1.0.0'

export const TECHNIQUE_MODULE_IDS = ['sight-reading', 'rhythm', 'chord-fluency', 'scales', 'arpeggios', 'octaves', 'keyboard-jumps', 'tempo-control'] as const
export type TechniqueModuleId = typeof TECHNIQUE_MODULE_IDS[number]
export type TechniqueDirection = 'ascending' | 'descending' | 'both'

export interface TechniqueExerciseSpec {
  readonly moduleId: TechniqueModuleId
  readonly templateId: string
  readonly seed: string
  readonly tonic: number
  readonly mode: 'major' | 'minor'
  readonly targetTempoBpm: number
  readonly eventCount: number
  readonly direction: TechniqueDirection
  readonly octaveSpan: 1 | 2
  readonly subdivision: 1 | 2 | 4
  readonly chordInversion: 0 | 1 | 2
  readonly jumpSemitones: 7 | 12 | 19 | 24
  readonly tempoShape: 'steady' | 'accelerate' | 'decelerate' | 'arch'
  readonly exerciseEngineVersion: typeof TECHNIQUE_EXERCISE_ENGINE_VERSION
}

export interface TechniqueGeneratedEvent {
  readonly id: string
  readonly position: MusicalTime
  readonly duration: MusicalTime
  readonly midiNotes: readonly number[]
  readonly role: 'opening' | 'continuation' | 'turn' | 'landing' | 'closing'
  readonly targetTempoBpm: number
}

export interface TechniqueChallengeProfile {
  readonly targetTempoBpm: number
  readonly eventCount: number
  readonly expectedDuration: MusicalTime
  readonly expectedDurationMs: number
  readonly minimumMidi: number
  readonly maximumMidi: number
  readonly pitchSpanSemitones: number
  readonly maximumChordSize: number
  readonly maximumJumpSemitones: number
  readonly rhythmicDensity: number
  readonly smallestSubdivision: number
  readonly tempoChangeCount: number
  readonly octaveSpan: number
  readonly moduleSpecific: Readonly<Record<string, string | number | boolean>>
}

export interface TechniqueExerciseSnapshot {
  readonly id: string
  readonly title: string
  readonly spec: TechniqueExerciseSpec
  readonly generatedMusicXml: string
  readonly parserVersion: string
  readonly events: readonly TechniqueGeneratedEvent[]
  readonly challenge: TechniqueChallengeProfile
}

export interface CompiledTechniqueExercise {
  readonly snapshot: TechniqueExerciseSnapshot
  readonly normalizedScore: NormalizedScore
  readonly expectedPerformancePlan: ExpectedPerformancePlan
}

export const TECHNIQUE_FACET_IDS = [
  'note-accuracy', 'rhythm-precision', 'pulse-continuity', 'onset-evenness',
  'chord-accuracy', 'chord-synchronization', 'transition-consistency',
  'direction-change-continuity', 'octave-integrity', 'landing-accuracy',
  'jump-timing-consistency', 'recovery-continuity', 'target-tempo-control',
  'tempo-stability', 'tempo-transition-control', 'sight-reading-first-pass',
] as const
export type TechniqueFacetId = typeof TECHNIQUE_FACET_IDS[number]
export type TechniqueFacetStatus = 'ready' | 'unavailable'
export type TechniqueReliability = 'reliable' | 'limited' | 'provisional' | 'unavailable'

export interface TechniqueFacetResult {
  readonly id: TechniqueFacetId
  readonly label: string
  readonly status: TechniqueFacetStatus
  readonly score: number | null
  readonly reliability: TechniqueReliability
  readonly evidenceCount: number
  readonly eligibleCount: number
  readonly coverage: number
  readonly summary: string
  readonly challengeEvidence: TechniqueChallengeProfile
}

export interface TechniqueObservation {
  readonly id: string
  readonly facetId: TechniqueFacetId
  readonly expectedGroupIds: readonly string[]
  readonly score: number
  readonly value: number
  readonly unit: 'ratio' | 'milliseconds' | 'count'
  readonly summary: string
}

export interface TechniqueNovelty {
  readonly exerciseInstanceId: string
  readonly priorSavedAttemptCount: number
  readonly firstSavedAttempt: boolean
}

export interface TechniqueAnalysisResult {
  readonly id: string
  readonly status: 'ready' | 'unavailable'
  readonly moduleId: TechniqueModuleId
  readonly exerciseInstanceId: string
  readonly recordingId: string
  readonly alignmentId: string
  readonly noteGradingId: string
  readonly timingAnalysisId: string
  readonly analysisEngineVersion: typeof TECHNIQUE_ANALYSIS_ENGINE_VERSION
  readonly completion: { readonly reachedEventCount: number; readonly expectedEventCount: number; readonly ratio: number }
  readonly novelty: TechniqueNovelty
  readonly challenge: TechniqueChallengeProfile
  readonly facets: readonly TechniqueFacetResult[]
  readonly observations: readonly TechniqueObservation[]
  readonly exclusions: readonly string[]
  readonly warnings: readonly string[]
}

export interface AnalyzeTechniqueInput {
  readonly exercise: TechniqueExerciseSnapshot
  readonly recording: PerformanceRecording
  readonly alignment: AlignmentResult
  readonly noteGrading: NoteGradingResult
  readonly timingAnalysis: TimingAnalysisResult
  readonly novelty: TechniqueNovelty
}
