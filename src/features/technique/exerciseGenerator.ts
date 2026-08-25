import type { MusicalTime } from '../musicxml/musicalTime'
import { canonicalizeTechniqueSpec } from './catalog'
import { TECHNIQUE_EXERCISE_ENGINE_VERSION, type TechniqueExerciseSpec, type TechniqueGeneratedEvent, type TechniqueTransitionKind } from './types'

function hash(value: string): number { let result = 0x811c9dc5; for (let index = 0; index < value.length; index += 1) { result ^= value.charCodeAt(index); result = Math.imul(result, 0x01000193) } return result >>> 0 }
function random(seed: string): () => number { let state = hash(seed) || 1; return () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 0x1_0000_0000 } }
function time(numerator: number, denominator = 1): MusicalTime { const gcd = (left: number, right: number): number => right === 0 ? Math.abs(left) : gcd(right, left % right); const divisor = gcd(numerator, denominator); return { numerator: numerator / divisor, denominator: denominator / divisor } }
function basePitch(spec: TechniqueExerciseSpec): number { return 60 + spec.tonic }

export function scaleSequence(spec: TechniqueExerciseSpec): readonly number[] {
  const pattern = spec.mode === 'major' ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10]
  const up = Array.from({ length: spec.octaveSpan }, (_, octave) => pattern.map((value) => basePitch(spec) + value + octave * 12)).flat().concat(basePitch(spec) + spec.octaveSpan * 12)
  if (spec.direction === 'ascending') return up
  if (spec.direction === 'descending') return [...up].reverse()
  return up.concat([...up].reverse().slice(1))
}

export function arpeggioSequence(spec: TechniqueExerciseSpec): readonly number[] {
  const pattern = spec.mode === 'major' ? [0, 4, 7] : [0, 3, 7]
  const up = Array.from({ length: spec.octaveSpan }, (_, octave) => pattern.map((value) => basePitch(spec) + value + octave * 12)).flat().concat(basePitch(spec) + spec.octaveSpan * 12)
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

function validateSpec(spec: TechniqueExerciseSpec): void {
  if (spec.exerciseEngineVersion !== TECHNIQUE_EXERCISE_ENGINE_VERSION) throw new RangeError('Unsupported Technique exercise engine version.')
  if (!spec.seed.trim()) throw new RangeError('Technique seed is required.')
  if (!Number.isInteger(spec.tonic) || spec.tonic < 0 || spec.tonic > 11) throw new RangeError('Technique tonic must be from 0 through 11.')
  if (!Number.isInteger(spec.eventCount) || spec.eventCount < 4 || spec.eventCount > 64) throw new RangeError('Technique eventCount must be an integer from 4 through 64.')
  if (!Number.isFinite(spec.targetTempoBpm) || spec.targetTempoBpm < 30 || spec.targetTempoBpm > 240) throw new RangeError('Technique target tempo must be from 30 through 240 BPM.')
}

function jumpPitch(spec: TechniqueExerciseSpec, index: number, previous: number): number {
  if (index === 0) return basePitch(spec)
  if (index % 2 === 1) {
    const landingNumber = Math.floor(index / 2)
    const direction = landingNumber % 2 === 0 ? 1 : -1
    return Math.max(28, Math.min(96, previous + direction * spec.jumpSemitones))
  }
  const towardCenter = previous > basePitch(spec) ? -2 : 2
  return Math.max(28, Math.min(96, previous + towardCenter))
}

export function generateTechniqueEvents(input: TechniqueExerciseSpec): readonly TechniqueGeneratedEvent[] {
  const spec = canonicalizeTechniqueSpec(input)
  validateSpec(spec)
  const next = random(`${spec.templateId}|${spec.seed}`)
  const scale = scaleSequence(spec), arpeggio = arpeggioSequence(spec)
  let cursor = 0, previousPitch = basePitch(spec)
  const events = Array.from({ length: spec.eventCount }, (_, index): TechniqueGeneratedEvent => {
    let midiNotes: number[]
    if (spec.moduleId === 'scales') midiNotes = [scale[index]!]
    else if (spec.moduleId === 'arpeggios') midiNotes = [arpeggio[index]!]
    else if (spec.moduleId === 'octaves') { const root = basePitch(spec) + (index % 8); midiNotes = [root, root + 12] }
    else if (spec.moduleId === 'chord-fluency') {
      const root = basePitch(spec) + [0, 5, 7, 0][index % 4]!
      const shape = spec.mode === 'major' ? [0, 4, 7] : [0, 3, 7]
      midiNotes = shape.map((value, shapeIndex) => value + root + (shapeIndex < spec.chordInversion ? 12 : 0)).sort((left, right) => left - right)
    } else if (spec.moduleId === 'keyboard-jumps') { previousPitch = jumpPitch(spec, index, previousPitch); midiNotes = [previousPitch] }
    else if (spec.moduleId === 'sight-reading') {
      const diatonic = spec.mode === 'major' ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10]
      midiNotes = [basePitch(spec) + diatonic[Math.floor(next() * diatonic.length)]! + (next() > .82 ? 12 : 0)]
    } else midiNotes = [basePitch(spec) + (index % 2 === 0 ? 0 : 2)]

    const turnIndex = (spec.moduleId === 'scales' ? scale : arpeggio).length > 0 && spec.direction === 'both' ? Math.floor(spec.eventCount / 2) : -1
    const role: TechniqueGeneratedEvent['role'] = spec.moduleId === 'keyboard-jumps' ? index === 0 ? 'opening' : index % 2 === 1 ? 'landing' : 'recovery'
      : index === 0 ? 'opening' : index === turnIndex ? 'turn' : index === spec.eventCount - 1 ? 'closing' : 'continuation'
    let transitionKind: TechniqueTransitionKind = index === 0 ? 'opening' : 'ordinary'
    if (spec.moduleId === 'keyboard-jumps' && role === 'landing') transitionKind = 'jump-landing'
    else if (spec.moduleId === 'keyboard-jumps' && role === 'recovery') transitionKind = 'jump-recovery'
    else if ((spec.moduleId === 'scales' || spec.moduleId === 'arpeggios') && spec.direction === 'both' && index === turnIndex + 1) transitionKind = 'direction-change'
    else if (spec.moduleId === 'arpeggios' && index > 0 && Math.floor(midiNotes[0]! / 12) !== Math.floor(arpeggio[index - 1]! / 12)) transitionKind = 'register-boundary'
    const rhythmUnits = spec.moduleId === 'rhythm' ? [1, 1, 2, 1, 3, 1, 2, 1][index % 8]! : 1
    const event = { id: `technique:event:${index}`, position: time(cursor, spec.subdivision), duration: time(rhythmUnits, spec.subdivision), midiNotes, role, transitionKind, targetTempoBpm: tempoAt(spec, index) }
    cursor += rhythmUnits
    return event
  })
  return Object.freeze(events.map((event) => Object.freeze({ ...event, midiNotes: Object.freeze([...event.midiNotes]) })))
}
export function techniqueStableHash(value: string): string { return hash(value).toString(16).padStart(8, '0') }
