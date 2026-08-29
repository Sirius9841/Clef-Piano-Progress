import { describe, expect, it } from 'vitest'
import type { MatchedTakeRegion } from '../../alignment/types'
import { buildTakePositionView } from '../takePosition'

const region: MatchedTakeRegion = {
  expectedStartIndex: 12, expectedEndIndex: 27, expectedStartGroupId: 'expected:12', expectedEndGroupId: 'expected:27',
  performedStartIndex: 0, performedEndIndex: 14, performedStartGroupId: 'performed:0', performedEndGroupId: 'performed:14',
  measureIndices: [4, 5, 6, 7], measureNumbers: ['5', '6', '7', '8'], displayRange: 'M5–M8', confidence: 'limited',
}

describe('buildTakePositionView', () => {
  it('exposes matched range and current position without correspondence internals', () => {
    const view = buildTakePositionView(region, { measureIndex: 6, performedGroupIndex: 9, performedGroupId: 'performed:9' })
    expect(view).toMatchObject({
      matchedMeasureRange: { startIndex: 4, endIndex: 7, indices: [4, 5, 6, 7], displayRange: 'M5–M8' },
      expectedGroupRange: { startIndex: 12, endIndex: 27, startGroupId: 'expected:12', endGroupId: 'expected:27' },
      performedGroupRange: { startIndex: 0, endIndex: 14, startGroupId: 'performed:0', endGroupId: 'performed:14' },
      currentMeasureIndex: 6, currentPerformedGroupIndex: 9, currentPerformedGroupId: 'performed:9',
    })
    expect(Object.isFrozen(view)).toBe(true)
    expect(Object.isFrozen(view.matchedMeasureRange.indices)).toBe(true)
  })
})
