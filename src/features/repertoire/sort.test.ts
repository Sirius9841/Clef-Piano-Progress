import { describe, expect, it } from 'vitest'
import type { RepertoireStatus } from '../../domain/music'
import type { RepertoireListItem } from '../persistence/types'
import { sortRepertoireItems, type RepertoireSort } from './sort'

function item(id: string, title: string, status: RepertoireStatus, addedAt: string, lastPracticedAt: string | null): RepertoireListItem {
  return {
    work: { id: `work-${id}`, title, composer: 'Composer', createdAt: addedAt, updatedAt: addedAt },
    arrangement: { id, workId: `work-${id}`, name: 'Piano solo', difficulty: 'Intermediate', source: 'user-imported', includedPartIds: ['P1'], createdAt: addedAt, updatedAt: addedAt },
    scoreVersion: { id: `score-${id}`, arrangementId: id, version: 1, format: 'musicxml', createdAt: addedAt, sourceFileName: `${id}.musicxml`, sourceBytes: 1, uncompressedBytes: 1, contentHash: id, canonicalMusicXml: '<score-partwise/>', normalizedScoreId: id, parserVersion: 'test', includedPartIds: ['P1'] },
    repertoire: { id: `rep-${id}`, arrangementId: id, status, addedAt, updatedAt: addedAt },
    latestAttempt: null,
    sessionCount: 0,
    totalPracticeMs: 0,
    lastPracticedAt,
  }
}

describe('Repertoire sorting', () => {
  const items = [
    item('b', 'Beta', 'Completed', '2026-01-02T00:00:00.000Z', null),
    item('a', 'Alpha', 'Practicing', '2026-01-01T00:00:00.000Z', '2026-01-04T00:00:00.000Z'),
    item('c', 'Gamma', 'Learning', '2026-01-03T00:00:00.000Z', '2026-01-02T00:00:00.000Z'),
  ]

  it.each<[RepertoireSort, readonly string[]]>([
    ['recently-practiced', ['a', 'b', 'c']],
    ['date-added', ['c', 'b', 'a']],
    ['title', ['a', 'b', 'c']],
    ['status', ['c', 'a', 'b']],
  ])('sorts %s deterministically', (sort, expected) => {
    expect(sortRepertoireItems(items, sort).map((value) => value.arrangement.id)).toEqual(expected)
    expect(sortRepertoireItems([...items].reverse(), sort).map((value) => value.arrangement.id)).toEqual(expected)
  })
})
