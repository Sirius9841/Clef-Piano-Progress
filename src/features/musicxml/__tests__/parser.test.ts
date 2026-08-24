import { describe, expect, it } from 'vitest'
import { ScoreImportError } from '../errors'
import { musicalTime } from '../musicalTime'
import { MUSICXML_PARSER_VERSION, parseMusicXml } from '../parser'
import {
  accidentalsFixture,
  basicMelodyFixture,
  chordFixture,
  contextAndDirectionsFixture,
  fractionalFixture,
  graceAndRangeFixture,
  pianoVoicesFixture,
  pickupFixture,
  scoreFixture,
  tiesFixture,
} from './fixtures'

describe('MusicXML normalized parser', () => {
  it('owns one explicit parser version for persisted ScoreVersion provenance', () => {
    expect(MUSICXML_PARSER_VERSION).toMatch(/^musicxml-parser-\d+\.\d+\.\d+$/)
  })

  it('parses metadata, melody, rests, context, and basic measure timing', () => {
    const score = parseMusicXml(basicMelodyFixture)
    const measure = score.parts[0]?.measures[0]
    expect(score.metadata).toMatchObject({ title: 'Parser Test', composer: 'Clef Test Suite', partNames: ['Piano'] })
    expect(measure?.expectedDuration).toEqual(musicalTime(4))
    expect(measure?.actualContentDuration).toEqual(musicalTime(4))
    expect(measure?.timeSignature).toMatchObject({ beats: '4', beatType: 4 })
    expect(measure?.keySignature).toEqual({ fifths: 0, mode: 'major' })
    expect(measure?.clefs[0]).toMatchObject({ staff: 1, sign: 'G', line: 2 })
    expect(score.statistics).toMatchObject({ pitchedNoteCount: 2, restCount: 1, measureCount: 1 })
    expect(measure?.events.map((event) => event.onset)).toEqual([musicalTime(0), musicalTime(1), musicalTime(2)])
  })

  it('groups chord tones at one onset and advances only the root note', () => {
    const events = parseMusicXml(chordFixture).parts[0]?.measures[0]?.events
    const notes = events?.filter((event) => event.type === 'note') ?? []
    expect(notes.map((note) => note.onset)).toEqual([musicalTime(0), musicalTime(0), musicalTime(0), musicalTime(1)])
    expect(notes.slice(0, 3).map((note) => note.chordId)).toEqual([notes[0]?.chordId, notes[0]?.chordId, notes[0]?.chordId])
    expect(notes[1]?.staff).toBe(2)
    expect(parseMusicXml(chordFixture).statistics.chordCount).toBe(1)
  })

  it('rewinds backup for overlapping voices and preserves staff and forward data', () => {
    const measure = parseMusicXml(pianoVoicesFixture).parts[0]?.measures[0]
    const notes = measure?.events.filter((event) => event.type === 'note') ?? []
    expect(notes.map((note) => [note.voice, note.staff, note.onset])).toEqual([
      ['1', 1, musicalTime(0)],
      ['2', 2, musicalTime(0)],
      ['2', 2, musicalTime(3)],
    ])
    expect(measure?.events.find((event) => event.type === 'forward')).toMatchObject({ duration: musicalTime(1), voice: '2', staff: 2 })
    expect(measure?.actualContentDuration).toEqual(musicalTime(4))
    expect(measure?.clefs).toHaveLength(2)
  })

  it('preserves enharmonic spelling while mapping equal MIDI pitches', () => {
    const notes = parseMusicXml(accidentalsFixture).parts[0]?.measures[0]?.events.filter((event) => event.type === 'note') ?? []
    expect(notes.map((note) => note.pitch?.spelling)).toEqual(['C#4', 'Db4'])
    expect(notes.map((note) => note.pitch?.midi)).toEqual([61, 61])
    expect(notes.map((note) => note.accidental)).toEqual(['sharp', 'flat'])
  })

  it('preserves sound and notation ties across measures', () => {
    const score = parseMusicXml(tiesFixture)
    const first = score.parts[0]?.measures[0]?.events[0]
    const second = score.parts[0]?.measures[1]?.events[0]
    expect(first).toMatchObject({ type: 'note', tieStart: true, notationTieStart: true, absoluteOnset: musicalTime(0) })
    expect(second).toMatchObject({ type: 'note', tieStop: true, notationTieStop: true, absoluteOnset: musicalTime(1) })
  })

  it('keeps triplet timing exact and preserves notation metadata', () => {
    const notes = parseMusicXml(fractionalFixture).parts[0]?.measures[0]?.events.filter((event) => event.type === 'note') ?? []
    expect(notes.map((note) => note.duration)).toEqual([musicalTime(1, 3), musicalTime(1, 3), musicalTime(1, 3)])
    expect(notes.map((note) => note.onset)).toEqual([musicalTime(0), musicalTime(1, 3), musicalTime(2, 3)])
    expect(notes[0]?.tuplet).toEqual({ actualNotes: 3, normalNotes: 2 })
    expect(notes[2]?.dotCount).toBe(1)
  })

  it('applies divisions changes sequentially without losing exact time', () => {
    const score = parseMusicXml(scoreFixture(`
      <measure number="1"><attributes><divisions>2</divisions></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><staff>1</staff></note></measure>
      <measure number="2"><attributes><divisions>3</divisions></attributes><note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><staff>1</staff></note></measure>`))
    const secondMeasure = score.parts[0]?.measures[1]
    expect(secondMeasure?.divisions).toBe(3)
    expect(secondMeasure?.absoluteOnset).toEqual(musicalTime(1))
    expect(secondMeasure?.events[0]).toMatchObject({ duration: musicalTime(1, 3), absoluteOnset: musicalTime(1) })
  })

  it('normalizes tempo forms and positions directions exactly', () => {
    const score = parseMusicXml(contextAndDirectionsFixture)
    expect(score.tempoEvents.map((event) => event.quarterBpm)).toEqual([100, 100, 120])
    expect(score.tempoDirectionEvents.map((event) => [event.kind, event.text, event.position])).toEqual([
      ['ritardando', 'rit.', musicalTime(0)],
      ['a-tempo', 'a tempo, dim.', musicalTime(5)],
    ])
    expect(score.tempoEvents[2]?.position).toEqual(musicalTime(5))
    expect(score.dynamicEvents.map((event) => [event.marking, event.position])).toEqual([['p', musicalTime(0)], ['mf', musicalTime(5)]])
    expect(score.wedgeEvents.map((event) => event.type)).toEqual(['crescendo', 'stop'])
    expect(score.dynamicEvents[1]).toMatchObject({ position: musicalTime(5), measureNumber: '2', measureOnset: musicalTime(1), partId: 'P1', staff: 2, voice: '2' })
    expect(score.wedgeEvents[1]).toMatchObject({ position: musicalTime(5), measureNumber: '2', measureOnset: musicalTime(1), partId: 'P1', staff: 2, voice: '2', number: '1' })
    expect(score.pedalEvents[0]).toMatchObject({ type: 'start', staff: 2 })
    const firstNote = score.parts[0]?.measures[0]?.events[0]
    expect(firstNote).toMatchObject({ type: 'note', articulations: ['staccato', 'accent'], slurs: [{ type: 'start', number: '1' }] })
    expect(score.statistics).toMatchObject({ timeSignatureChangeCount: 1, keySignatureChangeCount: 1, dynamicEventCount: 2 })
  })

  it('uses actual pickup duration for following absolute positions', () => {
    const score = parseMusicXml(pickupFixture)
    expect(score.parts[0]?.measures[1]?.absoluteOnset).toEqual(musicalTime(1))
    expect(score.parts[0]?.measures[0]?.actualContentDuration).toEqual(musicalTime(1))
    expect(score.warnings).toContainEqual(expect.objectContaining({ code: 'MEASURE_DURATION_MISMATCH', severity: 'info', measureNumber: '0' }))
  })

  it('preserves grace and cue notes and warns about microtonal and out-of-range pitches', () => {
    const score = parseMusicXml(graceAndRangeFixture)
    const notes = score.parts[0]?.measures[0]?.events.filter((event) => event.type === 'note') ?? []
    expect(notes[0]).toMatchObject({ isGrace: true, duration: null, onset: musicalTime(0) })
    expect(notes[1]).toMatchObject({ isCue: true, onset: musicalTime(0), pitch: expect.objectContaining({ spelling: 'C10', midi: null, outsidePianoRange: true }) })
    expect(score.warnings.map((warning) => warning.code)).toEqual(expect.arrayContaining(['MICROTONAL_PITCH', 'OUTSIDE_PIANO_RANGE']))
  })

  it('produces deterministic IDs and ordering', () => {
    const first = parseMusicXml(contextAndDirectionsFixture)
    const second = parseMusicXml(contextAndDirectionsFixture)
    expect(second).toEqual(first)
    expect(second.parts[0]?.measures.flatMap((measure) => measure.events.map((event) => event.id))).toEqual(first.parts[0]?.measures.flatMap((measure) => measure.events.map((event) => event.id)))
  })

  it.each<[string, string, ScoreImportError['code']]>([
    ['invalid XML', '<score-partwise><part>', 'INVALID_XML'],
    ['wrong root', '<catalog/>', 'NOT_MUSICXML'],
    ['timewise score', '<score-timewise/>', 'UNSUPPORTED_SCORE_TIMEWISE'],
    ['DOCTYPE', '<!DOCTYPE score-partwise><score-partwise/>', 'DOCTYPE_NOT_ALLOWED'],
    ['missing divisions', scoreFixture('<measure number="1"><note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration></note></measure>'), 'MISSING_DIVISIONS'],
    ['zero duration', scoreFixture('<measure number="1"><attributes><divisions>1</divisions></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>0</duration></note></measure>'), 'INVALID_DURATION'],
  ])('returns a typed hard error for %s', (_label, xml, code) => {
    expect(() => parseMusicXml(xml)).toThrowError(expect.objectContaining<Partial<ScoreImportError>>({ code }))
  })

  it('rejects a backup that moves before the measure start', () => {
    const xml = scoreFixture('<measure number="1"><attributes><divisions>1</divisions></attributes><backup><duration>1</duration></backup></measure>')
    expect(() => parseMusicXml(xml)).toThrowError(expect.objectContaining<Partial<ScoreImportError>>({ code: 'INVALID_CURSOR', context: expect.objectContaining({ measureNumber: '1' }) }))
  })
})
