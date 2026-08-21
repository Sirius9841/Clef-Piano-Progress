import { describe, expect, it } from 'vitest'
import { localCalendarDateKey } from '../localCalendar'

describe('localCalendarDateKey', () => {
  it('uses the requested local calendar rather than the UTC ISO date', () => {
    expect(localCalendarDateKey('2026-01-01T00:30:00.000Z', 'America/Los_Angeles')).toBe('2025-12-31')
    expect(localCalendarDateKey('2026-01-01T00:30:00.000Z', 'Asia/Tokyo')).toBe('2026-01-01')
  })

  it('is deterministic across daylight-saving boundaries', () => {
    expect(localCalendarDateKey('2026-03-08T09:30:00.000Z', 'America/Los_Angeles')).toBe('2026-03-08')
    expect(localCalendarDateKey('2026-03-08T10:30:00.000Z', 'America/Los_Angeles')).toBe('2026-03-08')
  })
})
