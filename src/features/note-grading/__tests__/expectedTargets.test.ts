import { describe, expect, it } from 'vitest'
import { buildExpectedPerformancePlan } from '../../expected-performance/builder'
import { parseMusicXml } from '../../musicxml/parser'
import { graceAndRangeFixture, scoreFixture, tiesFixture } from '../../musicxml/__tests__/fixtures'
import { makePlan } from '../../alignment/__tests__/fixtures'
import { deriveExpectedKeyTargets } from '../expectedTargets'
import { resolveNoteGradingOptions } from '../options'

describe('physical expected key targets', () => {
  it('collapses simultaneous duplicate MIDI pitches while preserving notation provenance', () => {
    const plan = makePlan([[60, 60, 64]])
    const result = deriveExpectedKeyTargets(plan, resolveNoteGradingOptions())

    expect(result.targets).toHaveLength(2)
    expect(result.targets[0]).toMatchObject({ midi: 60, sourceExpectedAttackIds: ['expected-attack:0:0', 'expected-attack:0:1'] })
    expect(result.targets[0]?.sourceNoteIds).toEqual(['source-note:0:0', 'source-note:0:1'])
    expect(result.targets[0]?.staffs).toEqual([1, 2])
    expect(result.targets[0]?.voices).toEqual(['1', '2'])
  })

  it('uses deterministic target IDs across repeated derivation', () => {
    const plan = makePlan([[60, 64], [67]])
    const options = resolveNoteGradingOptions()
    expect(deriveExpectedKeyTargets(plan, options)).toEqual(deriveExpectedKeyTargets(plan, options))
  })

  it('excludes outside-standard-range physical targets by default and can include them explicitly', () => {
    const plan = makePlan([[20], [109]])
    const excluded = deriveExpectedKeyTargets(plan, resolveNoteGradingOptions())
    const included = deriveExpectedKeyTargets(plan, resolveNoteGradingOptions({ excludeOutsideStandardPianoRange: false }))

    expect(excluded.targets.every((target) => target.eligibility === 'excluded')).toBe(true)
    expect(excluded.targets.map((target) => target.exclusionReason)).toEqual(['OUTSIDE_STANDARD_PIANO_RANGE', 'OUTSIDE_STANDARD_PIANO_RANGE'])
    expect(included.targets.every((target) => target.eligibility === 'gradeable')).toBe(true)
  })

  it('preserves grace, cue, and unsupported-pitch exclusions outside fixed targets', () => {
    const plan = buildExpectedPerformancePlan(parseMusicXml(graceAndRangeFixture), { fallbackQuarterBpm: 120 })
    const result = deriveExpectedKeyTargets(plan, resolveNoteGradingOptions())

    expect(result.targets).toEqual([])
    expect(result.exclusions.map((exclusion) => exclusion.reason)).toEqual(['GRACE_TIMING_FLEXIBLE', 'CUE_EXCLUDED'])
    expect(result.exclusions.map((exclusion) => exclusion.sourceNoteId)).toEqual(plan.flexibleEvents.map((event) => event.sourceNoteId))
  })

  it('preserves a normal unsupported microtonal event with an explicit exclusion reason', () => {
    const xml = scoreFixture('<measure number="1"><attributes><divisions>1</divisions></attributes><note><pitch><step>D</step><alter>0.5</alter><octave>4</octave></pitch><duration>1</duration><voice>1</voice><staff>1</staff></note></measure>')
    const plan = buildExpectedPerformancePlan(parseMusicXml(xml), { fallbackQuarterBpm: 120 })
    const result = deriveExpectedKeyTargets(plan, resolveNoteGradingOptions())
    expect(result.targets).toEqual([])
    expect(result.exclusions).toHaveLength(1)
    expect(result.exclusions[0]).toMatchObject({ reason: 'UNSUPPORTED_MIDI_PITCH', midi: null })
  })

  it('creates one physical target for a multi-measure tied note', () => {
    const plan = buildExpectedPerformancePlan(parseMusicXml(tiesFixture), { fallbackQuarterBpm: 120 })
    const result = deriveExpectedKeyTargets(plan, resolveNoteGradingOptions())

    expect(plan.attacks).toHaveLength(1)
    expect(plan.attacks[0]?.sourceNoteIds).toHaveLength(2)
    expect(result.targets).toHaveLength(1)
    expect(result.targets[0]?.sourceNoteIds).toHaveLength(2)
  })
})
