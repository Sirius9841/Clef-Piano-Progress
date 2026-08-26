import type { TechniqueExerciseSpec, TechniqueMode, TechniqueModuleId } from './types'

export type TechniqueNotationStep = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B'
export interface TechniqueNotationKey {
  readonly tonicPitchClass: number
  readonly mode: TechniqueMode
  readonly tonicStep: TechniqueNotationStep
  readonly tonicAlter: -1 | 0 | 1
  readonly fifths: number
  readonly displayName: string
}
export interface TechniqueWrittenPitch { readonly step: TechniqueNotationStep; readonly alter: number; readonly octave: number }

export const CANONICAL_MAJOR_KEYS: readonly Omit<TechniqueNotationKey, 'mode' | 'tonicPitchClass'>[] = [
  { tonicStep: 'C', tonicAlter: 0, fifths: 0, displayName: 'C' }, { tonicStep: 'D', tonicAlter: -1, fifths: -5, displayName: 'Db' },
  { tonicStep: 'D', tonicAlter: 0, fifths: 2, displayName: 'D' }, { tonicStep: 'E', tonicAlter: -1, fifths: -3, displayName: 'Eb' },
  { tonicStep: 'E', tonicAlter: 0, fifths: 4, displayName: 'E' }, { tonicStep: 'F', tonicAlter: 0, fifths: -1, displayName: 'F' },
  { tonicStep: 'F', tonicAlter: 1, fifths: 6, displayName: 'F#' }, { tonicStep: 'G', tonicAlter: 0, fifths: 1, displayName: 'G' },
  { tonicStep: 'A', tonicAlter: -1, fifths: -4, displayName: 'Ab' }, { tonicStep: 'A', tonicAlter: 0, fifths: 3, displayName: 'A' },
  { tonicStep: 'B', tonicAlter: -1, fifths: -2, displayName: 'Bb' }, { tonicStep: 'B', tonicAlter: 0, fifths: 5, displayName: 'B' },
]
export const CANONICAL_NATURAL_MINOR_KEYS: readonly Omit<TechniqueNotationKey, 'mode' | 'tonicPitchClass'>[] = [
  { tonicStep: 'C', tonicAlter: 0, fifths: -3, displayName: 'C' }, { tonicStep: 'C', tonicAlter: 1, fifths: 4, displayName: 'C#' },
  { tonicStep: 'D', tonicAlter: 0, fifths: -1, displayName: 'D' }, { tonicStep: 'E', tonicAlter: -1, fifths: -6, displayName: 'Eb' },
  { tonicStep: 'E', tonicAlter: 0, fifths: 1, displayName: 'E' }, { tonicStep: 'F', tonicAlter: 0, fifths: -4, displayName: 'F' },
  { tonicStep: 'F', tonicAlter: 1, fifths: 3, displayName: 'F#' }, { tonicStep: 'G', tonicAlter: 0, fifths: -2, displayName: 'G' },
  { tonicStep: 'G', tonicAlter: 1, fifths: 5, displayName: 'G#' }, { tonicStep: 'A', tonicAlter: 0, fifths: 0, displayName: 'A' },
  { tonicStep: 'B', tonicAlter: -1, fifths: -5, displayName: 'Bb' }, { tonicStep: 'B', tonicAlter: 0, fifths: 2, displayName: 'B' },
]
const STEPS: readonly TechniqueNotationStep[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B']
const NATURAL_PITCH_CLASSES: Readonly<Record<TechniqueNotationStep, number>> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
const SHARP_ORDER: readonly TechniqueNotationStep[] = ['F', 'C', 'G', 'D', 'A', 'E', 'B']
const FLAT_ORDER: readonly TechniqueNotationStep[] = ['B', 'E', 'A', 'D', 'G', 'C', 'F']
const TONAL_MODULES: readonly TechniqueModuleId[] = ['scales', 'arpeggios', 'chord-fluency', 'sight-reading']

export function techniqueNotationKey(tonicPitchClass: number, mode: TechniqueMode): TechniqueNotationKey {
  const definition = (mode === 'major' ? CANONICAL_MAJOR_KEYS : CANONICAL_NATURAL_MINOR_KEYS)[tonicPitchClass]
  if (!definition) throw new RangeError('Technique notation tonic must be from 0 through 11.')
  return Object.freeze({ tonicPitchClass, mode, ...definition })
}

export function notationKeyForTechniqueSpec(spec: TechniqueExerciseSpec): TechniqueNotationKey {
  return TONAL_MODULES.includes(spec.moduleId) ? techniqueNotationKey(spec.tonic, spec.mode) : techniqueNotationKey(0, 'major')
}

function signatureAlter(step: TechniqueNotationStep, fifths: number): number {
  if (fifths > 0 && SHARP_ORDER.slice(0, fifths).includes(step)) return 1
  if (fifths < 0 && FLAT_ORDER.slice(0, -fifths).includes(step)) return -1
  return 0
}

export function spellMidiForTechniqueKey(midi: number, key: TechniqueNotationKey): TechniqueWrittenPitch {
  if (!Number.isInteger(midi) || midi < 0 || midi > 127) throw new RangeError('Technique notation MIDI pitch must be an integer from 0 through 127.')
  const pitchClass = midi % 12
  const candidates = STEPS.flatMap((step) => [-2, -1, 0, 1, 2].map((alter) => ({ step, alter }))).filter(({ step, alter }) => (NATURAL_PITCH_CLASSES[step] + alter + 24) % 12 === pitchClass)
  candidates.sort((left, right) => {
    const signatureDifference = Math.abs(left.alter - signatureAlter(left.step, key.fifths)) - Math.abs(right.alter - signatureAlter(right.step, key.fifths))
    if (signatureDifference !== 0) return signatureDifference
    const accidentalDifference = Math.abs(left.alter) - Math.abs(right.alter)
    if (accidentalDifference !== 0) return accidentalDifference
    const orientationDifference = key.fifths >= 0 ? right.alter - left.alter : left.alter - right.alter
    return orientationDifference !== 0 ? orientationDifference : STEPS.indexOf(left.step) - STEPS.indexOf(right.step)
  })
  const written = candidates[0]
  if (!written) throw new RangeError('Technique MIDI pitch could not be spelled.')
  return Object.freeze({ ...written, octave: (midi - NATURAL_PITCH_CLASSES[written.step] - written.alter) / 12 - 1 })
}
