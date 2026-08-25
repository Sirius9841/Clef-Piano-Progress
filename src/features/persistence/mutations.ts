import type { RepertoireStatus } from '../../domain/music'
import { asPianoStorageError, type PianoStorageError } from './errors'
import type { PianoProgressRepository } from './repository'
import type { RepertoireEntry } from './types'
import type { VoiceLane, VoicingIntentProfile } from '../voicing-analysis/types'
import type { PersistedArrangement } from './types'

export type PersistenceMutationResult<T> =
  | { readonly ok: true; readonly value: T; readonly error: null }
  | { readonly ok: false; readonly value: null; readonly error: PianoStorageError }

async function safely<T>(mutation: () => Promise<T>): Promise<PersistenceMutationResult<T>> {
  try {
    return { ok: true, value: await mutation(), error: null }
  } catch (cause) {
    return { ok: false, value: null, error: asPianoStorageError(cause, 'The local change could not be saved.') }
  }
}

export function removeRepertoireSafely(repository: Pick<PianoProgressRepository, 'removeFromRepertoire'>, arrangementId: string): Promise<PersistenceMutationResult<void>> {
  return safely(() => repository.removeFromRepertoire(arrangementId))
}

export function clearLocalDataSafely(repository: Pick<PianoProgressRepository, 'clearAll'>): Promise<PersistenceMutationResult<void>> {
  return safely(() => repository.clearAll())
}

export async function clearLocalDataAndPracticeSafely(
  repository: Pick<PianoProgressRepository, 'clearAll'>,
  clearPracticeSession: () => void,
): Promise<PersistenceMutationResult<void>> {
  const result = await clearLocalDataSafely(repository)
  if (result.ok) clearPracticeSession()
  return result
}

export function updateRepertoireStatusSafely(repository: Pick<PianoProgressRepository, 'updateRepertoireStatus'>, arrangementId: string, status: RepertoireStatus): Promise<PersistenceMutationResult<RepertoireEntry>> {
  return safely(() => repository.updateRepertoireStatus(arrangementId, status))
}

export function setVoicingIntentSafely(repository: Pick<PianoProgressRepository, 'setVoicingIntentProfile'>, arrangementId: string, scoreVersionId: string, profile: VoicingIntentProfile | null, lanes: readonly Pick<VoiceLane, 'id' | 'ambiguous'>[]): Promise<PersistenceMutationResult<PersistedArrangement>> {
  return safely(() => repository.setVoicingIntentProfile(arrangementId, scoreVersionId, profile, lanes))
}

export function setInterpretationReferenceSafely(repository: Pick<PianoProgressRepository, 'setInterpretationReference'>, arrangementId: string, scoreVersionId: string, attemptId: string | null): Promise<PersistenceMutationResult<PersistedArrangement>> {
  return safely(() => repository.setInterpretationReference(arrangementId, scoreVersionId, attemptId))
}
