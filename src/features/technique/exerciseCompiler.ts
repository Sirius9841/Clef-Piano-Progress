import { buildExpectedPerformancePlan } from '../expected-performance/builder'
import { MUSICXML_PARSER_VERSION, parseMusicXml } from '../musicxml/parser'
import type { MusicalTime } from '../musicxml/musicalTime'
import { deepFreeze } from '../timing-analysis/math'
import { canonicalizeTechniqueSpec } from './catalog'
import { generateTechniqueEvents, techniqueStableHash } from './exerciseGenerator'
import { notationKeyForTechniqueSpec, spellMidiForTechniqueKey, type TechniqueNotationKey } from './techniqueNotation'
import { TECHNIQUE_EXERCISE_ENGINE_VERSION, type CompiledTechniqueExercise, type TechniqueChallengeProfile, type TechniqueExerciseSpec, type TechniqueGeneratedEvent } from './types'

export function escapeMusicXmlText(value: string): string { return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;') }
function pitchXml(midi: number, key: TechniqueNotationKey): string { const pitch = spellMidiForTechniqueKey(midi, key); return `<pitch><step>${pitch.step}</step>${pitch.alter !== 0 ? `<alter>${pitch.alter}</alter>` : ''}<octave>${pitch.octave}</octave></pitch>` }
function durationDivisions(duration: MusicalTime): number { return Math.round(duration.numerator * 4 / duration.denominator) }
function durationNotation(duration: MusicalTime): string { const divisions = durationDivisions(duration); const values: Readonly<Record<number, readonly [string, boolean]>> = { 1: ['16th', false], 2: ['eighth', false], 3: ['eighth', true], 4: ['quarter', false], 6: ['quarter', true], 8: ['half', false], 12: ['half', true], 16: ['whole', false] }; const [type, dotted] = values[divisions] ?? ['quarter', false]; return `<type>${type}</type>${dotted ? '<dot/>' : ''}` }

function eventXml(event: TechniqueGeneratedEvent, tempoChanged: boolean, key: TechniqueNotationKey): string {
  const direction = tempoChanged ? `<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${event.targetTempoBpm}</per-minute></metronome></direction-type><sound tempo="${event.targetTempoBpm}"/></direction>` : ''
  const notes = event.midiNotes.map((midi, index) => `<note>${index > 0 ? '<chord/>' : ''}${pitchXml(midi, key)}<duration>${durationDivisions(event.duration)}</duration><voice>1</voice>${durationNotation(event.duration)}<staff>1</staff></note>`).join('')
  return direction + notes
}

function musicXml(title: string, events: readonly TechniqueGeneratedEvent[], key: TechniqueNotationKey): string {
  const measures: TechniqueGeneratedEvent[][] = []; let current: TechniqueGeneratedEvent[] = [], used = 0
  for (const event of events) { const divisions = durationDivisions(event.duration); if (current.length > 0 && used + divisions > 16) { measures.push(current); current = []; used = 0 } current.push(event); used += divisions }
  if (current.length > 0) measures.push(current)
  let previousTempo: number | null = null, previousTimeSignature: string | null = null
  const body = measures.map((measure, measureIndex) => {
    const measureDivisions = measure.reduce((total, event) => total + durationDivisions(event.duration), 0)
    const [beats, beatType] = measureDivisions % 4 === 0 ? [measureDivisions / 4, 4] : measureDivisions % 2 === 0 ? [measureDivisions / 2, 8] : [measureDivisions, 16]
    const timeSignature = `${beats}/${beatType}`, time = timeSignature !== previousTimeSignature ? `<time><beats>${beats}</beats><beat-type>${beatType}</beat-type></time>` : ''
    previousTimeSignature = timeSignature
    const attributes = `<attributes><divisions>4</divisions>${time}${measureIndex === 0 ? `<key><fifths>${key.fifths}</fifths></key><staves>1</staves><clef><sign>G</sign><line>2</line></clef>` : ''}</attributes>`
    const content = measure.map((event) => { const changed = event.targetTempoBpm !== previousTempo; previousTempo = event.targetTempoBpm; return eventXml(event, changed, key) }).join('')
    return `<measure number="${measureIndex + 1}">${attributes}${content}</measure>`
  }).join('')
  return `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="4.0"><work><work-title>${escapeMusicXmlText(title)}</work-title></work><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">${body}</part></score-partwise>`
}

function challenge(spec: TechniqueExerciseSpec, events: readonly TechniqueGeneratedEvent[], key: TechniqueNotationKey): TechniqueChallengeProfile {
  const pitches = events.flatMap((event) => [...event.midiNotes]); const gcd = (left: number, right: number): number => right === 0 ? Math.abs(left) : gcd(right, left % right)
  const totalUnits = events.reduce((total, event) => total + event.duration.numerator * spec.subdivision / event.duration.denominator, 0), divisor = gcd(totalUnits, spec.subdivision)
  const tempoChanges = events.reduce((total, event, index) => total + (index > 0 && event.targetTempoBpm !== events[index - 1]!.targetTempoBpm ? 1 : 0), 0)
  let maximumJump = 0; for (let index = 1; index < events.length; index += 1) maximumJump = Math.max(maximumJump, Math.abs(events[index]!.midiNotes[0]! - events[index - 1]!.midiNotes[0]!))
  return { tonic: spec.tonic, mode: spec.mode, declaredHandContext: spec.declaredHandContext, direction: spec.direction, subdivision: spec.subdivision, chordInversion: spec.chordInversion, jumpSemitones: spec.jumpSemitones, tempoShape: spec.tempoShape,
    targetTempoBpm: spec.targetTempoBpm, eventCount: events.length, expectedDuration: { numerator: totalUnits / divisor, denominator: spec.subdivision / divisor },
    expectedDurationMs: Math.round(events.reduce((total, event) => total + event.duration.numerator / event.duration.denominator * 60_000 / event.targetTempoBpm, 0)),
    minimumMidi: Math.min(...pitches), maximumMidi: Math.max(...pitches), pitchSpanSemitones: Math.max(...pitches) - Math.min(...pitches), maximumChordSize: Math.max(...events.map((event) => event.midiNotes.length)), maximumJumpSemitones: maximumJump,
    rhythmicDensity: events.length / (totalUnits / spec.subdivision), smallestSubdivision: spec.subdivision, tempoChangeCount: tempoChanges, octaveSpan: spec.octaveSpan,
    moduleSpecific: { tonicLabel: key.displayName, notationFifths: key.fifths, mode: spec.mode, direction: spec.direction, chordInversion: spec.chordInversion, jumpSemitones: spec.jumpSemitones, tempoShape: spec.tempoShape, declaredHandContext: spec.declaredHandContext } }
}

function exerciseTitle(spec: TechniqueExerciseSpec, key: TechniqueNotationKey): string {
  const quality = spec.mode === 'major' ? 'major' : 'natural minor'
  if (spec.moduleId === 'scales') return `${key.displayName} ${quality} scale`
  if (spec.moduleId === 'arpeggios') return `${key.displayName} ${quality} arpeggio`
  if (spec.moduleId === 'chord-fluency') return `${key.displayName} ${quality} chord study`
  if (spec.moduleId === 'sight-reading') return `${key.displayName} ${quality} sight-reading study`
  return spec.moduleId.replaceAll('-', ' ')
}

export function compileTechniqueExercise(input: TechniqueExerciseSpec): CompiledTechniqueExercise {
  if (input.exerciseEngineVersion !== TECHNIQUE_EXERCISE_ENGINE_VERSION) throw new RangeError(`Technique exercise generation requires ${TECHNIQUE_EXERCISE_ENGINE_VERSION}.`)
  const spec = canonicalizeTechniqueSpec(input), events = generateTechniqueEvents(spec), key = notationKeyForTechniqueSpec(spec), title = exerciseTitle(spec, key), generatedMusicXml = musicXml(title, events, key)
  const normalizedScore = parseMusicXml(generatedMusicXml), expectedPerformancePlan = buildExpectedPerformancePlan(normalizedScore, { includedPartIds: ['P1'], fallbackQuarterBpm: spec.targetTempoBpm })
  const identity = techniqueStableHash(JSON.stringify({ spec, events }))
  return { snapshot: deepFreeze({ id: `technique-instance:${identity}`, title, spec, generatedMusicXml, parserVersion: MUSICXML_PARSER_VERSION, events, challenge: challenge(spec, events, key) }), normalizedScore, expectedPerformancePlan }
}
