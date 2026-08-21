import type {
  AttemptSaveInput,
  AttemptSaveResult,
  AttemptSummary,
  CreateScoreVersionInput,
  CreateScoreVersionResult,
  ImportScoreInput,
  ImportScoreResult,
  PerformanceAttemptRecord,
  PersistedArrangement,
  PersistedScoreVersion,
  PersistedWork,
  PracticeSessionRecord,
  ProgressRange,
  ProgressSnapshot,
  RepertoireListItem,
  StorageCounts,
} from './types'

export interface PianoProgressRepository {
  initialize(): Promise<void>
  importScore(input: ImportScoreInput): Promise<ImportScoreResult>
  createScoreVersion(input: CreateScoreVersionInput): Promise<CreateScoreVersionResult>
  listWorks(): Promise<readonly PersistedWork[]>
  listRepertoire(): Promise<readonly RepertoireListItem[]>
  getArrangement(id: string): Promise<PersistedArrangement | null>
  getScoreVersion(id: string): Promise<PersistedScoreVersion | null>
  listScoreVersions(arrangementId: string): Promise<readonly PersistedScoreVersion[]>
  getAttempt(id: string): Promise<PerformanceAttemptRecord | null>
  listAttemptSummaries(arrangementId?: string): Promise<readonly AttemptSummary[]>
  listSessions(arrangementId?: string): Promise<readonly PracticeSessionRecord[]>
  saveAttempt(input: AttemptSaveInput): Promise<AttemptSaveResult>
  removeFromRepertoire(arrangementId: string): Promise<void>
  getProgress(range: ProgressRange, now?: Date, timeZone?: string): Promise<ProgressSnapshot>
  getCounts(): Promise<StorageCounts>
  clearAll(): Promise<void>
  subscribe(listener: () => void): () => void
}
