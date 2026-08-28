import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { AppearanceContext } from './AppearanceContext'
import { APPEARANCE_STORAGE_KEY, DEFAULT_APPEARANCE_PREFERENCES, parseAppearancePreferences, resolveApplicationAppearance, type AppearancePreferences } from './appearance'

function readPreferences(): AppearancePreferences {
  if (typeof window === 'undefined') return DEFAULT_APPEARANCE_PREFERENCES
  try {
    return parseAppearancePreferences(window.localStorage.getItem(APPEARANCE_STORAGE_KEY))
  } catch {
    return DEFAULT_APPEARANCE_PREFERENCES
  }
}

function subscribeToSystemAppearance(onStoreChange: () => void): () => void {
  const query = window.matchMedia('(prefers-color-scheme: dark)')
  query.addEventListener('change', onStoreChange)
  return () => query.removeEventListener('change', onStoreChange)
}

function readSystemDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function AppearanceProvider({ children }: { readonly children: ReactNode }) {
  const [preferences, setPreferences] = useState(readPreferences)
  const systemDark = useSyncExternalStore(subscribeToSystemAppearance, readSystemDark, () => false)
  const resolvedAppearance = resolveApplicationAppearance(preferences.application, systemDark)

  useEffect(() => {
    document.documentElement.dataset.appAppearance = resolvedAppearance
    document.documentElement.dataset.requestedAppearance = preferences.application
    document.documentElement.dataset.scoreAppearance = preferences.score
    document.documentElement.style.colorScheme = resolvedAppearance
    try {
      window.localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(preferences))
    } catch {
      // Appearance still works for this session when browser storage is unavailable.
    }
  }, [preferences, resolvedAppearance])

  const value = useMemo(() => ({
    requestedAppearance: preferences.application,
    resolvedAppearance,
    scoreAppearance: preferences.score,
    setRequestedAppearance: (application: AppearancePreferences['application']) => setPreferences((current) => Object.freeze({ ...current, application })),
    setScoreAppearance: (score: AppearancePreferences['score']) => setPreferences((current) => Object.freeze({ ...current, score })),
  }), [preferences.application, preferences.score, resolvedAppearance])

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>
}
