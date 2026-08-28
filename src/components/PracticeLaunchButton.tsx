import { Play } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePracticeSession, type PracticePresentationIntent } from '../features/practice/PracticeSessionContext'
import { launchPersistedPractice, type PersistedPracticeSource } from '../features/practice/launchPersistedPractice'
import { Button } from './ui'

export function PracticeLaunchButton({ item, children = 'Practice', variant = 'primary', className, speedMultiplier, presentationIntent }: {
  readonly item: PersistedPracticeSource
  readonly children?: ReactNode
  readonly variant?: 'primary' | 'secondary' | 'ghost'
  readonly className?: string
  readonly speedMultiplier?: number
  readonly presentationIntent?: PracticePresentationIntent | null
}) {
  const navigate = useNavigate()
  const practice = usePracticeSession()
  const [error, setError] = useState<string | null>(null)

  const launch = () => {
    setError(null)
    try {
      launchPersistedPractice(item, practice.startSession, navigate, { speedMultiplier, presentationIntent })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'This saved score could not be prepared for practice.')
    }
  }

  return <span className="practice-launch"><Button className={className} variant={variant} icon={Play} onClick={launch}>{children}</Button>{error && <span role="alert" className="practice-launch-error">{error}</span>}</span>
}
