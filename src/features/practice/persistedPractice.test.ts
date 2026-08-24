import { describe, expect, it } from 'vitest'
import { parseMusicXml } from '../musicxml/parser'
import type { PersistedScoreVersion } from '../persistence/types'
import { buildPersistedPracticePlan } from './persistedPractice'

const multiPartScore = `<?xml version="1.0"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1"><part-name>Upper</part-name></score-part>
    <score-part id="P2"><part-name>Lower</part-name></score-part>
  </part-list>
  <part id="P1"><measure number="1"><attributes><divisions>1</divisions></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration></note></measure></part>
  <part id="P2"><measure number="1"><attributes><divisions>1</divisions></attributes><note><pitch><step>C</step><octave>3</octave></pitch><duration>1</duration></note></measure></part>
</score-partwise>`

function scoreVersion(includedPartIds: readonly string[]): PersistedScoreVersion {
  return {
    id: 'score-v1', arrangementId: 'arrangement-1', version: 1, format: 'musicxml', createdAt: '2026-08-24T12:00:00.000Z',
    sourceFileName: 'parts.musicxml', sourceBytes: multiPartScore.length, uncompressedBytes: multiPartScore.length,
    contentHash: 'hash', canonicalMusicXml: multiPartScore, normalizedScoreId: 'normalized', parserVersion: 'parser', includedPartIds,
  }
}

describe('persisted practice plans', () => {
  it('builds a multi-part plan from the persisted ScoreVersion selection', () => {
    const plan = buildPersistedPracticePlan(parseMusicXml(multiPartScore), scoreVersion(['P1', 'P2']), ['P2', 'P1', 'P2'])
    expect(plan.includedPartIds).toEqual(['P1', 'P2'])
    expect(plan.attacks.map((attack) => attack.partId)).toEqual(['P1', 'P2'])
  })

  it('rejects a requested selection that differs from persisted identity', () => {
    expect(() => buildPersistedPracticePlan(parseMusicXml(multiPartScore), scoreVersion(['P1']), ['P2'])).toThrow('does not match')
  })
})
