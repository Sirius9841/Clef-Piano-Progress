import type { NoteGradingOptions } from './options'

export interface AssignmentTarget {
  readonly id: string
  readonly midi: number
}

export interface AssignmentAttack {
  readonly id: string
  readonly midi: number
  readonly sequence: number
}

export interface WrongPitchAssignmentPair {
  readonly targetId: string
  readonly attackId: string
  readonly expectedMidi: number
  readonly performedMidi: number
  readonly semitoneDelta: number
  readonly absoluteSemitoneDistance: number
}

export interface WrongPitchAssignmentResult {
  readonly pairs: readonly WrongPitchAssignmentPair[]
  readonly ambiguous: boolean
  readonly guarded: boolean
}

interface Solution {
  pairs: WrongPitchAssignmentPair[]
  pairCount: number
  distance: number
  signature: string
  optimalPathCount: number
}

function isAllowed(distance: number, options: NoteGradingOptions): boolean {
  return distance <= options.wrongPitchMaxSemitones || (options.allowWrongOctave && distance === options.wrongOctaveSemitones)
}

function compareSolution(left: Solution, right: Solution): number {
  if (left.pairCount !== right.pairCount) return right.pairCount - left.pairCount
  if (left.distance !== right.distance) return left.distance - right.distance
  return left.signature.localeCompare(right.signature)
}

/**
 * Exact subset DP maximizes accepted substitutions before minimizing total
 * semitone distance. Equal optima retain deterministic lexical ordering and
 * are surfaced as ambiguous rather than pretending stronger intent evidence.
 */
export function assignWrongPitches(
  targets: readonly AssignmentTarget[],
  attacks: readonly AssignmentAttack[],
  options: NoteGradingOptions,
): WrongPitchAssignmentResult {
  if (targets.length === 0 || attacks.length === 0) return { pairs: [], ambiguous: false, guarded: false }
  if (targets.length > options.maxWrongPitchAssignmentSize || attacks.length > options.maxWrongPitchAssignmentSize) {
    return { pairs: [], ambiguous: false, guarded: true }
  }

  const orderedAttacks = [...attacks].sort((left, right) => left.sequence - right.sequence || left.id.localeCompare(right.id))
  const memo = new Map<string, Solution>()
  const solve = (targetIndex: number, usedMask: number): Solution => {
    if (targetIndex >= targets.length) return { pairs: [], pairCount: 0, distance: 0, signature: '', optimalPathCount: 1 }
    const key = `${targetIndex}:${usedMask}`
    const cached = memo.get(key)
    if (cached) return cached
    const target = targets[targetIndex]!
    const suffix = solve(targetIndex + 1, usedMask)
    const candidates: Solution[] = [{ ...suffix, pairs: [...suffix.pairs], signature: `x|${suffix.signature}` }]
    orderedAttacks.forEach((attack, attackIndex) => {
      if ((usedMask & (1 << attackIndex)) !== 0) return
      const delta = attack.midi - target.midi
      const distance = Math.abs(delta)
      if (!isAllowed(distance, options)) return
      const next = solve(targetIndex + 1, usedMask | (1 << attackIndex))
      candidates.push({
        pairs: [{ targetId: target.id, attackId: attack.id, expectedMidi: target.midi, performedMidi: attack.midi, semitoneDelta: delta, absoluteSemitoneDistance: distance }, ...next.pairs],
        pairCount: next.pairCount + 1,
        distance: next.distance + distance,
        signature: `${attackIndex.toString().padStart(2, '0')}|${next.signature}`,
        optimalPathCount: next.optimalPathCount,
      })
    })
    candidates.sort(compareSolution)
    const best = candidates[0]!
    const equalMetric = candidates.filter((candidate) => candidate.pairCount === best.pairCount && candidate.distance === best.distance)
    const optimalPathCount = Math.min(2, equalMetric.reduce((sum, candidate) => sum + candidate.optimalPathCount, 0))
    const result = { ...best, optimalPathCount }
    memo.set(key, result)
    return result
  }

  const solution = solve(0, 0)
  return { pairs: solution.pairs, ambiguous: solution.optimalPathCount > 1, guarded: false }
}
