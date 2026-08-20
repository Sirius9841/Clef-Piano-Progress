import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { PracticeSessionContext, type PracticeSession } from './PracticeSessionContext'

export function PracticeSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<PracticeSession | null>(null)
  const startSession = useCallback((nextSession: PracticeSession) => setSession(nextSession), [])
  const setSpeedMultiplier = useCallback((speedMultiplier: number) => {
    if (![0.5, 0.75, 1, 1.25].includes(speedMultiplier)) return
    setSession((current) => current ? { ...current, speedMultiplier } : current)
  }, [])
  const clearSession = useCallback(() => setSession(null), [])
  const value = useMemo(() => ({ session, startSession, setSpeedMultiplier, clearSession }), [clearSession, session, setSpeedMultiplier, startSession])
  return <PracticeSessionContext.Provider value={value}>{children}</PracticeSessionContext.Provider>
}
