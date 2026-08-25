import type { MusicalTime } from '../musicxml/musicalTime'
import { TECHNIQUE_EXERCISE_ENGINE_VERSION, type TechniqueExerciseSpec, type TechniqueGeneratedEvent } from './types'

function hash(value: string): number {
  let result = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) { result ^= value.charCodeAt(index); result = Math.imul(result, 0x01000193) }
  return result >>> 0
}

function random(seed: string): () => number {
  let state = hash(seed) || 1
  return () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 0x1_0000_0000 }
}

function time(numerator: number, denominator = 1): MusicalTime {
  const gcd = (left: number, right: number): number => right === 0 ? Math.abs(left) : gcd(right, left % right)
  const divisor = gcd(numerator, denominator)
  return { numerator: numerator / divisor, denominator: denominator / divisor }
}

function basePitch(spec: TechniqueExerciseSpec): number { return 60 + spec.tonic }

function scalePitches(spec: TechniqueExerciseSpec): number[] {
  const intervals = spec.mode === 'major' ? [0, 2, 4, 5, 7, 9, 11, 12] : [0, 2, 3, 5, 7, 8, 10, 12]
  const up = Array.from({ length: spec.octaveSpan }, (_, octave) => intervals.slice(0, -1).map((value) => basePitch(spec) + value + octave * 12)).flat().concat(basePitch(spec) + spec.octaveSpan * 12)
  if (spec.direction === 'ascending') return up
  if (spec.direction === 'descending') return [...up].reverse()
  return up.concat([...up].reverse().slice(1))
}

function arpeggioPitches(spec: TechniqueExerciseSpec): number[] {
  const triad = spec.mode === 'major' ? [0, 4, 7] : [0, 3, 7]
  const up = Array.from({ length: spec.octaveSpan + 1 }, (_, octave) => triad.map((value) => basePitch(spec) + value + octave * 12)).flat()
  if (spec.direction === 'ascending') return up
  if (spec.direction === 'descending') return [...up].reverse()
  return up.concat([...up].reverse().slice(1))
}

function tempoAt(spec: TechniqueExerciseSpec, index: number): number {
  if (spec.tempoShape === 'steady') return spec.targetTempoBpm
  const progress = spec.eventCount <= 1 ? 0 : index / (spec.eventCount - 1)
  const offset = spec.tempoShape === 'accelerate' ? progress * 20 : spec.tempoShape === 'decelerate' ? -progress * 20 : Math.sin(progress * Math.PI) * 20
  return Math.max(30, Math.round(spec.targetTempoBpm + offset))
}

export function generateTechniqueEvents(spec: TechniqueExerciseSpec): readonly TechniqueGeneratedEvent[] {
  if (spec.exerciseEngineVersion !== TECHNIQUE_EXERCISE_ENGINE_VERSION) throw new RangeError('Unsupported Technique exercise engine version.')
  if (!Number.isInteger(spec.eventCount) || spec.eventCount < 4 || spec.eventCount > 64) throw new RangeError('Technique eventCount must be an integer from 4 through 64.')
  if (!Number.isFinite(spec.targetTempoBpm) || spec.targetTempoBpm < 30 || spec.targetTempoBpm > 240) throw new RangeError('Technique target tempo must be from 30 through 240 BPM.')
  const next = random(`${spec.templateId}|${spec.seed}`)
  const scale = scalePitches(spec)
  const arpeggio = arpeggioPitches(spec)
  let cursor = 0
  let previous = basePitch(spec)
  return Array.from({ length: spec.eventCount }, (_, index) => {
    let pitches: number[]
    if (spec.moduleId === 'scales') pitches = [scale[index % scale.length]!]
    else if (spec.moduleId === 'arpeggios') pitches = [arpeggio[index % arpeggio.length]!]
    else if (spec.moduleId === 'octaves') { const root = basePitch(spec) + (index % 8); pitches = [root, root + 12] }
    else if (spec.moduleId === 'chord-fluency') {
      const roots = [0, 5, 7, 0]
      const root = basePitch(spec) + roots[index % roots.length]!
      const shape = spec.mode === 'major' ? [0, 4, 7] : [0, 3, 7]
      const inverted = shape.map((value, shapeIndex) => value + (shapeIndex < spec.chordInversion ? 12 : 0)).sort((a, b) => a - b)
      pitches = inverted.map((value) => root + value)
    } else if (spec.moduleId === 'keyboard-jumps') {
      const direction = index % 2 === 0 ? 1 : -1
      previous = Math.max(40, Math.min(88, previous + direction * spec.jumpSemitones))
      pitches = [previous]
    } else if (spec.moduleId === 'sight-reading') {
      const diatonic = spec.mode === 'major' ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10]
      pitches = [basePitch(spec) + diatonic[Math.floor(next() * diatonic.length)]! + (next() > .82 ? 12 : 0)]
    } else pitches = [basePitch(spec) + (index % 2 === 0 ? 0 : 2)]
    const role = index === 0 ? 'opening' : index === spec.eventCount - 1 ? 'closing' : index === Math.floor(spec.eventCount / 2) ? 'turn' : spec.moduleId === 'keyboard-jumps' ? 'landing' : 'continuation'
    const rhythmUnits = spec.moduleId === 'rhythm' ? [1, 1, 2, 1, 3, 1, 2, 1][index % 8]! : 1
    const event = { id: `technique:event:${index}`, position: time(cursor, spec.subdivision), duration: time(rhythmUnits, spec.subdivision), midiNotes: pitches, role, targetTempoBpm: tempoAt(spec, index) } as const
    cursor += rhythmUnits
    return event
  })
}

export function techniqueStableHash(value: string): string { return hash(value).toString(16).padStart(8, '0') }
