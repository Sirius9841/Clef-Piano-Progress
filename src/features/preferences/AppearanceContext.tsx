import { createContext, useContext } from 'react'
import type { RequestedAppearance, ResolvedAppearance, ScoreAppearance } from './appearance'

interface AppearanceContextValue {
  readonly requestedAppearance: RequestedAppearance
  readonly resolvedAppearance: ResolvedAppearance
  readonly scoreAppearance: ScoreAppearance
  readonly setRequestedAppearance: (appearance: RequestedAppearance) => void
  readonly setScoreAppearance: (appearance: ScoreAppearance) => void
}

export const AppearanceContext = createContext<AppearanceContextValue | null>(null)

export function useAppearance(): AppearanceContextValue {
  const value = useContext(AppearanceContext)
  if (!value) throw new Error('useAppearance must be used inside AppearanceProvider')
  return value
}
