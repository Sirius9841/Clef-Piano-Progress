import type { Arrangement, Difficulty, RepertoireStatus, Work, WorkMetadata } from '../../domain/music'
import type { AlignmentResult } from '../alignment/types'
import type { ExpectedPerformancePlan } from '../expected-performance/types'
import type { LoadedMusicXml } from '../musicxml/types'
import type { GradingScopeType, NoteGradingResult } from '../note-grading/types'
import type { PerformanceRecording } from '../performance/types'
import type { PerformanceResults } from '../performance-results/types'
import type { TimingAnalysisResult } from '../timing-analysis/types'

export const PERSISTENCE_SCHEMA_VERSION = 3
export const PIANO_PROGRESS_DB_NAME = 'clef-piano-progress'

export interface PersistedWork extends Work {
  readonly createdAt: string
  readonly updatedAt: string
}

export interface PersistedArrangement extends Arrangement {
  readonly includedPartIds: readonly string[]
  readonly createdAt: string
  readonly updatedAt: string
}

export interface PersistedScoreVersion {
  readonly id: string
  readonly arrangementId: string
  readonly version: number
  readonly format: LoadedMusicXml['sourceFormat']
  readonly createdAt: string
  readonly sourceFileName: string
  readonly sourceBytes: number
  readonly uncompressedBytes: number
  readonly contentHash: string
  readonly canonicalMusicXml: string
  readonly normalizedScoreId: string
  readonly parserVersion: string
  readonly includedPartIds: readonly string[]
}

export interface RepertoireEntry {
  readonly id: string
  readonly arrangementId: string
  readonly status: RepertoireStatus
  readonly addedAt: string
  readonly updatedAt: string
}

export interface PracticeSessionRecord {
  readonly id: string
  readonly arrangementId: string
  readonly scoreVersionId: string
  readonly startedAt: string
  readonly endedAt: string
  readonly durationMs: number
  readonly attemptIds: readonly string[]
}

export interface AnalysisEngineVersions {
  readonly alignment: string
  readonly noteGrading: string
  readonly timingAnalysis: string
  readonly resultAggregation: string
}

export interface PerformanceAttemptRecord {
  readonly id: string
  readonly schemaVersion: 1
  readonly arrangementId: string
  readonly scoreVersionId: string
  readonly practiceSessionId: string
  readonly performedAt: string
  readonly practiceSpeedMultiplier: number
  readonly gradingScope: GradingScopeType
  readonly includedPartIds: readonly string[]
  readonly engineVersions: AnalysisEngineVersions
  readonly expectedPerformancePlan: ExpectedPerformancePlan
  readonly recording: PerformanceRecording
  readonly alignment: AlignmentResult
  readonly noteGrading: NoteGradingResult
  readonly timingAnalysis: TimingAnalysisResult
  readonly performanceResults: PerformanceResults
}

export interface AttemptSummary {
  readonly id: string
  readonly arrangementId: string
  readonly scoreVersionId: string
  readonly practiceSessionId: string
  readonly performedAt: string
  readonly durationMs: number
  readonly practiceSpeedMultiplier: number
  readonly gradingScope: GradingScopeType
  readonly reliability: PerformanceResults['reliability']
  readonly notes: number | null
  readonly rhythm: number | null
  readonly tempo: number | null
}

export interface RepertoireListItem {
  readonly work: PersistedWork
  readonly arrangement: PersistedArrangement
  readonly scoreVersion: PersistedScoreVersion
  readonly repertoire: RepertoireEntry
  readonly latestAttempt: AttemptSummary | null
  readonly sessionCount: number
  readonly totalPracticeMs: number
  readonly lastPracticedAt: string | null
}

export type ImportRelationship = 'new-work' | 'existing-work-arrangement' | 'derived-work'

export interface ImportScoreInput {
  readonly relationship: ImportRelationship
  readonly existingWorkId?: string
  readonly sourceWorkId?: string
  readonly work: {
    readonly title: string
    readonly composer: string
    readonly metadata?: WorkMetadata
  }
  readonly arrangement: {
    readonly name: string
    readonly difficulty: Difficulty
    readonly targetTempoBpm?: number
    readonly includedPartIds: readonly string[]
  }
  readonly loaded: LoadedMusicXml
  readonly normalizedScoreId: string
  readonly parserVersion: string
  readonly status: RepertoireStatus
}

export interface ImportScoreResult {
  readonly work: PersistedWork
  readonly arrangement: PersistedArrangement
  readonly scoreVersion: PersistedScoreVersion
  readonly repertoire: RepertoireEntry
  readonly duplicate: boolean
}

export interface CreateScoreVersionInput {
  readonly arrangementId: string
  readonly loaded: LoadedMusicXml
  readonly normalizedScoreId: string
  readonly parserVersion: string
  readonly includedPartIds: readonly string[]
}

export interface CreateScoreVersionResult {
  readonly scoreVersion: PersistedScoreVersion
  readonly duplicate: boolean
}

export type ProgressRange = '7d' | '30d' | 'all'

export interface ProgressSnapshot {
  readonly range: ProgressRange
  readonly practiceTimeMs: number
  readonly sessionCount: number
  readonly attemptCount: number
  readonly activeDays: number
  readonly attempts: readonly AttemptSummary[]
  readonly sessions: readonly PracticeSessionRecord[]
}

export interface StorageCounts {
  readonly works: number
  readonly arrangements: number
  readonly scoreVersions: number
  readonly repertoireEntries: number
  readonly practiceSessions: number
  readonly performanceAttempts: number
}

export interface AttemptSaveResult {
  readonly created: boolean
  readonly summary: AttemptSummary
}

export interface AttemptSaveInput {
  readonly session: PracticeSessionRecord
  readonly attempt: PerformanceAttemptRecord
}

export function createAttemptSummary(attempt: PerformanceAttemptRecord): AttemptSummary {
  return {
    id: attempt.id,
    arrangementId: attempt.arrangementId,
    scoreVersionId: attempt.scoreVersionId,
    practiceSessionId: attempt.practiceSessionId,
    performedAt: attempt.performedAt,
    durationMs: attempt.recording.durationMs,
    practiceSpeedMultiplier: attempt.practiceSpeedMultiplier,
    gradingScope: attempt.gradingScope,
    reliability: attempt.performanceResults.reliability,
    notes: attempt.performanceResults.summary.notes,
    rhythm: attempt.performanceResults.summary.rhythm,
    tempo: attempt.performanceResults.summary.tempo,
  }
}
