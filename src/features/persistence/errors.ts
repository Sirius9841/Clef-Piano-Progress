export type StorageErrorCode =
  | 'DATABASE_UNAVAILABLE'
  | 'DATABASE_OPEN_FAILED'
  | 'TRANSACTION_FAILED'
  | 'NOT_FOUND'
  | 'REFERENTIAL_INTEGRITY'
  | 'IMMUTABLE_RECORD'
  | 'CORRUPT_RECORD'
  | 'DUPLICATE_RECORD'

export class PianoStorageError extends Error {
  constructor(
    readonly code: StorageErrorCode,
    message: string,
    readonly causeValue?: unknown,
  ) {
    super(message)
    this.name = 'PianoStorageError'
  }
}

export function asPianoStorageError(cause: unknown, fallback = 'Local data could not be accessed.'): PianoStorageError {
  if (cause instanceof PianoStorageError) return cause
  return new PianoStorageError('TRANSACTION_FAILED', cause instanceof Error ? cause.message : fallback, cause)
}
