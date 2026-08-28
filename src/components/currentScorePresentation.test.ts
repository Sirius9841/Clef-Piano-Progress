import { describe, expect, it } from 'vitest'
import type { PersistedArrangement, RepertoireListItem } from '../features/persistence/types'
import { attemptFixture } from '../features/practice-planning/__tests__/fixtures'
import { boundedRecentRepertoire, currentInterpretationStatus, currentScorePersonalBestEvents, latestAttemptForScoreVersion } from './currentScorePresentation'

const olderCurrent = attemptFixture('current', { arrangementId: 'arrangement-1', scoreVersionId: 'score-v2', performedAt: '2026-08-20T12:00:00.000Z' }).summary
const newerHistorical = attemptFixture('historical', { arrangementId: 'arrangement-1', scoreVersionId: 'score-v1', performedAt: '2026-08-27T12:00:00.000Z' }).summary

describe('current ScoreVersion presentation boundaries', () => {
  it('never borrows a newer result from an older ScoreVersion', () => {
    expect(latestAttemptForScoreVersion([newerHistorical, olderCurrent], 'score-v2')?.id).toBe('current')
    expect(latestAttemptForScoreVersion([newerHistorical], 'score-v2')).toBeNull()
  })

  it('filters personal-best events through exact attempt identity', () => {
    const events = [
      { attemptId: 'historical', metric: 'notes' as const, kind: 'first-full-result' as const, value: .95, performedAt: newerHistorical.performedAt, previousValue: null },
      { attemptId: 'current', metric: 'rhythm' as const, kind: 'first-full-result' as const, value: .8, performedAt: olderCurrent.performedAt, previousValue: null },
    ]
    expect(currentScorePersonalBestEvents(events, [newerHistorical, olderCurrent], 'arrangement-1', 'score-v2').map((event) => event.attemptId)).toEqual(['current'])
  })

  it('limits rich cards while leaving the filtered ledger population intact', () => {
    const items = Array.from({ length: 5 }, (_, index) => ({ arrangement: { id: `arr-${index}` } })) as unknown as readonly RepertoireListItem[]
    expect(boundedRecentRepertoire(items)).toHaveLength(3)
    expect(items).toHaveLength(5)
  })

  it('reports voicing and reference status only for the exact current ScoreVersion', () => {
    const profile = { id: 'profile', scoreVersionId: 'score-v2', regions: [], updatedAt: '2026-08-26T00:00:00.000Z' }
    const arrangement = {
      id: 'arrangement-1', workId: 'work-1', name: 'Solo', difficulty: 'Intermediate', source: 'user-imported', includedPartIds: ['P1'],
      createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
      analysisPreferences: { voicingByScoreVersion: { 'score-v2': profile }, referenceByScoreVersion: { 'score-v2': 'current' } },
    } satisfies PersistedArrangement
    const status = currentInterpretationStatus(arrangement, 'score-v2', [newerHistorical, olderCurrent])
    expect(status.voicingProfile).toBe(profile)
    expect(status.referenceAttempt?.id).toBe('current')

    const unconfigured = currentInterpretationStatus({ ...arrangement, analysisPreferences: undefined }, 'score-v2', [olderCurrent])
    expect(unconfigured.voicingProfile).toBeNull()
    expect(unconfigured.referenceAttempt).toBeNull()

    const staleReference = currentInterpretationStatus({ ...arrangement, analysisPreferences: { voicingByScoreVersion: {}, referenceByScoreVersion: { 'score-v2': 'historical' } } }, 'score-v2', [newerHistorical])
    expect(staleReference.referenceAttemptId).toBe('historical')
    expect(staleReference.referenceAttempt).toBeNull()
  })
})
