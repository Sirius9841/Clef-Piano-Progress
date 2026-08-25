import { buildExpectedPerformancePlan } from '../expected-performance/builder'
import { MUSICXML_PARSER_VERSION, parseMusicXml } from '../musicxml/parser'
import type { MusicalTime } from '../musicxml/musicalTime'
import { generateTechniqueEvents, techniqueStableHash } from './exerciseGenerator'
import type { CompiledTechniqueExercise, TechniqueChallengeProfile, TechniqueExerciseSpec, TechniqueGeneratedEvent } from './types'

const STEPS = ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B'] as const
const ALTERS = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0] as const

function pitchXml(midi: number): string {
  const pitchClass = ((midi % 12) + 12) % 12
  return `<pitch><step>${STEPS[pitchClass]}</step>${ALTERS[pitchClass] ? '<alter>1</alter>' : ''}<octave>${Math.floor(midi / 12) - 1}</octave></pitch>`
}

function durationDivisions(duration: MusicalTime): number { return Math.round(duration.numerator * 4 / duration.denominator) }

function durationNotation(duration: MusicalTime): string {
  const divisions = durationDivisions(duration)
  const values: Readonly<Record<number, readonly [string, boolean]>> = { 1: ['16th', false], 2: ['eighth', false], 3: ['eighth', true], 4: ['quarter', false], 6: ['quarter', true], 8: ['half', false], 12: ['half', true] }
  const [type, dotted] = values[divisions] ?? ['quarter', false]
  return `<type>${type}</type>${dotted ? '<dot/>' : ''}`
}

function musicXml(title: string, events: readonly TechniqueGeneratedEvent[]): string {
  let previousTempo: number | null = null
  const body = events.map((event) => {
    const direction = event.targetTempoBpm !== previousTempo ? `<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${event.targetTempoBpm}</per-minute></metronome></direction-type><sound tempo="${event.targetTempoBpm}"/></direction>` : ''
    previousTempo = event.targetTempoBpm
    const notes = event.midiNotes.map((midi, index) => `<note>${index > 0 ? '<chord/>' : ''}${pitchXml(midi)}<duration>${durationDivisions(event.duration)}</duration><voice>1</voice>${durationNotation(event.duration)}<staff>1</staff></note>`).join('')
    return direction + notes
  }).join('')
  return `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="4.0"><work><work-title>${title}</work-title></work><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>4</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><staves>1</staves><clef><sign>G</sign><line>2</line></clef></attributes>${body}</measure></part></score-partwise>`
}

function challenge(spec: TechniqueExerciseSpec, events: readonly TechniqueGeneratedEvent[]): TechniqueChallengeProfile {
  const pitches = events.flatMap((event) => [...event.midiNotes])
  const gcd = (left: number, right: number): number => right === 0 ? Math.abs(left) : gcd(right, left % right)
  const totalUnits = events.reduce((total, event) => total + event.duration.numerator * spec.subdivision / event.duration.denominator, 0)
  const divisor = gcd(totalUnits, spec.subdivision)
  const tempoChanges = events.reduce((total, event, index) => total + (index > 0 && event.targetTempoBpm !== events[index - 1]!.targetTempoBpm ? 1 : 0), 0)
  let maximumJump = 0
  for (let index = 1; index < events.length; index += 1) maximumJump = Math.max(maximumJump, Math.abs(events[index]!.midiNotes[0]! - events[index - 1]!.midiNotes[0]!))
  return {
    targetTempoBpm: spec.targetTempoBpm, eventCount: events.length,
    expectedDuration: { numerator: totalUnits / divisor, denominator: spec.subdivision / divisor },
    expectedDurationMs: Math.round(events.reduce((total, event) => total + (event.duration.numerator / event.duration.denominator) * 60_000 / event.targetTempoBpm, 0)),
    minimumMidi: Math.min(...pitches), maximumMidi: Math.max(...pitches), pitchSpanSemitones: Math.max(...pitches) - Math.min(...pitches),
    maximumChordSize: Math.max(...events.map((event) => event.midiNotes.length)), maximumJumpSemitones: maximumJump,
    rhythmicDensity: events.length / (totalUnits / spec.subdivision), smallestSubdivision: spec.subdivision, tempoChangeCount: tempoChanges, octaveSpan: spec.octaveSpan,
    moduleSpecific: { mode: spec.mode, direction: spec.direction, chordInversion: spec.chordInversion, jumpSemitones: spec.jumpSemitones, tempoShape: spec.tempoShape },
  }
}

export function compileTechniqueExercise(spec: TechniqueExerciseSpec): CompiledTechniqueExercise {
  const events = generateTechniqueEvents(spec)
  const title = `${spec.moduleId.replaceAll('-', ' ')} · ${spec.seed}`
  const generatedMusicXml = musicXml(title, events)
  const normalizedScore = parseMusicXml(generatedMusicXml)
  const expectedPerformancePlan = buildExpectedPerformancePlan(normalizedScore, { includedPartIds: ['P1'], fallbackQuarterBpm: spec.targetTempoBpm })
  const identity = techniqueStableHash(JSON.stringify({ spec, events }))
  return {
    snapshot: { id: `technique-instance:${identity}`, title, spec, generatedMusicXml, parserVersion: MUSICXML_PARSER_VERSION, events, challenge: challenge(spec, events) },
    normalizedScore,
    expectedPerformancePlan,
  }
}
