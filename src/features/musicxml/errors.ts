export type ScoreImportErrorCode =
  | 'UNSUPPORTED_EXTENSION'
  | 'FILE_TOO_LARGE'
  | 'UNCOMPRESSED_FILE_TOO_LARGE'
  | 'EMPTY_FILE'
  | 'INVALID_MXL'
  | 'MISSING_MXL_ROOT'
  | 'AMBIGUOUS_MXL_ROOT'
  | 'INVALID_XML'
  | 'DOCTYPE_NOT_ALLOWED'
  | 'EXTERNAL_RESOURCE_NOT_ALLOWED'
  | 'NOT_MUSICXML'
  | 'UNSUPPORTED_SCORE_TIMEWISE'
  | 'MISSING_DIVISIONS'
  | 'INVALID_DURATION'
  | 'INVALID_CURSOR'
  | 'INVALID_PITCH'

export interface ScoreImportErrorContext {
  fileName?: string
  partId?: string
  measureIndex?: number
  measureNumber?: string
  detail?: string
}

export class ScoreImportError extends Error {
  readonly code: ScoreImportErrorCode
  readonly context: ScoreImportErrorContext

  constructor(code: ScoreImportErrorCode, message: string, context: ScoreImportErrorContext = {}, options?: ErrorOptions) {
    super(message, options)
    this.name = 'ScoreImportError'
    this.code = code
    this.context = context
  }
}

export function asScoreImportError(cause: unknown): ScoreImportError {
  if (cause instanceof ScoreImportError) return cause
  return new ScoreImportError('INVALID_XML', cause instanceof Error ? cause.message : 'The score could not be processed.', {}, { cause })
}
