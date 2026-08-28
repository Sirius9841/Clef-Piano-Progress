import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { REPERTOIRE_STATUSES } from '../domain/music'

const settingsSource = readFileSync(new URL('./SettingsPage.tsx', import.meta.url), 'utf8')
const practiceSource = readFileSync(new URL('./PracticePage.tsx', import.meta.url), 'utf8')
const historySource = readFileSync(new URL('./HistoricalResultPage.tsx', import.meta.url), 'utf8')
const techniqueWorkspaceSource = readFileSync(new URL('./TechniqueWorkspacePage.tsx', import.meta.url), 'utf8')
const techniqueResultSource = readFileSync(new URL('../features/technique/TechniqueResultPanel.tsx', import.meta.url), 'utf8')
const cssSource = readFileSync(new URL('../styles/index.css', import.meta.url), 'utf8')
const productionUiSource = [settingsSource, practiceSource, historySource, techniqueWorkspaceSource, techniqueResultSource, readFileSync(new URL('./HomePage.tsx', import.meta.url), 'utf8'), readFileSync(new URL('./LibraryPage.tsx', import.meta.url), 'utf8')].join('\n')

describe('Phase 15 frozen presentation guardrails', () => {
  it('exposes exactly the four manual repertoire statuses', () => {
    expect(REPERTOIRE_STATUSES).toEqual(['Learning', 'Practicing', 'Performance Ready', 'Completed'])
  })

  it('keeps theme controls semantic and score appearance independent', () => {
    expect(settingsSource).toContain('aria-label="Application appearance"')
    expect(settingsSource).toContain('aria-label="Score appearance"')
    expect(settingsSource).toContain('requestedAppearance')
    expect(settingsSource).toContain('scoreAppearance')
  })

  it('uses the real Technique configuration and dynamic analyzer facets', () => {
    expect(techniqueWorkspaceSource).toContain('validateTechniqueConfiguration')
    expect(techniqueWorkspaceSource).toContain('TONIC_LABELS.map')
    expect(techniqueWorkspaceSource).toContain('value="natural-minor"')
    expect(techniqueWorkspaceSource).toContain("update('declaredHandContext'")
    expect(techniqueWorkspaceSource).toContain('compileTechniqueExercise')
    expect(techniqueResultSource).toContain('result.facets.map')
    expect(techniqueResultSource).not.toContain('MODULE_FACETS')
  })

  it('preserves historical-result truth and partial-scope exclusions without a composite score', () => {
    expect(historySource).toContain('Analysis snapshot preserved')
    expect(historySource).toContain('excluded from headline full-performance PB and Mastery')
    expect(historySource).toContain('Phase 7 measure and section priority')
    expect(historySource).not.toContain('Overall Performance Score')
  })

  it('provides a safe Focus Mode exit and frozen responsive widths', () => {
    expect(practiceSource).toContain("event.key === 'Escape'")
    expect(practiceSource).toContain('Exit Focus')
    expect(cssSource).toContain('@media (max-width:1280px)')
    expect(cssSource).toContain('@media (max-width:1100px)')
    expect(cssSource).toContain('body.practice-focus')
  })

  it('uses an accessible confirmation and makes no backup or recovery success claim', () => {
    expect(settingsSource).toContain('<ConfirmDialog')
    expect(settingsSource).not.toContain('window.confirm')
    expect(settingsSource).not.toMatch(/backup written|integrity passed|records lost/i)
  })

  it('does not copy frozen-design fixture contracts into production UI', () => {
    expect(productionUiSource).not.toMatch(/DB\.plan|DB\.canonAttempts|TEC_TAKE|MODULE_FACETS|SL73 STUDIO|mock 214 MB|mock 38 CC64|drawScore\(\)/)
  })
})
