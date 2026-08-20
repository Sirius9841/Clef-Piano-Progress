import type { AlignmentOptions } from './options'
import type { AttackCorrespondence, ExpectedAlignmentGroup, PerformedOnsetGroup, PitchComparison } from './types'

function pitchCounts(pitches: readonly number[]): Map<number, number> {
  const counts = new Map<number, number>()
  for (const pitch of pitches) counts.set(pitch, (counts.get(pitch) ?? 0) + 1)
  return counts
}

export function comparePitchMultisets(
  expected: readonly number[],
  performed: readonly number[],
  options: AlignmentOptions,
): PitchComparison {
  const expectedCounts = pitchCounts(expected)
  const performedCounts = pitchCounts(performed)
  let exactPitchCount = 0
  for (const [pitch, expectedCount] of expectedCounts) exactPitchCount += Math.min(expectedCount, performedCounts.get(pitch) ?? 0)
  const unpairedExpectedCount = expected.length - exactPitchCount
  const unpairedPerformedCount = performed.length - exactPitchCount
  return {
    exactPitchCount,
    unpairedExpectedCount,
    unpairedPerformedCount,
    cost: unpairedExpectedCount * options.unpairedExpectedPitchCost + unpairedPerformedCount * options.unpairedPerformedPitchCost,
  }
}

export function pairGroupAttacks(expected: ExpectedAlignmentGroup, performed: PerformedOnsetGroup): AttackCorrespondence {
  const available = new Map<number, number[]>()
  performed.attacks.forEach((attack, index) => {
    const queue = available.get(attack.midi)
    if (queue) queue.push(index)
    else available.set(attack.midi, [index])
  })
  const usedPerformed = new Set<number>()
  const pairs = []
  const unpairedExpectedAttackIds: string[] = []
  for (const attack of expected.attacks) {
    const performedIndex = available.get(attack.midi)?.shift()
    if (performedIndex === undefined) {
      unpairedExpectedAttackIds.push(attack.id)
      continue
    }
    usedPerformed.add(performedIndex)
    pairs.push({ expectedAttackId: attack.id, performedAttackId: performed.attacks[performedIndex]!.id, midi: attack.midi })
  }
  return {
    pairs,
    unpairedExpectedAttackIds,
    unpairedPerformedAttackIds: performed.attacks.filter((_, index) => !usedPerformed.has(index)).map((attack) => attack.id),
  }
}

export function timingResidualCost(residualMs: number, options: AlignmentOptions): number {
  return Math.min(Math.abs(residualMs) / options.timingResidualScaleMs, 1) * options.timingCostWeight
}
