import { describe, expect, it } from 'vitest'
import { parseMusicXml } from '../../musicxml/parser'
import { chordFixture, contextAndDirectionsFixture, fractionalFixture, graceAndRangeFixture, pianoVoicesFixture, scoreFixture, tiesFixture } from '../../musicxml/__tests__/fixtures'
import { buildExpectedPerformancePlan } from '../builder'
import { ExpectedPerformanceBuildError } from '../types'

const options = { fallbackQuarterBpm: 100 }

describe('expected performance builder', () => {
  it('creates attacks, sounding notes, and exact onset groups while excluding rests', () => {
    const score = parseMusicXml(scoreFixture(`
      <measure number="1">
        <attributes><divisions>1</divisions><time><beats>2</beats><beat-type>4</beat-type></time></attributes>
        <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><staff>1</staff></note>
        <note><rest/><duration>1</duration><voice>1</voice><staff>1</staff></note>
      </measure>`))
    const plan = buildExpectedPerformancePlan(score, options)

    expect(plan.attacks).toHaveLength(1)
    expect(plan.soundingNotes).toHaveLength(1)
    expect(plan.onsetGroups).toHaveLength(1)
    expect(plan.statistics.requiredAttackCount).toBe(1)
    expect(plan.attacks[0]?.midi).toBe(60)
  })

  it('groups a chord by reduced exact score time while preserving staff provenance', () => {
    const plan = buildExpectedPerformancePlan(parseMusicXml(chordFixture), options)

    expect(plan.attacks).toHaveLength(4)
    expect(plan.onsetGroups).toHaveLength(2)
    expect(plan.onsetGroups[0]?.midiNotes).toEqual([60, 64, 67])
    expect(plan.onsetGroups[0]?.isMultiNote).toBe(true)
    expect(plan.attacks.slice(0, 3).map((attack) => attack.staff)).toEqual([1, 2, 1])
  })

  it('retains simultaneous attacks across independent piano voices and staves', () => {
    const plan = buildExpectedPerformancePlan(parseMusicXml(pianoVoicesFixture), options)

    expect(plan.onsetGroups[0]?.midiNotes).toEqual([72, 48])
    expect(plan.attacks.map((attack) => attack.voice)).toEqual(['1', '2', '2'])
    expect(plan.statistics.includedPartCount).toBe(1)
  })

  it('collapses a two-measure tie into one attack and one sounding span', () => {
    const plan = buildExpectedPerformancePlan(parseMusicXml(tiesFixture), options)

    expect(plan.attacks).toHaveLength(1)
    expect(plan.soundingNotes).toHaveLength(1)
    expect(plan.attacks[0]?.sourceNoteIds).toHaveLength(2)
    expect(plan.soundingNotes[0]?.duration).toEqual({ numerator: 2, denominator: 1 })
    expect(plan.warnings.map((warning) => warning.code)).not.toContain('AMBIGUOUS_TIE_CHAIN')
  })

  it('supports stop-and-start tie segments across three measures', () => {
    const xml = scoreFixture(`
      <measure number="1"><attributes><divisions>1</divisions><time><beats>1</beats><beat-type>4</beat-type></time></attributes>
        <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><tie type="start"/><voice>1</voice><staff>1</staff></note></measure>
      <measure number="2"><note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><tie type="stop"/><tie type="start"/><voice>1</voice><staff>1</staff></note></measure>
      <measure number="3"><note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><tie type="stop"/><voice>1</voice><staff>1</staff></note></measure>`)
    const plan = buildExpectedPerformancePlan(parseMusicXml(xml), options)

    expect(plan.attacks).toHaveLength(1)
    expect(plan.soundingNotes[0]?.sourceNoteIds).toHaveLength(3)
    expect(plan.soundingNotes[0]?.end).toEqual({ numerator: 3, denominator: 1 })
  })

  it('does not merge an ambiguous tie continuation with mismatched staff provenance', () => {
    const xml = scoreFixture(`
      <measure number="1"><attributes><divisions>1</divisions><time><beats>2</beats><beat-type>4</beat-type></time></attributes>
        <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><tie type="start"/><voice>1</voice><staff>1</staff></note>
        <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><tie type="stop"/><voice>1</voice><staff>2</staff></note></measure>`)
    const plan = buildExpectedPerformancePlan(parseMusicXml(xml), options)

    expect(plan.attacks).toHaveLength(2)
    expect(plan.warnings.filter((warning) => warning.code === 'AMBIGUOUS_TIE_CHAIN')).toHaveLength(2)
  })

  it('preserves grace and cue events without requiring attacks', () => {
    const plan = buildExpectedPerformancePlan(parseMusicXml(graceAndRangeFixture), options)

    expect(plan.attacks).toHaveLength(0)
    expect(plan.flexibleEvents.map((event) => event.kind)).toEqual(['grace', 'cue'])
    expect(plan.statistics.flexibleGraceCount).toBe(1)
    expect(plan.statistics.excludedCueCount).toBe(1)
    expect(plan.statistics.unsupportedPitchCount).toBe(2)
    expect(plan.statistics.outsideStandardPianoRangeCount).toBe(1)
    expect(plan.warnings.map((warning) => warning.code)).toEqual(expect.arrayContaining(['GRACE_TIMING_FLEXIBLE', 'CUE_NOTE_EXCLUDED', 'UNSUPPORTED_MIDI_PITCH', 'OUTSIDE_PIANO_RANGE']))
  })

  it('preserves an unsupported non-grace pitch as an excluded event', () => {
    const xml = scoreFixture(`
      <measure number="1"><attributes><divisions>1</divisions><time><beats>1</beats><beat-type>4</beat-type></time></attributes>
        <note><pitch><step>C</step><alter>0.5</alter><octave>4</octave></pitch><duration>1</duration><voice>1</voice><staff>1</staff></note></measure>`)
    const plan = buildExpectedPerformancePlan(parseMusicXml(xml), options)

    expect(plan.flexibleEvents.map((event) => event.kind)).toEqual(['unsupported-pitch'])
    expect(plan.statistics.unsupportedPitchCount).toBe(1)
    expect(plan.warnings.map((warning) => warning.code)).toContain('UNSUPPORTED_MIDI_PITCH')
  })

  it('keeps a valid MIDI pitch outside the standard 88-key range and flags it', () => {
    const xml = scoreFixture(`
      <measure number="1"><attributes><divisions>1</divisions><time><beats>1</beats><beat-type>4</beat-type></time></attributes>
        <note><pitch><step>C</step><octave>9</octave></pitch><duration>1</duration><voice>1</voice><staff>1</staff></note></measure>`)
    const plan = buildExpectedPerformancePlan(parseMusicXml(xml), options)

    expect(plan.attacks[0]).toMatchObject({ midi: 120, outsideStandardPianoRange: true })
    expect(plan.statistics.outsideStandardPianoRangeCount).toBe(1)
    expect(plan.warnings.map((warning) => warning.code)).toContain('OUTSIDE_PIANO_RANGE')
  })

  it('keeps fractional onset grouping exact and deterministic', () => {
    const score = parseMusicXml(fractionalFixture)
    const first = buildExpectedPerformancePlan(score, options)
    const second = buildExpectedPerformancePlan(score, options)

    expect(first.onsetGroups.map((group) => group.position)).toEqual([
      { numerator: 0, denominator: 1 },
      { numerator: 1, denominator: 3 },
      { numerator: 2, denominator: 3 },
    ])
    expect(first).toEqual(second)
  })

  it('preserves qualitative tempo directions as non-numeric plan context', () => {
    const plan = buildExpectedPerformancePlan(parseMusicXml(contextAndDirectionsFixture), options)

    expect(plan.tempoDirections.map((direction) => [direction.kind, direction.text, direction.position])).toEqual([
      ['ritardando', 'rit.', { numerator: 0, denominator: 1 }],
      ['a-tempo', 'a tempo, dim.', { numerator: 5, denominator: 1 }],
    ])
    expect(plan.tempoTimeline.points.every((point) => Number.isFinite(point.quarterBpm))).toBe(true)
  })

  it('groups mathematically equal 1/3 and 2/6 onsets without epsilon comparison', () => {
    const xml = scoreFixture(`
      <measure number="1"><attributes><divisions>6</divisions><time><beats>1</beats><beat-type>4</beat-type></time></attributes>
        <forward><duration>2</duration><voice>1</voice><staff>1</staff></forward>
        <note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><staff>1</staff></note>
        <backup><duration>2</duration></backup>
        <note><pitch><step>E</step><octave>4</octave></pitch><duration>2</duration><voice>2</voice><staff>2</staff></note></measure>`)
    const plan = buildExpectedPerformancePlan(parseMusicXml(xml), options)

    expect(plan.attacks.map((attack) => attack.onset)).toEqual([
      { numerator: 1, denominator: 3 },
      { numerator: 1, denominator: 3 },
    ])
    expect(plan.onsetGroups).toHaveLength(1)
    expect(plan.onsetGroups[0]?.midiNotes).toEqual([60, 64])
  })

  it('requires explicit selection for multi-part scores and validates selected IDs', () => {
    const xml = `<?xml version="1.0"?><score-partwise version="4.0"><part-list>
      <score-part id="P1"><part-name>Right</part-name></score-part><score-part id="P2"><part-name>Left</part-name></score-part>
      </part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration></note></measure></part>
      <part id="P2"><measure number="1"><attributes><divisions>1</divisions></attributes><note><pitch><step>C</step><octave>3</octave></pitch><duration>1</duration></note></measure></part></score-partwise>`
    const score = parseMusicXml(xml)

    expect(() => buildExpectedPerformancePlan(score, options)).toThrowError(ExpectedPerformanceBuildError)
    expect(() => buildExpectedPerformancePlan(score, { ...options, includedPartIds: ['missing'] })).toThrowError('not present')
    expect(buildExpectedPerformancePlan(score, { ...options, includedPartIds: ['P2'] }).attacks[0]?.midi).toBe(48)
  })
})
