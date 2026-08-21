import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PerformanceResultsPanel } from '../PerformanceResultsPanel'
import { analyzeResult, makeResultPlan, recordingForPlan } from './fixtures'

const noOp = () => undefined

describe('PerformanceResultsPanel', () => {
  it('renders an honest idle call to action', () => {
    const html = renderToStaticMarkup(<PerformanceResultsPanel analysis={{ status: 'idle' }} scope="aligned-span" onAnalyze={noOp} onHighlightChange={noOp} />)
    expect(html).toContain('Turn this take into a practice map')
    expect(html).toContain('Build results')
  })

  it('renders distinct processing and unavailable states', () => {
    const building = renderToStaticMarkup(<PerformanceResultsPanel analysis={{ status: 'building' }} scope="full-plan" onAnalyze={noOp} onHighlightChange={noOp} />)
    const unavailable = renderToStaticMarkup(<PerformanceResultsPanel analysis={{ status: 'unavailable', message: 'No trustworthy correspondence.' }} scope="full-plan" onAnalyze={noOp} onHighlightChange={noOp} />)

    expect(building).toContain('Building the measure map')
    expect(unavailable).toContain('No trustworthy correspondence.')
    expect(unavailable).not.toContain('0.0')
  })

  it('renders the complete results hierarchy and independent dimensions', () => {
    const plan = makeResultPlan(5, 3)
    const result = analyzeResult(plan, recordingForPlan(plan, (attack, index) => index === 2 ? { ...attack, midi: attack.midi + 2 } : attack)).results
    const html = renderToStaticMarkup(<PerformanceResultsPanel analysis={{ status: 'ready', result }} scope="full-plan" onAnalyze={noOp} onHighlightChange={noOp} />)

    expect(html).toContain('Performance results')
    expect(html).toContain('Measure heatmap')
    expect(html).toContain('Practice Priority')
    expect(html).toContain('Mistake navigator')
    expect(html).toContain('Needs work')
    expect(html).toContain('Strongest sections')
    expect(html).toContain('not an overall performance score')
    expect(html).toContain('aria-label="Practice Priority measure heatmap"')
  })

  it('presents sparse timing evidence as unavailable, not zero', () => {
    const plan = makeResultPlan(1, 1)
    const result = analyzeResult(plan, recordingForPlan(plan)).results
    const html = renderToStaticMarkup(<PerformanceResultsPanel analysis={{ status: 'ready', result }} scope="full-plan" onAnalyze={noOp} onHighlightChange={noOp} />)

    expect(html).toContain('Insufficient evidence')
    expect(html).toContain('Limited timing evidence')
    expect(html).not.toContain('Rhythm</span><strong>0.0')
  })
})
