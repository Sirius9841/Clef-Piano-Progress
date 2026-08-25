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
  RepertoireEntry,
  RepertoireListItem,
  StorageCounts,
  TechniqueAttemptRecord,
  TechniqueAttemptSaveResult,
  TechniqueAttemptSummary,
} from './types'
import type { RepertoireStatus } from '../../domain/music'
import type { VoiceLane, VoicingIntentProfile } from '../voicing-analysis/types'

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
  getTechniqueAttempt(id: string): Promise<TechniqueAttemptRecord | null>
  listTechniqueAttemptSummaries(moduleId?: string): Promise<readonly TechniqueAttemptSummary[]>
  countTechniqueAttemptsForInstance(exerciseInstanceId: string): Promise<number>
  saveTechniqueAttempt(attempt: TechniqueAttemptRecord): Promise<TechniqueAttemptSaveResult>
  saveAttempt(input: AttemptSaveInput): Promise<AttemptSaveResult>
  setVoicingIntentProfile(arrangementId: string, scoreVersionId: string, profile: VoicingIntentProfile | null, lanes: readonly Pick<VoiceLane, 'id' | 'ambiguous'>[]): Promise<PersistedArrangement>
  setInterpretationReference(arrangementId: string, scoreVersionId: string, attemptId: string | null): Promise<PersistedArrangement>
  updateRepertoireStatus(arrangementId: string, status: RepertoireStatus): Promise<RepertoireEntry>
  removeFromRepertoire(arrangementId: string): Promise<void>
  getProgress(range: ProgressRange, now?: Date, timeZone?: string): Promise<ProgressSnapshot>
  getCounts(): Promise<StorageCounts>
  clearAll(): Promise<void>
  subscribe(listener: () => void): () => void
}
