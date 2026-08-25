import { canonicalizeTechniqueSpec, defaultTechniqueSpec } from './catalog'
import type { DeclaredHandContext, TechniqueDirection, TechniqueExerciseSpec, TechniqueMode, TechniqueModuleId, TechniqueTempoShape } from './types'
export interface TechniqueFormState { readonly seed: string; readonly tonic: string; readonly mode: TechniqueMode; readonly targetTempoBpm: string; readonly eventCount: string; readonly direction: TechniqueDirection; readonly octaveSpan: string; readonly subdivision: string; readonly chordInversion: string; readonly jumpSemitones: string; readonly tempoShape: TechniqueTempoShape; readonly declaredHandContext: DeclaredHandContext }
export interface TechniqueConfigurationResult { readonly spec: TechniqueExerciseSpec | null; readonly errors: Readonly<Record<string, string>> }
const FIELD_LABELS: Readonly<Partial<Record<keyof TechniqueFormState, string>>> = { tonic: 'Tonic', targetTempoBpm: 'Tempo', eventCount: 'Event count', octaveSpan: 'Octave span', subdivision: 'Subdivision', chordInversion: 'Inversion', jumpSemitones: 'Jump size' }
export function formStateFromSpec(spec: TechniqueExerciseSpec): TechniqueFormState { return { seed: spec.seed, tonic: String(spec.tonic), mode: spec.mode, targetTempoBpm: String(spec.targetTempoBpm), eventCount: String(spec.eventCount), direction: spec.direction, octaveSpan: String(spec.octaveSpan), subdivision: String(spec.subdivision), chordInversion: String(spec.chordInversion), jumpSemitones: String(spec.jumpSemitones), tempoShape: spec.tempoShape, declaredHandContext: spec.declaredHandContext } }
export function defaultTechniqueForm(moduleId: TechniqueModuleId, seed?: string): TechniqueFormState { return formStateFromSpec(defaultTechniqueSpec(moduleId, seed)) }
export function validateTechniqueConfiguration(moduleId: TechniqueModuleId, form: TechniqueFormState): TechniqueConfigurationResult {
  const errors: Record<string, string> = {}
  const number = (key: keyof TechniqueFormState, minimum: number, maximum: number): number => { const raw = form[key]; const value = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : Number.NaN; if (!Number.isFinite(value) || !Number.isInteger(value) || value < minimum || value > maximum) errors[key] = `${FIELD_LABELS[key] ?? String(key)} must be between ${minimum} and ${maximum}.`; return value }
  if (!form.seed.trim()) errors.seed = 'Seed is required.'
  const tonic = number('tonic', 0, 11), targetTempoBpm = number('targetTempoBpm', 30, 240), eventCount = number('eventCount', 4, 64), octaveSpan = number('octaveSpan', 1, 2), subdivision = number('subdivision', 1, 4), chordInversion = number('chordInversion', 0, 2), jumpSemitones = number('jumpSemitones', 7, 24)
  if (![1, 2, 4].includes(subdivision)) errors.subdivision = 'Choose quarter, eighth, or sixteenth-note subdivision.'
  if (![7, 12, 19, 24].includes(jumpSemitones)) errors.jumpSemitones = 'Choose one of the supported jump sizes.'
  if (Object.keys(errors).length > 0) return { spec: null, errors }
  const base = defaultTechniqueSpec(moduleId, form.seed.trim())
  return { errors, spec: canonicalizeTechniqueSpec({ ...base, tonic, mode: form.mode, targetTempoBpm, eventCount, direction: form.direction, octaveSpan: octaveSpan as 1 | 2, subdivision: subdivision as 1 | 2 | 4, chordInversion: chordInversion as 0 | 1 | 2, jumpSemitones: jumpSemitones as 7 | 12 | 19 | 24, tempoShape: form.tempoShape, declaredHandContext: form.declaredHandContext }) }
}
export function createSightReadingSeed(): string { return globalThis.crypto.randomUUID() }
