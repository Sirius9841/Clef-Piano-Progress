import { TECHNIQUE_EXERCISE_ENGINE_VERSION, TECHNIQUE_MODULE_IDS, type TechniqueExerciseSpec, type TechniqueModuleId } from './types'
export interface TechniqueModuleDefinition { readonly id: TechniqueModuleId; readonly name: string; readonly description: string; readonly facets: readonly string[] }
export const TECHNIQUE_MODULES: readonly TechniqueModuleDefinition[] = [
  { id: 'sight-reading', name: 'Sight reading', description: 'Measure note accuracy and pulse continuity in an exact first-pass context.', facets: ['Note accuracy', 'Pulse continuity'] },
  { id: 'rhythm', name: 'Rhythm', description: 'Measure authored interval precision separately from hesitation.', facets: ['Rhythm precision', 'Pulse continuity'] },
  { id: 'chord-fluency', name: 'Chord fluency', description: 'Measure complete chord landings and synchronization.', facets: ['Chord accuracy', 'Chord synchronization'] },
  { id: 'scales', name: 'Scales', description: 'Measure exact scale pitch integrity, transition evenness, and the real turn.', facets: ['Note accuracy', 'Onset evenness', 'Direction-change continuity'] },
  { id: 'arpeggios', name: 'Arpeggios', description: 'Measure exact broken-chord pitch integrity and normalized transitions.', facets: ['Note accuracy', 'Arpeggio transition consistency'] },
  { id: 'octaves', name: 'Octaves', description: 'Measure octave-pair integrity and repetition timing.', facets: ['Octave integrity', 'Onset evenness'] },
  { id: 'keyboard-jumps', name: 'Keyboard jumps', description: 'Measure distant landings separately from post-landing recovery.', facets: ['Landing accuracy', 'Jump timing', 'Recovery continuity'] },
  { id: 'tempo-control', name: 'Tempo control', description: 'Measure numeric target accuracy, stability, and authored tempo trajectories.', facets: ['Target tempo', 'Tempo stability', 'Transition control'] },
]
export const TONIC_LABELS = ['C', 'C♯ / D♭', 'D', 'D♯ / E♭', 'E', 'F', 'F♯ / G♭', 'G', 'G♯ / A♭', 'A', 'A♯ / B♭', 'B'] as const
export function tonicLabel(tonic: number): string { return TONIC_LABELS[tonic] ?? 'Unknown key' }
export function isTechniqueModuleId(value: string | undefined): value is TechniqueModuleId { return value !== undefined && (TECHNIQUE_MODULE_IDS as readonly string[]).includes(value) }
export function derivedScaleEventCount(octaves: 1 | 2, direction: TechniqueExerciseSpec['direction']): number { const ascending = octaves * 7 + 1; return direction === 'both' ? ascending * 2 - 1 : ascending }
export function derivedArpeggioEventCount(octaves: 1 | 2, direction: TechniqueExerciseSpec['direction']): number { const ascending = octaves * 3 + 1; return direction === 'both' ? ascending * 2 - 1 : ascending }
export function canonicalizeTechniqueSpec(spec: TechniqueExerciseSpec): TechniqueExerciseSpec {
  const eventCount = spec.moduleId === 'scales' ? derivedScaleEventCount(spec.octaveSpan, spec.direction) : spec.moduleId === 'arpeggios' ? derivedArpeggioEventCount(spec.octaveSpan, spec.direction) : spec.eventCount
  return { ...spec, eventCount, seed: spec.seed.trim() }
}
export function defaultTechniqueSpec(moduleId: TechniqueModuleId, seed = 'clef-1'): TechniqueExerciseSpec {
  return canonicalizeTechniqueSpec({ moduleId, templateId: `${moduleId}-standard-v2`, seed, tonic: 0, mode: 'major', targetTempoBpm: moduleId === 'tempo-control' ? 72 : 80,
    eventCount: moduleId === 'chord-fluency' ? 8 : moduleId === 'keyboard-jumps' ? 13 : 16, direction: 'both', octaveSpan: 1,
    subdivision: moduleId === 'rhythm' ? 2 : 1, chordInversion: 0, jumpSemitones: 12, tempoShape: moduleId === 'tempo-control' ? 'arch' : 'steady',
    declaredHandContext: 'right', exerciseEngineVersion: TECHNIQUE_EXERCISE_ENGINE_VERSION })
}
