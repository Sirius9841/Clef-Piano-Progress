export type RequestedAppearance = 'dark' | 'light' | 'system'
export type ResolvedAppearance = 'dark' | 'light'
export type ScoreAppearance = 'paper' | 'night'

export interface AppearancePreferences {
  readonly version: 1
  readonly application: RequestedAppearance
  readonly score: ScoreAppearance
}

export const APPEARANCE_STORAGE_KEY = 'clef-ui-preferences-v1'
export const DEFAULT_APPEARANCE_PREFERENCES: AppearancePreferences = Object.freeze({ version: 1, application: 'dark', score: 'paper' })

export function resolveApplicationAppearance(requested: RequestedAppearance, systemDark: boolean): ResolvedAppearance {
  return requested === 'system' ? (systemDark ? 'dark' : 'light') : requested
}

export function parseAppearancePreferences(value: string | null): AppearancePreferences {
  if (!value) return DEFAULT_APPEARANCE_PREFERENCES
  try {
    const candidate: unknown = JSON.parse(value)
    if (!candidate || typeof candidate !== 'object') return DEFAULT_APPEARANCE_PREFERENCES
    const record = candidate as Record<string, unknown>
    const application = record.application
    const score = record.score
    if (record.version !== 1 || !['dark', 'light', 'system'].includes(String(application)) || !['paper', 'night'].includes(String(score))) return DEFAULT_APPEARANCE_PREFERENCES
    return Object.freeze({ version: 1, application: application as RequestedAppearance, score: score as ScoreAppearance })
  } catch {
    return DEFAULT_APPEARANCE_PREFERENCES
  }
}
