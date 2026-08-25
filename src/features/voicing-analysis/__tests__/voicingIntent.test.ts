import { describe, expect, it } from 'vitest'
import { sameVoicingIntentMeaning, validateVoicingIntentProfile } from '../voicingIntent'
import type { VoicingIntentProfile } from '../types'

function profile(overrides: Partial<VoicingIntentProfile> = {}): VoicingIntentProfile {
  return { id: 'profile:one', scoreVersionId: 'score-version', updatedAt: '2026-08-25T12:00:00.000Z', regions: [
    { id: 'region:b', startMeasureIndex: 4, endMeasureIndex: 7, foregroundLaneIds: ['lane:b', 'lane:a'], supportLaneIds: ['lane:d', 'lane:c'] },
    { id: 'region:a', startMeasureIndex: 0, endMeasureIndex: 3, foregroundLaneIds: ['lane:a'], supportLaneIds: ['lane:c'] },
  ], ...overrides }
}

describe('sameVoicingIntentMeaning', () => {
  it('ignores storage identity, timestamps, region identity, ordering, and lane-set ordering', () => {
    const equivalent = profile({ id: 'profile:two', updatedAt: '2027-01-01T00:00:00.000Z', regions: [
      { id: 'renamed:a', startMeasureIndex: 0, endMeasureIndex: 3, foregroundLaneIds: ['lane:a'], supportLaneIds: ['lane:c'] },
      { id: 'renamed:b', startMeasureIndex: 4, endMeasureIndex: 7, foregroundLaneIds: ['lane:a', 'lane:b', 'lane:a'], supportLaneIds: ['lane:c', 'lane:d'] },
    ] })
    expect(sameVoicingIntentMeaning(profile(), equivalent)).toBe(true)
  })

  it('detects musical-region, lane-role, ScoreVersion, and null-intent changes', () => {
    expect(sameVoicingIntentMeaning(profile(), profile({ scoreVersionId: 'other' }))).toBe(false)
    expect(sameVoicingIntentMeaning(profile(), profile({ regions: [{ ...profile().regions[0]!, startMeasureIndex: 5 }] }))).toBe(false)
    expect(sameVoicingIntentMeaning(profile(), profile({ regions: [{ ...profile().regions[0]!, foregroundLaneIds: ['lane:c'], supportLaneIds: ['lane:a'] }] }))).toBe(false)
    expect(sameVoicingIntentMeaning(profile(), null)).toBe(false)
    expect(sameVoicingIntentMeaning(null, null)).toBe(true)
  })
})

const lanes = [{ id: 'a', ambiguous: false }, { id: 'b', ambiguous: false }, { id: 'unknown', ambiguous: true }]
function validationProfile(regions: Array<{ id: string; startMeasureIndex: number; endMeasureIndex: number; foregroundLaneIds: string[]; supportLaneIds: string[] }>) { return { id: 'intent', scoreVersionId: 'score-v1', updatedAt: '2026-08-25T12:00:00.000Z', regions } }
describe('Voicing intent validation', () => {
  it('accepts non-overlapping regions and rejects overlap, stale score identity, and invalid lanes', () => {
    expect(validateVoicingIntentProfile(validationProfile([{ id: 'r1', startMeasureIndex: 0, endMeasureIndex: 3, foregroundLaneIds: ['a'], supportLaneIds: ['b'] }]), lanes, 'score-v1')).toEqual([])
    expect(validateVoicingIntentProfile(validationProfile([{ id: 'r1', startMeasureIndex: 0, endMeasureIndex: 3, foregroundLaneIds: ['a'], supportLaneIds: ['a'] }]), lanes, 'score-v1').join(' ')).toContain('both foreground and support')
    expect(validateVoicingIntentProfile(validationProfile([{ id: 'r1', startMeasureIndex: 2, endMeasureIndex: 1, foregroundLaneIds: ['a'], supportLaneIds: ['missing'] }]), lanes, 'score-v2').join(' ')).toMatch(/different ScoreVersion|invalid measure|unavailable score lane/)
    expect(validateVoicingIntentProfile(validationProfile([{ id: 'r1', startMeasureIndex: 0, endMeasureIndex: 2, foregroundLaneIds: ['a'], supportLaneIds: ['b'] }, { id: 'r2', startMeasureIndex: 2, endMeasureIndex: 4, foregroundLaneIds: ['a'], supportLaneIds: ['b'] }]), lanes, 'score-v1').join(' ')).toContain('overlaps')
    expect(validateVoicingIntentProfile(validationProfile([]), lanes, 'score-v1').join(' ')).toContain('at least one configured region')
  })
})
