import type { GradingScopeType } from './types'

export const NOTE_GRADING_ENGINE_VERSION = '1.0.0'

export interface NoteGradingOptions {
  readonly gradingScope: GradingScopeType
  readonly wrongPitchMaxSemitones: number
  readonly allowWrongOctave: boolean
  readonly wrongOctaveSemitones: number
  readonly excludeOutsideStandardPianoRange: boolean
  readonly maxWrongPitchAssignmentSize: number
}

export const DEFAULT_NOTE_GRADING_OPTIONS: NoteGradingOptions = Object.freeze({
  gradingScope: 'aligned-span',
  wrongPitchMaxSemitones: 3,
  allowWrongOctave: true,
  wrongOctaveSemitones: 12,
  excludeOutsideStandardPianoRange: true,
  maxWrongPitchAssignmentSize: 10,
})

export function resolveNoteGradingOptions(options: Partial<NoteGradingOptions> = {}): NoteGradingOptions {
  const resolved = { ...DEFAULT_NOTE_GRADING_OPTIONS, ...options }
  if (resolved.gradingScope !== 'aligned-span' && resolved.gradingScope !== 'full-plan') throw new RangeError('gradingScope must be aligned-span or full-plan.')
  if (!Number.isInteger(resolved.wrongPitchMaxSemitones) || resolved.wrongPitchMaxSemitones < 0) throw new RangeError('wrongPitchMaxSemitones must be a non-negative integer.')
  if (!Number.isInteger(resolved.wrongOctaveSemitones) || resolved.wrongOctaveSemitones <= 0) throw new RangeError('wrongOctaveSemitones must be a positive integer.')
  if (!Number.isInteger(resolved.maxWrongPitchAssignmentSize) || resolved.maxWrongPitchAssignmentSize <= 0 || resolved.maxWrongPitchAssignmentSize > 20) throw new RangeError('maxWrongPitchAssignmentSize must be an integer from 1 to 20.')
  return Object.freeze(resolved)
}
