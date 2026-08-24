import { ScoreImportError } from './errors'
import { addTime, compareTime, equalTime, maxTime, multiplyTime, musicalTime, subtractTime, ZERO_TIME, type MusicalTime } from './musicalTime'
import { createScorePitch, pitchWarnings } from './pitch'
import { calculateScoreStatistics } from './statistics'
import type {
  Articulation,
  Clef,
  DynamicEvent,
  DynamicMarking,
  KeySignature,
  NormalizedForward,
  NormalizedMeasure,
  NormalizedMeasureEvent,
  NormalizedNote,
  NormalizedPart,
  NormalizedRest,
  NormalizedScore,
  PedalEvent,
  PitchStep,
  ScoreMetadata,
  ScoreWarning,
  SlurMark,
  TempoEvent,
  TempoDirectionEvent,
  TimeSignature,
  TupletRatio,
  WedgeEvent,
} from './types'
import {
  childElements,
  childrenNamed,
  childText,
  firstChildNamed,
  integerChild,
  nodeName,
  numericChild,
  parseMusicXmlDocument,
  textContent,
  type XmlElement,
} from './xml'

export const MUSICXML_PARSER_VERSION = 'musicxml-parser-1.1.0'

interface ParserCollections {
  warnings: ScoreWarning[]
  tempoEvents: TempoEvent[]
  tempoDirectionEvents: TempoDirectionEvent[]
  dynamicEvents: DynamicEvent[]
  wedgeEvents: WedgeEvent[]
  pedalEvents: PedalEvent[]
}

interface PartState {
  divisions: number | null
  timeSignature: TimeSignature | null
  keySignature: KeySignature | null
  clefs: Map<number, Clef>
  absoluteOnset: MusicalTime
}

const DYNAMIC_MARKINGS = new Set<DynamicMarking>(['ppp', 'pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff'])
const ARTICULATIONS = new Set<Articulation>(['staccato', 'staccatissimo', 'tenuto', 'accent', 'strong-accent'])
const PEDAL_TYPES = new Set<PedalEvent['type']>(['start', 'stop', 'change', 'continue'])
const WEDGE_TYPES = new Set<WedgeEvent['type']>(['crescendo', 'diminuendo', 'stop', 'continue'])
const BEAT_UNIT_QUARTERS: Record<string, MusicalTime> = {
  whole: musicalTime(4),
  half: musicalTime(2),
  quarter: musicalTime(1),
  eighth: musicalTime(1, 2),
  '16th': musicalTime(1, 4),
  '32nd': musicalTime(1, 8),
}

