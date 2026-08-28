import { describe, expect, it } from 'vitest'
import { boundedHistoryWindow, nextHistoryWindowSize } from './boundedHistory'

describe('bounded historical rendering', () => {
  it('bounds the initial DOM population while incremental windows make every record reachable', () => {
    const records = Array.from({ length: 137 }, (_, index) => `attempt-${index}`)
    let visible = 50
    expect(boundedHistoryWindow(records, visible)).toHaveLength(50)
    visible = nextHistoryWindowSize(visible, records.length, 50)
    expect(boundedHistoryWindow(records, visible)).toHaveLength(100)
    visible = nextHistoryWindowSize(visible, records.length, 50)
    expect(boundedHistoryWindow(records, visible)).toEqual(records)
  })
})
