import { parseMusicXml } from '../musicxml/parser'
import type { PersistedArrangement, PersistedScoreVersion } from '../persistence/types'
import type { PracticePresentationIntent, PracticeSession } from './PracticeSessionContext'
import { buildPersistedPracticePlan } from './persistedPractice'

export interface PersistedPracticeSource {
  readonly arrangement: PersistedArrangement
  readonly scoreVersion: PersistedScoreVersion
}

export interface PersistedPracticeLaunchOptions {
  readonly speedMultiplier?: number
  readonly presentationIntent?: PracticePresentationIntent | null
}

export function buildPersistedPracticeSession(source: PersistedPracticeSource, options: PersistedPracticeLaunchOptions = {}): PracticeSession {
  if (source.scoreVersion.arrangementId !== source.arrangement.id) throw new Error('The selected score does not belong to this Arrangement.')
  if (options.presentationIntent?.type === 'section' && options.presentationIntent.section.scoreVersionId !== source.scoreVersion.id) {
    throw new Error('The suggested section does not belong to the selected ScoreVersion.')
  }
  const score = parseMusicXml(source.scoreVersion.canonicalMusicXml)
  if (score.id !== source.scoreVersion.normalizedScoreId) throw new Error('The saved ScoreVersion no longer matches its canonical normalized-score identity.')
  const plan = buildPersistedPracticePlan(score, source.scoreVersion)
  return {
    arrangementId: source.arrangement.id,
    scoreVersionId: source.scoreVersion.id,
    source: {
      fileName: source.scoreVersion.sourceFileName,
      sourceFormat: source.scoreVersion.format,
      musicXmlText: source.scoreVersion.canonicalMusicXml,
      sourceBytes: source.scoreVersion.sourceBytes,
      uncompressedBytes: source.scoreVersion.uncompressedBytes,
    },
    score,
    plan,
    sourceLabel: `${source.scoreVersion.sourceFileName} · v${source.scoreVersion.version}`,
    isDemo: false,
    speedMultiplier: options.speedMultiplier ?? 1,
    presentationIntent: options.presentationIntent ?? null,
  }
}

export function launchPersistedPractice(
  source: PersistedPracticeSource,
  startSession: (session: PracticeSession) => void,
  navigate: (path: string) => void,
  options: PersistedPracticeLaunchOptions = {},
): PracticeSession {
  const session = buildPersistedPracticeSession(source, options)
  startSession(session)
  navigate('/practice/session')
  return session
}