function tempoDirectionKind(text: string): TempoDirectionEvent['kind'] | null {
  const normalized = text.toLocaleLowerCase().replace(/\s+/g, ' ').trim()
  if (/\ba\s+tempo\b/.test(normalized)) return 'a-tempo'
  if (/\b(?:rit(?:ardando)?|rall(?:entando)?)\b/.test(normalized)) return 'ritardando'
  if (/\b(?:accel(?:erando)?|accelerando)\b/.test(normalized)) return 'accelerando'
  return null
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function eventContext(partId: string, measureIndex: number, measureNumber: string, eventId?: string) {
  return { partId, measureIndex, measureNumber, eventId }
}

function requiredDuration(element: XmlElement, divisions: number | null, context: ReturnType<typeof eventContext>): MusicalTime {
  const rawDuration = integerChild(element, 'duration')
  if (rawDuration === null || rawDuration <= 0) {
    throw new ScoreImportError('INVALID_DURATION', `Measure ${context.measureNumber} contains a missing or invalid duration.`, context)
  }
  if (!divisions || divisions <= 0) {
    throw new ScoreImportError('MISSING_DIVISIONS', `Measure ${context.measureNumber} uses timed events before valid divisions are defined.`, context)
  }
  return musicalTime(rawDuration, divisions)
}

function parseExpectedDuration(beats: string, beatType: number): MusicalTime | null {
  const groups = beats.split('+').map((group) => Number(group.trim()))
  if (groups.some((group) => !Number.isSafeInteger(group) || group <= 0) || !Number.isSafeInteger(beatType) || beatType <= 0) return null
  return musicalTime(groups.reduce((sum, group) => sum + group, 0) * 4, beatType)
}

function parseAttributes(element: XmlElement, state: PartState): void {
  const divisions = integerChild(element, 'divisions')
  if (divisions !== null) {
    if (divisions <= 0) throw new ScoreImportError('MISSING_DIVISIONS', 'MusicXML divisions must be a positive integer.')
    state.divisions = divisions
  }

  const time = firstChildNamed(element, 'time')
  if (time) {
    const beats = childText(time, 'beats')
    const beatType = integerChild(time, 'beat-type')
    if (beats && beatType) state.timeSignature = { beats, beatType, expectedDuration: parseExpectedDuration(beats, beatType) }
  }

  const key = firstChildNamed(element, 'key')
  if (key) {
    const fifths = integerChild(key, 'fifths')
    if (fifths !== null) state.keySignature = { fifths, mode: childText(key, 'mode') }
  }

  for (const clefElement of childrenNamed(element, 'clef')) {
    const staff = Number(clefElement.getAttribute('number') || 1)
    const sign = childText(clefElement, 'sign')
    if (!Number.isSafeInteger(staff) || staff <= 0 || !sign) continue
    state.clefs.set(staff, {
      staff,
      sign,
      line: integerChild(clefElement, 'line'),
      octaveChange: integerChild(clefElement, 'clef-octave-change'),
    })
  }
}

function parseTuplet(note: XmlElement): TupletRatio | null {
  const modification = firstChildNamed(note, 'time-modification')
  if (!modification) return null
  const actualNotes = integerChild(modification, 'actual-notes')
  const normalNotes = integerChild(modification, 'normal-notes')
  return actualNotes && normalNotes ? { actualNotes, normalNotes } : null
}

function parseArticulations(note: XmlElement): Articulation[] {
  const notations = firstChildNamed(note, 'notations')
  if (!notations) return []
  const result: Articulation[] = []
  const articulations = firstChildNamed(notations, 'articulations')
  if (articulations) {
    for (const child of childElements(articulations)) {
      const name = nodeName(child) as Articulation
      if (ARTICULATIONS.has(name)) result.push(name)
    }
  }
  if (firstChildNamed(notations, 'fermata')) result.push('fermata')
  return result
}

function parseSlurs(note: XmlElement): SlurMark[] {
  const notations = firstChildNamed(note, 'notations')
  if (!notations) return []
  return childrenNamed(notations, 'slur').flatMap((slur) => {
    const type = slur.getAttribute('type')
    return type === 'start' || type === 'stop' || type === 'continue' ? [{ type, number: slur.getAttribute('number') }] : []
  })
}

function parseTies(note: XmlElement) {
  const soundTies = childrenNamed(note, 'tie').map((tie) => tie.getAttribute('type'))
  const notationTies = firstChildNamed(note, 'notations') ? childrenNamed(firstChildNamed(note, 'notations')!, 'tied').map((tie) => tie.getAttribute('type')) : []
  return {
    tieStart: soundTies.includes('start'),
    tieStop: soundTies.includes('stop'),
    notationTieStart: notationTies.includes('start'),
    notationTieStop: notationTies.includes('stop'),
  }
}

function parsePitch(note: XmlElement, collections: ParserCollections, context: ReturnType<typeof eventContext>) {
  const pitchElement = firstChildNamed(note, 'pitch')
  if (!pitchElement) {
    if (firstChildNamed(note, 'unpitched')) {
      collections.warnings.push({ ...context, code: 'UNPITCHED_NOTE', severity: 'warning', message: `Measure ${context.measureNumber} contains an unpitched note, preserved without a piano pitch.` })
      return null
    }
    throw new ScoreImportError('INVALID_PITCH', `Measure ${context.measureNumber} contains a note without pitch, rest, or unpitched information.`, context)
  }
  const step = childText(pitchElement, 'step') as PitchStep | null
  const octave = integerChild(pitchElement, 'octave')
  const alter = numericChild(pitchElement, 'alter') ?? 0
  if (!step || !['A', 'B', 'C', 'D', 'E', 'F', 'G'].includes(step) || octave === null) {
    throw new ScoreImportError('INVALID_PITCH', `Measure ${context.measureNumber} contains invalid pitch data.`, context)
  }
  const pitch = createScorePitch(step, alter, octave)
  collections.warnings.push(...pitchWarnings(pitch, context))
  return pitch
}

function directionPosition(direction: XmlElement, cursor: MusicalTime, divisions: number | null, context: ReturnType<typeof eventContext>): MusicalTime {
  const offset = integerChild(direction, 'offset')
  if (offset === null) return cursor
  if (!divisions || divisions <= 0) throw new ScoreImportError('MISSING_DIVISIONS', `Measure ${context.measureNumber} contains a direction offset before valid divisions are defined.`, context)
  const position = addTime(cursor, musicalTime(offset, divisions))
  if (compareTime(position, ZERO_TIME) < 0) throw new ScoreImportError('INVALID_CURSOR', `A direction offset in measure ${context.measureNumber} moves before the measure start.`, context)
  return position
}

function parseMetronome(metronome: XmlElement): { quarterBpm: number; display: string } | null {
  const beatUnit = childText(metronome, 'beat-unit')
  const perMinute = numericChild(metronome, 'per-minute')
  const base = beatUnit ? BEAT_UNIT_QUARTERS[beatUnit] : undefined
  if (!beatUnit || !base || perMinute === null || perMinute <= 0) return null
  const dotCount = childrenNamed(metronome, 'beat-unit-dot').length
  let dotted = base
  let addition = base
  for (let index = 0; index < dotCount; index += 1) {
    addition = multiplyTime(addition, 1, 2)
    dotted = addTime(dotted, addition)
  }
  return { quarterBpm: perMinute * dotted.numerator / dotted.denominator, display: `${beatUnit}${dotCount ? ' dotted' : ''} = ${perMinute}` }
}

function parseDirection(
  direction: XmlElement,
  partId: string,
  measureIndex: number,
  measureNumber: string,
  order: number,
  cursor: MusicalTime,
  state: PartState,
  collections: ParserCollections,
): void {
  const baseId = `part:${partId}:measure:${measureIndex}:direction:${order}`
  const context = eventContext(partId, measureIndex, measureNumber, baseId)
  const measureOnset = directionPosition(direction, cursor, state.divisions, context)
  const position = addTime(state.absoluteOnset, measureOnset)
  const staff = integerChild(direction, 'staff')
  const voice = childText(direction, 'voice')

  const sound = firstChildNamed(direction, 'sound')
  const soundTempo = sound ? Number(sound.getAttribute('tempo')) : Number.NaN
  if (Number.isFinite(soundTempo) && soundTempo > 0) {
    collections.tempoEvents.push({ id: `${baseId}:tempo:sound`, position, measureOnset, partId, measureIndex, staff, voice, quarterBpm: soundTempo, source: 'sound', display: null })
  }

  const directionTypes = childrenNamed(direction, 'direction-type')
  let eventOffset = 0
  for (const directionType of directionTypes) {
    for (const child of childElements(directionType)) {
      const name = nodeName(child)
      if (name === 'metronome') {
        const tempo = parseMetronome(child)
        if (tempo) {
          collections.tempoEvents.push({ id: `${baseId}:tempo:${eventOffset}`, position, measureOnset, partId, measureIndex, staff, voice, quarterBpm: tempo.quarterBpm, source: 'metronome', display: tempo.display })
        } else {
          collections.warnings.push({ ...context, code: 'UNSUPPORTED_TEMPO_MARK', severity: 'warning', message: `Measure ${measureNumber} contains a metronome marking that could not be normalized to quarter-note BPM.` })
        }
      } else if (name === 'words') {
        const text = textContent(child)
        const kind = text ? tempoDirectionKind(text) : null
        if (text && kind) collections.tempoDirectionEvents.push({
          id: `${baseId}:tempo-direction:${eventOffset}`,
          position,
          measureOnset,
          partId,
          measureIndex,
          measureNumber,
          staff,
          voice,
          kind,
          text,
        })
      } else if (name === 'dynamics') {
        for (const [markingIndex, markingElement] of childElements(child).entries()) {
          const marking = nodeName(markingElement) as DynamicMarking
          if (DYNAMIC_MARKINGS.has(marking)) collections.dynamicEvents.push({ id: `${baseId}:dynamic:${eventOffset}:${markingIndex}`, position, measureOnset, partId, measureIndex, measureNumber, staff, voice, marking })
        }
      } else if (name === 'wedge') {
        const type = child.getAttribute('type') as WedgeEvent['type'] | null
        if (type && WEDGE_TYPES.has(type)) collections.wedgeEvents.push({ id: `${baseId}:wedge:${eventOffset}`, position, measureOnset, partId, measureIndex, measureNumber, staff, voice, type, number: child.getAttribute('number') })
      } else if (name === 'pedal') {
        const type = child.getAttribute('type') as PedalEvent['type'] | null
        if (type && PEDAL_TYPES.has(type)) collections.pedalEvents.push({ id: `${baseId}:pedal:${eventOffset}`, position, partId, measureIndex, staff, type })
        else collections.warnings.push({ ...context, code: 'UNSUPPORTED_PEDAL', severity: 'warning', message: `Measure ${measureNumber} contains an unsupported pedal direction.` })
      }
      eventOffset += 1
    }
  }
}

function parseMetadata(root: XmlElement): ScoreMetadata {
  const work = firstChildNamed(root, 'work')
  const workTitle = work ? childText(work, 'work-title') : null
  const movementTitle = childText(root, 'movement-title')
  const identification = firstChildNamed(root, 'identification')
  const creators = identification ? childrenNamed(identification, 'creator').flatMap((creator) => {
    const name = textContent(creator)
    return name ? [{ type: creator.getAttribute('type'), name }] : []
  }) : []
  const partList = firstChildNamed(root, 'part-list')
  const partNames = partList ? childrenNamed(partList, 'score-part').flatMap((part) => {
    const name = childText(part, 'part-name')
    return name ? [name] : []
  }) : []
  return {
    workTitle,
    movementTitle,
    title: movementTitle ?? workTitle,
    composer: creators.find((creator) => creator.type === 'composer')?.name ?? null,
    creators,
    partNames,
  }
}

function partDefinitions(root: XmlElement): Map<string, { name: string | null; abbreviation: string | null }> {
  const definitions = new Map<string, { name: string | null; abbreviation: string | null }>()
  const partList = firstChildNamed(root, 'part-list')
  if (!partList) return definitions
  for (const part of childrenNamed(partList, 'score-part')) {
    const id = part.getAttribute('id')
    if (id) definitions.set(id, { name: childText(part, 'part-name'), abbreviation: childText(part, 'part-abbreviation') })
  }
  return definitions
}

function parseMeasure(
  element: XmlElement,
  partId: string,
  measureIndex: number,
  state: PartState,
  collections: ParserCollections,
): NormalizedMeasure {
  const measureNumber = element.getAttribute('number') || String(measureIndex + 1)
  const measureId = `part:${partId}:measure:${measureIndex}`
  const events: NormalizedMeasureEvent[] = []
  let cursor = ZERO_TIME
  let maxCursorReached = ZERO_TIME
  let eventIndex = 0
  let directionIndex = 0
  let previousAdvancingNote: NormalizedNote | null = null

  for (const child of childElements(element)) {
    const name = nodeName(child)
    const context = eventContext(partId, measureIndex, measureNumber)
    if (name === 'attributes') {
      parseAttributes(child, state)
      continue
    }
    if (name === 'backup') {
      const duration = requiredDuration(child, state.divisions, context)
      const rewound = subtractTime(cursor, duration)
      if (compareTime(rewound, ZERO_TIME) < 0) throw new ScoreImportError('INVALID_CURSOR', `A backup in measure ${measureNumber} moves before the measure start.`, context)
      cursor = rewound
      previousAdvancingNote = null
      continue
    }
    if (name === 'forward') {
      const id = `${measureId}:event:${eventIndex}`
      const duration = requiredDuration(child, state.divisions, eventContext(partId, measureIndex, measureNumber, id))
      const event: NormalizedForward = { id, type: 'forward', xmlOrder: eventIndex, measureIndex, measureNumber, onset: cursor, absoluteOnset: addTime(state.absoluteOnset, cursor), duration, voice: childText(child, 'voice'), staff: integerChild(child, 'staff') }
      events.push(event)
      cursor = addTime(cursor, duration)
      maxCursorReached = maxTime(maxCursorReached, cursor)
      eventIndex += 1
      previousAdvancingNote = null
      continue
    }
    if (name === 'direction') {
      parseDirection(child, partId, measureIndex, measureNumber, directionIndex, cursor, state, collections)
      directionIndex += 1
      continue
    }
    if (name !== 'note') continue

    const id = `${measureId}:event:${eventIndex}`
    const noteContext = eventContext(partId, measureIndex, measureNumber, id)
    const isGrace = firstChildNamed(child, 'grace') !== null
    const isCue = firstChildNamed(child, 'cue') !== null
    const isChordTone = firstChildNamed(child, 'chord') !== null
    const isRest = firstChildNamed(child, 'rest') !== null
    const duration = isGrace ? null : requiredDuration(child, state.divisions, noteContext)
    const voice = childText(child, 'voice')
    const staff = integerChild(child, 'staff')
    const onset = isChordTone && previousAdvancingNote ? previousAdvancingNote.onset : cursor

    if (isRest) {
      if (!duration) throw new ScoreImportError('INVALID_DURATION', `A rest in measure ${measureNumber} has no duration.`, noteContext)
      const restElement = firstChildNamed(child, 'rest')
      const rest: NormalizedRest = { id, type: 'rest', xmlOrder: eventIndex, measureIndex, measureNumber, onset, absoluteOnset: addTime(state.absoluteOnset, onset), duration, voice, staff, isMeasureRest: restElement?.getAttribute('measure') === 'yes', isCue, dotCount: childrenNamed(child, 'dot').length, tuplet: parseTuplet(child) }
      events.push(rest)
      if (!isChordTone) {
        cursor = addTime(cursor, duration)
        maxCursorReached = maxTime(maxCursorReached, cursor)
      }
      previousAdvancingNote = null
      eventIndex += 1
      continue
    }

    const pitch = parsePitch(child, collections, noteContext)
    const ties = parseTies(child)
    const note: NormalizedNote = {
      id,
      type: 'note',
      xmlOrder: eventIndex,
      measureIndex,
      measureNumber,
      onset,
      absoluteOnset: addTime(state.absoluteOnset, onset),
      duration,
      voice,
      staff,
      pitch,
      chordId: null,
      isChordTone,
      isGrace,
      isCue,
      accidental: childText(child, 'accidental'),
      dotCount: childrenNamed(child, 'dot').length,
      tuplet: parseTuplet(child),
      ...ties,
      articulations: parseArticulations(child),
      slurs: parseSlurs(child),
    }

    if (isChordTone) {
      if (previousAdvancingNote) {
        const chordId = previousAdvancingNote.chordId ?? `${previousAdvancingNote.id}:chord`
        previousAdvancingNote.chordId = chordId
        note.chordId = chordId
      } else {
        note.isChordTone = false
        collections.warnings.push({ ...noteContext, code: 'UNSUPPORTED_ELEMENT', severity: 'warning', message: `Measure ${measureNumber} contains a chord tone without a preceding chord root; it was treated as a sequential note.` })
      }
    }
    events.push(note)
    if (!note.isChordTone && !isGrace && duration) {
      cursor = addTime(cursor, duration)
      previousAdvancingNote = note
    } else if (!note.isChordTone && isGrace) {
      previousAdvancingNote = note
    }
    if (!isGrace && duration) maxCursorReached = maxTime(maxCursorReached, addTime(onset, duration))
    eventIndex += 1
  }

  const expectedDuration = state.timeSignature?.expectedDuration ?? null
  const implicit = element.getAttribute('implicit') === 'yes'
  if (expectedDuration && !equalTime(expectedDuration, maxCursorReached)) {
    collections.warnings.push({ code: 'MEASURE_DURATION_MISMATCH', severity: implicit ? 'info' : 'warning', message: `Measure ${measureNumber} contains ${maxCursorReached.numerator}/${maxCursorReached.denominator} quarter notes; the active time signature expects ${expectedDuration.numerator}/${expectedDuration.denominator}. This may be a valid pickup or incomplete measure.`, partId, measureIndex, measureNumber })
  }

  const measure: NormalizedMeasure = {
    id: measureId,
    index: measureIndex,
    number: measureNumber,
    implicit,
    absoluteOnset: state.absoluteOnset,
    expectedDuration,
    actualContentDuration: maxCursorReached,
    divisions: state.divisions,
    timeSignature: state.timeSignature ? { ...state.timeSignature } : null,
    keySignature: state.keySignature ? { ...state.keySignature } : null,
    clefs: [...state.clefs.values()].sort((left, right) => left.staff - right.staff),
    events,
  }
  const positionalDuration = compareTime(maxCursorReached, ZERO_TIME) > 0 ? maxCursorReached : expectedDuration ?? ZERO_TIME
  state.absoluteOnset = addTime(state.absoluteOnset, positionalDuration)
  return measure
}

function sortPositionedEvents<T extends { position: MusicalTime; id: string }>(events: T[]): void {
  events.sort((left, right) => compareTime(left.position, right.position) || left.id.localeCompare(right.id))
}

export function parseMusicXml(xmlText: string): NormalizedScore {
  const document = parseMusicXmlDocument(xmlText)
  const root = document.documentElement
  if (!root) throw new ScoreImportError('INVALID_XML', 'The MusicXML document has no root element.')
  const definitions = partDefinitions(root)
  const collections: ParserCollections = { warnings: [], tempoEvents: [], tempoDirectionEvents: [], dynamicEvents: [], wedgeEvents: [], pedalEvents: [] }
  const parts: NormalizedPart[] = []

  for (const [partIndex, partElement] of childrenNamed(root, 'part').entries()) {
    const partId = partElement.getAttribute('id') || `P${partIndex + 1}`
    const definition = definitions.get(partId)
    const state: PartState = { divisions: null, timeSignature: null, keySignature: null, clefs: new Map(), absoluteOnset: ZERO_TIME }
    const measures = childrenNamed(partElement, 'measure').map((measure, measureIndex) => parseMeasure(measure, partId, measureIndex, state, collections))
    parts.push({ id: partId, name: definition?.name ?? null, abbreviation: definition?.abbreviation ?? null, measures })
  }

  if (parts.length === 0) throw new ScoreImportError('NOT_MUSICXML', 'The MusicXML score does not contain any parts.')
  sortPositionedEvents(collections.tempoEvents)
  sortPositionedEvents(collections.tempoDirectionEvents)
  sortPositionedEvents(collections.dynamicEvents)
  sortPositionedEvents(collections.wedgeEvents)
  sortPositionedEvents(collections.pedalEvents)

  const withoutStatistics = {
    id: `score:${stableHash(xmlText)}`,
    metadata: parseMetadata(root),
    parts,
    tempoEvents: collections.tempoEvents,
    tempoDirectionEvents: collections.tempoDirectionEvents,
    dynamicEvents: collections.dynamicEvents,
    wedgeEvents: collections.wedgeEvents,
    pedalEvents: collections.pedalEvents,
    warnings: collections.warnings,
  }
  return { ...withoutStatistics, statistics: calculateScoreStatistics(withoutStatistics) }
}
