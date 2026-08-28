import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { derivePracticePlanning, preparePracticePlanningContext, type PracticeRecommendation } from '../features/practice-planning'
import { attemptFixture, repositoryFixture } from '../features/practice-planning/__tests__/fixtures'
import { PracticePlanningView } from './PracticePlanningPanel'
import { recommendationWhy } from './practicePlanningPresentation'

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
})
