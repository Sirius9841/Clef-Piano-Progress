import { comparePitchMultisets, timingResidualCost } from './costs'
import type { AlignmentOptions } from './options'
import type { AlignmentTimeTransform, ExpectedAlignmentGroup, MatchCostComponents, PerformedOnsetGroup } from './types'

const DIRECTION_MATCH = 1
const DIRECTION_EXPECTED_ONLY = 2
const DIRECTION_PERFORMED_ONLY = 3
const COST_EPSILON = 1e-9

export interface SequenceAlignmentStep {
  readonly kind: 'correspondence' | 'expected-only' | 'performed-only'
  readonly expectedIndex?: number
  readonly performedIndex?: number
  readonly cost?: MatchCostComponents
}

export interface SequenceAlignmentResult {
  readonly cost: number
  readonly steps: readonly SequenceAlignmentStep[]
  readonly matrixCellCount: number
}

function matchCost(
  expected: ExpectedAlignmentGroup,
  performed: PerformedOnsetGroup,
  options: AlignmentOptions,
  transform: AlignmentTimeTransform | null,
): MatchCostComponents {
  const pitch = comparePitchMultisets(expected.pitches, performed.pitches, options).cost * options.pitchCostWeight
  const timing = transform
    ? timingResidualCost(performed.representativeMs - (transform.offsetMs + transform.scale * expected.referenceMs), options)
    : 0
  return { pitchCost: pitch, timingCost: timing, totalCost: pitch + timing }
}

/**
 * Each DP cell chooses a diagonal correspondence, an expected-only step, or a
 * performed-only step. Backtracking therefore preserves monotonic order. Exact
 * ties prefer correspondence, then expected-only, then performed-only.
 */
export function alignGroupSequences(
  expectedGroups: readonly ExpectedAlignmentGroup[],
  performedGroups: readonly PerformedOnsetGroup[],
  options: AlignmentOptions,
  transform: AlignmentTimeTransform | null,
): SequenceAlignmentResult {
  const width = performedGroups.length + 1
  const height = expectedGroups.length + 1
  const matrixCellCount = width * height
  if (matrixCellCount > options.maxMatrixCells) throw new RangeError(`Alignment requires ${matrixCellCount} matrix cells, exceeding the configured ${options.maxMatrixCells} limit.`)
  const costs = new Float64Array(matrixCellCount)
  const directions = new Uint8Array(matrixCellCount)

  for (let expectedIndex = 1; expectedIndex < height; expectedIndex += 1) {
    const index = expectedIndex * width
    costs[index] = expectedIndex * options.expectedSkipCost
    directions[index] = DIRECTION_EXPECTED_ONLY
  }
  for (let performedIndex = 1; performedIndex < width; performedIndex += 1) {
    costs[performedIndex] = performedIndex * options.performedSkipCost
    directions[performedIndex] = DIRECTION_PERFORMED_ONLY
  }

  for (let expectedIndex = 1; expectedIndex < height; expectedIndex += 1) {
    for (let performedIndex = 1; performedIndex < width; performedIndex += 1) {
      const index = expectedIndex * width + performedIndex
      const components = matchCost(expectedGroups[expectedIndex - 1]!, performedGroups[performedIndex - 1]!, options, transform)
      let bestCost = costs[(expectedIndex - 1) * width + performedIndex - 1]! + components.totalCost
      let direction = DIRECTION_MATCH
      const expectedOnlyCost = costs[(expectedIndex - 1) * width + performedIndex]! + options.expectedSkipCost
      if (expectedOnlyCost < bestCost - COST_EPSILON) {
        bestCost = expectedOnlyCost
        direction = DIRECTION_EXPECTED_ONLY
      }
      const performedOnlyCost = costs[expectedIndex * width + performedIndex - 1]! + options.performedSkipCost
      if (performedOnlyCost < bestCost - COST_EPSILON) {
        bestCost = performedOnlyCost
        direction = DIRECTION_PERFORMED_ONLY
      }
      costs[index] = bestCost
      directions[index] = direction
    }
  }

  const reversed: SequenceAlignmentStep[] = []
  let expectedIndex = expectedGroups.length
  let performedIndex = performedGroups.length
  while (expectedIndex > 0 || performedIndex > 0) {
    const direction = directions[expectedIndex * width + performedIndex]
    if (direction === DIRECTION_MATCH) {
      const expected = expectedGroups[expectedIndex - 1]!
      const performed = performedGroups[performedIndex - 1]!
      reversed.push({ kind: 'correspondence', expectedIndex: expectedIndex - 1, performedIndex: performedIndex - 1, cost: matchCost(expected, performed, options, transform) })
      expectedIndex -= 1
      performedIndex -= 1
    } else if (direction === DIRECTION_EXPECTED_ONLY) {
      reversed.push({ kind: 'expected-only', expectedIndex: expectedIndex - 1 })
      expectedIndex -= 1
    } else {
      reversed.push({ kind: 'performed-only', performedIndex: performedIndex - 1 })
      performedIndex -= 1
    }
  }
  return { cost: costs[costs.length - 1]!, steps: reversed.reverse(), matrixCellCount }
}
