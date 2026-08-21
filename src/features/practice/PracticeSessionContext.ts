import { createContext, useContext } from 'react'
import type { ExpectedPerformancePlan } from '../expected-performance/types'
import type { LoadedMusicXml, NormalizedScore } from '../musicxml/types'

export interface PracticeSession {
  arrangementId: string | null
  scoreVersionId: string | null
  source: LoadedMusicXml
  score: NormalizedScore
  plan: ExpectedPerformancePlan
  sourceLabel: string
  isDemo: boolean
  speedMultiplier: number
}

export interface PracticeSessionContextValue {
  session: PracticeSession | null
  startSession: (session: PracticeSession) => void
  setSpeedMultiplier: (speedMultiplier: number) => void
  clearSession: () => void
}

export const PracticeSessionContext = createContext<PracticeSessionContextValue | null>(null)

export function usePracticeSession(): PracticeSessionContextValue {
  const context = useContext(PracticeSessionContext)
  if (!context) throw new Error('usePracticeSession must be used inside PracticeSessionProvider')
  return context
}
