import { describe, expect, it } from 'vitest'
import { comparePitchMultisets, pairGroupAttacks, timingResidualCost } from '../costs'
import { deriveExpectedAlignmentGroups } from '../expectedGroups'
import { DEFAULT_ALIGNMENT_OPTIONS, resolveAlignmentOptions } from '../options'
import { clusterPerformedOnsets, derivePerformedAttacks } from '../performedGroups'
import { makePlan, makeRecording } from './fixtures'

describe('performed onset grouping', () => {
  it('clusters a normal and rolled chord while preserving spread and sequence', () => {
    const recording = makeRecording([
      { midi: 60, ms: 1_000 }, { midi: 64, ms: 1_030 }, { midi: 67, ms: 1_060 },
    ])
    const result = clusterPerformedOnsets(recording.id, derivePerformedAttacks(recording), DEFAULT_ALIGNMENT_OPTIONS)

    expect(result.groups).toHaveLength(1)
    expect(result.groups[0]).toMatchObject({ startMs: 1_000, endMs: 1_060, representativeMs: 1_030, spreadMs: 60, pitches: [60, 64, 67] })
    expect(result.groups[0]?.attacks.map((attack) => attack.sequence)).toEqual([0, 1, 2])
  })

  it('splits wide arpeggiation using both local-gap and total-spread limits', () => {
    const options = resolveAlignmentOptions({ performedGroupGapMs: 40, performedGroupMaxSpreadMs: 70, performedGroupWarningSpreadMs: 60 })
    const recording = makeRecording([
      { midi: 60, ms: 0 }, { midi: 64, ms: 35 }, { midi: 67, ms: 75 }, { midi: 72, ms: 130 },
    ])
    const result = clusterPerformedOnsets(recording.id, derivePerformedAttacks(recording), options)

    expect(result.groups.map((group) => group.pitches)).toEqual([[60, 64], [67], [72]])
    expect(result.groups.flatMap((group) => group.attacks)).toHaveLength(4)
  })

  it('never collapses repeated same-key attacks, including identical timestamps', () => {
    const recording = makeRecording([
      { midi: 60, ms: 0 }, { midi: 60, ms: 0 }, { midi: 60, ms: 40 }, { midi: 60, ms: 80 },
    ])
    const result = clusterPerformedOnsets(recording.id, derivePerformedAttacks(recording), DEFAULT_ALIGNMENT_OPTIONS)

    expect(result.groups).toHaveLength(4)
    expect(result.groups.map((group) => group.attacks[0]?.sequence)).toEqual([0, 1, 2, 3])
  })

  it('groups different pitches with identical timestamps in arrival order', () => {
    const recording = makeRecording([{ midi: 67, ms: 50 }, { midi: 60, ms: 50 }, { midi: 64, ms: 50 }])
    const result = clusterPerformedOnsets(recording.id, derivePerformedAttacks(recording), DEFAULT_ALIGNMENT_OPTIONS)
    expect(result.groups[0]?.pitches).toEqual([67, 60, 64])
  })
})

describe('alignment costs and attack pairing', () => {
  it('compares pitch multisets without discarding multiplicity', () => {
    expect(comparePitchMultisets([60, 60, 64], [60, 64, 67], DEFAULT_ALIGNMENT_OPTIONS)).toEqual({
      exactPitchCount: 2,
      unpairedExpectedCount: 1,
      unpairedPerformedCount: 1,
      cost: 1.9,
    })
  })

  it('pairs exact duplicate pitches FIFO and reports both unpaired sides', () => {
    const expected = deriveExpectedAlignmentGroups(makePlan([[60, 60, 64]]), 1).groups[0]!
    const recording = makeRecording([{ midi: 60, ms: 0 }, { midi: 60, ms: 0 }, { midi: 67, ms: 0 }])
    const performed = {
      ...clusterPerformedOnsets(recording.id, derivePerformedAttacks(recording), resolveAlignmentOptions({ performedGroupGapMs: 45 })).groups[0]!,
      attacks: derivePerformedAttacks(recording),
      pitches: [60, 60, 67],
    }
    const paired = pairGroupAttacks(expected, performed)

    expect(paired.pairs.map((pair) => pair.midi)).toEqual([60, 60])
    expect(paired.unpairedExpectedAttackIds).toEqual(['expected-attack:0:2'])
    expect(paired.unpairedPerformedAttackIds).toEqual(['performed-attack:recording:test:2'])
  })

  it('bounds timing cost so a single extreme residual cannot dominate pitch structure', () => {
    expect(timingResidualCost(0, DEFAULT_ALIGNMENT_OPTIONS)).toBe(0)
    expect(timingResidualCost(90, DEFAULT_ALIGNMENT_OPTIONS)).toBeCloseTo(0.175)
    expect(timingResidualCost(50_000, DEFAULT_ALIGNMENT_OPTIONS)).toBe(DEFAULT_ALIGNMENT_OPTIONS.timingCostWeight)
  })

  it('rejects invalid centralized options', () => {
    expect(() => resolveAlignmentOptions({ maxTimeScale: 0.2 })).toThrow(RangeError)
    expect(() => resolveAlignmentOptions({ performedGroupWarningSpreadMs: 100 })).toThrow(RangeError)
  })
})
