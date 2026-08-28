import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { derivePracticePlanning, preparePracticePlanningContext, type PracticeRecommendation } from '../features/practice-planning'
import { attemptFixture, repositoryFixture } from '../features/practice-planning/__tests__/fixtures'
import { PracticePlanningView } from './PracticePlanningPanel'
import { planningQualityPercent, recommendationPresentationIntent, recommendationWhy } from './practicePlanningPresentation'

const AS_OF = '2026-08-26T12:00:00.000Z'

describe('Practice Planning presentation', () => {
  it('renders real planner WHAT, WHY, strength, speed, and exact provenance', async () => {
    const fixture = repositoryFixture([
      attemptFixture('weak-a', { sessionId: 'S1', score: 0.5, speed: 0.8 }),
      attemptFixture('weak-b', { sessionId: 'S2', score: 0.5, speed: 0.8, performedAt: '2026-08-23T12:00:00.000Z' }),
    ])
    const context = await preparePracticePlanningContext({ repository: fixture.repository, arrangementId: 'arrangement-1', scoreVersionId: 'score-version-1', asOf: AS_OF })
    const markup = renderToStaticMarkup(<MemoryRouter><PracticePlanningView result={derivePracticePlanning(context)} /></MemoryRouter>)
    expect(markup).toContain('WHAT')
    expect(markup).toContain('WHY')
    expect(markup).toContain('Exact provenance')
    expect(markup).toContain('80% → 75%')
    expect(markup).toContain('practice-planning-1.0.1')
  })

  it('renders an honest empty state when the planner has no current recommendation', async () => {
    const fixture = repositoryFixture([])
    const context = await preparePracticePlanningContext({ repository: fixture.repository, arrangementId: 'arrangement-1', scoreVersionId: 'score-version-1', asOf: AS_OF })
    const markup = renderToStaticMarkup(<MemoryRouter><PracticePlanningView result={derivePracticePlanning(context)} /></MemoryRouter>)
    expect(markup).toContain('No current recommendation')
    expect(markup).toContain('does not yet have enough compatible recent evidence')
  })

  it('keeps an independent Technique opportunity explicitly non-causal', () => {
    const recommendation = { reasons: [{ code: 'supported-technique-opportunity' }] } as unknown as PracticeRecommendation
    expect(recommendationWhy(recommendation)).toContain('not claimed as the cause')
  })

  it('formats normalized planning quality as a percentage', () => {
    expect(planningQualityPercent(0.5)).toBe('50.0%')
    expect(planningQualityPercent(null)).toBe('unavailable')
  })

  it('preserves exact section identity for repertoire launch and keeps Technique routing separate', () => {
    const section = { id: 'section-1', scoreVersionId: 'score-version-1', startMeasureIndex: 2, endMeasureIndex: 4, sourceMeasureIds: ['m3', 'm4', 'm5'], displayRange: 'Measures 3–5' }
    const sectionRecommendation = { id: 'r1', kind: 'focus-section', target: { type: 'section', section } } as unknown as PracticeRecommendation
    const techniqueRecommendation = { id: 'r2', kind: 'technique-drill', target: { type: 'technique', moduleId: 'scales', requiresNewStimulus: false } } as unknown as PracticeRecommendation
    expect(recommendationPresentationIntent(sectionRecommendation)).toEqual({ type: 'section', recommendationId: 'r1', recommendationKind: 'focus-section', section })
    expect(recommendationPresentationIntent(techniqueRecommendation)).toBeNull()
  })

  it('renders Technique recommendations on their dedicated module route', async () => {
    const fixture = repositoryFixture([])
    const context = await preparePracticePlanningContext({ repository: fixture.repository, arrangementId: 'arrangement-1', scoreVersionId: 'score-version-1', asOf: AS_OF })
    const result = derivePracticePlanning(context)
    const technique = {
      id: 'technique:scales', rank: 1, kind: 'technique-drill', target: { type: 'technique', moduleId: 'scales', requiresNewStimulus: false },
      sourcePracticeSpeedMultiplier: null, suggestedPracticeSpeedMultiplier: null, evidenceStrength: 'supported', reasons: [], evidenceAttemptIds: [], evidenceSessionIds: [], lastEvidenceAt: null,
    } as const satisfies PracticeRecommendation
    const markup = renderToStaticMarkup(<MemoryRouter><PracticePlanningView result={{ ...result, status: 'ready', recommendations: [technique] }} /></MemoryRouter>)
    expect(markup).toContain('href="/technique/scales"')
    expect(markup).toContain('Open Technique target')
    expect(markup).not.toContain('/practice/arrangement-1')
  })
})
