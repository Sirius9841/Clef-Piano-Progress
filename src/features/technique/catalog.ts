import { TECHNIQUE_EXERCISE_ENGINE_VERSION, TECHNIQUE_MODULE_IDS, type TechniqueExerciseSpec, type TechniqueModuleId } from './types'

export interface TechniqueModuleDefinition {
  readonly id: TechniqueModuleId
  readonly name: string
  readonly description: string
  readonly facets: readonly string[]
}

export const TECHNIQUE_MODULES: readonly TechniqueModuleDefinition[] = [
  { id: 'sight-reading', name: 'Sight reading', description: 'Measure a first pass through deterministic unfamiliar notation.', facets: ['Note accuracy', 'Pulse continuity', 'First-pass reading'] },
  { id: 'rhythm', name: 'Rhythm', description: 'Measure subdivision and local interval precision.', facets: ['Rhythm precision', 'Pulse continuity'] },
  { id: 'chord-fluency', name: 'Chord fluency', description: 'Measure complete chord landings and synchronization.', facets: ['Chord accuracy', 'Chord synchronization'] },
  { id: 'scales', name: 'Scales', description: 'Measure pitch integrity and continuity through scale turns.', facets: ['Note accuracy', 'Onset evenness', 'Direction changes'] },
  { id: 'arpeggios', name: 'Arpeggios', description: 'Measure broken-chord accuracy across registers.', facets: ['Note accuracy', 'Transition consistency'] },
  { id: 'octaves', name: 'Octaves', description: 'Measure octave-pair integrity and repetition evenness.', facets: ['Octave integrity', 'Onset evenness'] },
  { id: 'keyboard-jumps', name: 'Keyboard jumps', description: 'Measure distant landing accuracy and recovery continuity.', facets: ['Landing accuracy', 'Jump timing', 'Recovery'] },
  { id: 'tempo-control', name: 'Tempo control', description: 'Measure target tempo, stability, and numeric transitions.', facets: ['Target tempo', 'Stability', 'Transitions'] },
]

export function isTechniqueModuleId(value: string | undefined): value is TechniqueModuleId {
  return value !== undefined && (TECHNIQUE_MODULE_IDS as readonly string[]).includes(value)
}

export function defaultTechniqueSpec(moduleId: TechniqueModuleId, seed = 'clef-1'): TechniqueExerciseSpec {
  return {
    moduleId,
    templateId: `${moduleId}-standard-v1`,
    seed,
    tonic: 0,
    mode: 'major',
    targetTempoBpm: moduleId === 'tempo-control' ? 72 : 80,
    eventCount: moduleId === 'chord-fluency' ? 8 : 16,
    direction: 'both',
    octaveSpan: 1,
    subdivision: moduleId === 'rhythm' ? 2 : 1,
    chordInversion: 0,
    jumpSemitones: 12,
    tempoShape: moduleId === 'tempo-control' ? 'arch' : 'steady',
    exerciseEngineVersion: TECHNIQUE_EXERCISE_ENGINE_VERSION,
  }
}
