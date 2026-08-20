import { buildExpectedPerformancePlan } from '../expected-performance/builder'
import demoScoreXml from '../musicxml/demo-score.musicxml?raw'
import { parseMusicXml } from '../musicxml/parser'
import type { PracticeSession } from './PracticeSessionContext'

export function createDemoPracticeSession(): PracticeSession {
  const score = parseMusicXml(demoScoreXml)
  const bytes = new TextEncoder().encode(demoScoreXml).byteLength
  return {
    source: {
      fileName: 'evening-lines-clef-demo.musicxml',
      sourceFormat: 'musicxml',
      musicXmlText: demoScoreXml,
      sourceBytes: bytes,
      uncompressedBytes: bytes,
    },
    score,
    plan: buildExpectedPerformancePlan(score, { fallbackQuarterBpm: 120 }),
    sourceLabel: 'Original Clef demo score',
    isDemo: true,
    speedMultiplier: 1,
  }
}
