import { describe, expect, it } from 'vitest'
import { DEFAULT_APPEARANCE_PREFERENCES, parseAppearancePreferences, resolveApplicationAppearance } from './appearance'

describe('appearance preferences', () => {
  it('keeps requested System separate from its live OS resolution', () => {
    expect(resolveApplicationAppearance('system', true)).toBe('dark')
    expect(resolveApplicationAppearance('system', false)).toBe('light')
  })

  it('keeps explicit application appearances independent of the OS', () => {
    expect(resolveApplicationAppearance('dark', false)).toBe('dark')
    expect(resolveApplicationAppearance('light', true)).toBe('light')
  })

  it('round-trips application and score appearance independently', () => {
    expect(parseAppearancePreferences(JSON.stringify({ version: 1, application: 'system', score: 'night' }))).toEqual({ version: 1, application: 'system', score: 'night' })
  })

  it('fails closed to the frozen Dark and Paper defaults', () => {
    expect(parseAppearancePreferences('{bad')).toBe(DEFAULT_APPEARANCE_PREFERENCES)
    expect(parseAppearancePreferences(JSON.stringify({ version: 2, application: 'light', score: 'paper' }))).toBe(DEFAULT_APPEARANCE_PREFERENCES)
  })
})
