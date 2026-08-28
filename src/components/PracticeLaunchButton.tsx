import { Play } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { parseMusicXml } from '../features/musicxml/parser'
import type { RepertoireListItem } from '../features/persistence/types'
import { usePracticeSession } from '../features/practice/PracticeSessionContext'
import { buildPersistedPracticePlan } from '../features/practice/persistedPractice'
import { Button } from './ui'

export function PracticeLaunchButton({ item, children = 'Practice', variant = 'primary', className }: {
  readonly item: RepertoireListItem
  readonly children?: ReactNode
  readonly variant?: 'primary' | 'secondary' | 'ghost'
  readonly className?: string
}) {
  const navigate = useNavigate()
  const practice = usePracticeSession()
  const [error, setError] = useState<string | null>(null)

  const launch = () => {
    setError(null)
    try {
      const score = parseMusicXml(item.scoreVersion.canonicalMusicXml)
      const plan = buildPersistedPracticePlan(score, item.scoreVersion)
      practice.startSession({
        arrangementId: item.arrangement.id,
        scoreVersionId: item.scoreVersion.id,
        source: {
          fileName: item.scoreVersion.sourceFileName,
          sourceFormat: item.scoreVersion.format,
          musicXmlText: item.scoreVersion.canonicalMusicXml,
          sourceBytes: item.scoreVersion.sourceBytes,
          uncompressedBytes: item.scoreVersion.uncompressedBytes,
        },
        score,
        plan,
        sourceLabel: `${item.scoreVersion.sourceFileName} · v${item.scoreVersion.version}`,
        isDemo: false,
        speedMultiplier: 1,
      })
      navigate('/practice/session')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'This saved score could not be prepared for practice.')
    }
  }

  return <span className="practice-launch"><Button className={className} variant={variant} icon={Play} onClick={launch}>{children}</Button>{error && <span role="alert" className="practice-launch-error">{error}</span>}</span>
}
