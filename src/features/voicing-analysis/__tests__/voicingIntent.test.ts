import { describe, expect, it } from 'vitest'
import { validateVoicingIntentProfile } from '../voicingIntent'

const lanes = [{ id: 'a', ambiguous: false }, { id: 'b', ambiguous: false }, { id: 'unknown', ambiguous: true }]
function profile(regions: Array<{ id: string; startMeasureIndex: number; endMeasureIndex: number; foregroundLaneIds: string[]; supportLaneIds: string[] }>) { return { id: 'intent', scoreVersionId: 'score-v1', updatedAt: '2026-08-25T12:00:00.000Z', regions } }
describe('Voicing intent validation', () => {
  it('accepts non-overlapping regions and rejects overlap, stale score identity, and invalid lanes', () => {
    expect(validateVoicingIntentProfile(profile([{ id: 'r1', startMeasureIndex: 0, endMeasureIndex: 3, foregroundLaneIds: ['a'], supportLaneIds: ['b'] }]), lanes, 'score-v1')).toEqual([])
    expect(validateVoicingIntentProfile(profile([{ id: 'r1', startMeasureIndex: 0, endMeasureIndex: 3, foregroundLaneIds: ['a'], supportLaneIds: ['a'] }]), lanes, 'score-v1').join(' ')).toContain('both foreground and support')
    expect(validateVoicingIntentProfile(profile([{ id: 'r1', startMeasureIndex: 2, endMeasureIndex: 1, foregroundLaneIds: ['a'], supportLaneIds: ['missing'] }]), lanes, 'score-v2').join(' ')).toMatch(/different ScoreVersion|invalid measure|unavailable score lane/)
    expect(validateVoicingIntentProfile(profile([{ id: 'r1', startMeasureIndex: 0, endMeasureIndex: 2, foregroundLaneIds: ['a'], supportLaneIds: ['b'] }, { id: 'r2', startMeasureIndex: 2, endMeasureIndex: 4, foregroundLaneIds: ['a'], supportLaneIds: ['b'] }]), lanes, 'score-v1').join(' ')).toContain('overlaps')
    expect(validateVoicingIntentProfile(profile([]), lanes, 'score-v1').join(' ')).toContain('at least one configured region')
  })
})
