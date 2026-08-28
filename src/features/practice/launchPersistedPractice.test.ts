import { describe, expect, it, vi } from 'vitest'
import { parseMusicXml } from '../musicxml/parser'
import type { PersistedArrangement, PersistedScoreVersion } from '../persistence/types'
import { buildPersistedPracticeSession, launchPersistedPractice } from './launchPersistedPractice'
import type { PracticePresentationIntent } from './PracticeSessionContext'

const MUSIC_XML = `<?xml version="1.0"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1"><measure number="1"><attributes><divisions>1</divisions></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration></note></measure></part>
</score-partwise>`

const parsed = parseMusicXml(MUSIC_XML)
const arrangement: PersistedArrangement = {
  id: 'arrangement-1', workId: 'work-1', name: 'Solo', difficulty: 'Intermediate', source: 'user-imported', includedPartIds: ['P1'],
  createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
}
const scoreVersion: PersistedScoreVersion = {
  id: 'score-version-7', arrangementId: arrangement.id, version: 7, format: 'musicxml', createdAt: '2026-08-01T00:00:00.000Z',
  sourceFileName: 'exact.musicxml', sourceBytes: MUSIC_XML.length, uncompressedBytes: MUSIC_XML.length, contentHash: 'hash',
  canonicalMusicXml: MUSIC_XML, normalizedScoreId: parsed.id, parserVersion: 'musicxml-parser-1.0.0', includedPartIds: ['P1'],
}
const intent: PracticePresentationIntent = {
  type: 'section', recommendationId: 'recommendation-1', recommendationKind: 'focus-section',
  section: { id: 'section-identity', scoreVersionId: scoreVersion.id, startMeasureIndex: 0, endMeasureIndex: 0, sourceMeasureIds: ['P1:measure:0'], displayRange: 'Measure 1' },
}

describe('persisted practice launch', () => {
  it('opens the exact persisted ScoreVersion with suggested speed and session-local section identity', () => {
    const startSession = vi.fn()
    const navigate = vi.fn()
    const session = launchPersistedPractice({ arrangement, scoreVersion }, startSession, navigate, { speedMultiplier: 0.75, presentationIntent: intent })

    expect(session.arrangementId).toBe(arrangement.id)
    expect(session.scoreVersionId).toBe(scoreVersion.id)
    expect(session.score.id).toBe(scoreVersion.normalizedScoreId)
    expect(session.plan.scoreId).toBe(scoreVersion.normalizedScoreId)
    expect(session.plan.includedPartIds).toEqual(scoreVersion.includedPartIds)
    expect(session.speedMultiplier).toBe(0.75)
    expect(session.presentationIntent).toEqual(intent)
    expect(session.plan).not.toHaveProperty('presentationIntent')
    expect(session.source).not.toHaveProperty('presentationIntent')
    expect(startSession).toHaveBeenCalledWith(session)
    expect(navigate).toHaveBeenCalledWith('/practice/session')
  })

  it('uses a neutral speed and no planning claim for a direct repertoire launch', () => {
    const session = buildPersistedPracticeSession({ arrangement, scoreVersion })
    expect(session.speedMultiplier).toBe(1)
    expect(session.presentationIntent).toBeNull()
  })

  it('fails closed when the Arrangement, normalized score, or section identity is stale', () => {
    expect(() => buildPersistedPracticeSession({ arrangement, scoreVersion: { ...scoreVersion, arrangementId: 'other' } })).toThrow('does not belong')
    expect(() => buildPersistedPracticeSession({ arrangement, scoreVersion: { ...scoreVersion, normalizedScoreId: 'stale' } })).toThrow('normalized-score identity')
    expect(() => buildPersistedPracticeSession({ arrangement, scoreVersion }, { presentationIntent: { ...intent, section: { ...intent.section, scoreVersionId: 'other' } } })).toThrow('suggested section')
  })
})
