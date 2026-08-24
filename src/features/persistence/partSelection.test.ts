import { describe, expect, it } from 'vitest'
import { canonicalizePartSelection, exactPartOrder, samePartSelection } from './partSelection'

describe('score part-selection identity', () => {
  it('canonicalizes duplicate and reordered IDs deterministically', () => {
    expect(canonicalizePartSelection(['P2', 'P1', 'P2'])).toEqual(['P1', 'P2'])
    expect(samePartSelection(['P2', 'P1', 'P1'], ['P1', 'P2'])).toBe(true)
    expect(samePartSelection(['P1'], ['P1', 'P2'])).toBe(false)
    expect(exactPartOrder(['P2', 'P1'], ['P1', 'P2'])).toBe(false)
  })
})
