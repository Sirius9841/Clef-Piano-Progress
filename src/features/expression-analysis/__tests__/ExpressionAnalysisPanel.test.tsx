import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { alignPerformance } from '../../alignment/alignPerformance'
import { makePlan, makeRecording } from '../../alignment/__tests__/fixtures'
import { musicalTime } from '../../musicxml/musicalTime'
import { gradeNotes } from '../../note-grading/gradeNotes'
import { makeScore } from '../../performance-results/__tests__/fixtures'
import { analyzeExpression } from '../analyzeExpression'
import { ExpressionAnalysisPanel } from '../ExpressionAnalysisPanel'
import { HistoricalExpressionPanel } from '../HistoricalExpressionPanel'

const noOp = () => undefined

function resultFixture() {
  const plan = makePlan(Array.from({ length: 8 }, (_, index) => [60 + index]))
  const base = makeRecording(plan.attacks.map((attack, index) => ({ midi: attack.midi, ms: 1_000 + index * 500, velocity: 40 + index * 6 })), { planId: plan.id })
  const recording = { ...base, keyPresses: base.keyPresses.map((press, index) => ({ ...press, releaseMs: press.attackMs + 250, releaseSequence: 20 + index })) }
  const alignment = alignPerformance(plan, recording)
  const noteGrading = gradeNotes({ expectedPlan: plan, recording, alignment, options: { gradingScope: 'full-plan' } })
  const baseScore = makeScore(plan)
  const normalizedScore = {
    ...baseScore,
    wedgeEvents: [
      { id: 'wedge:start', position: musicalTime(0), measureOnset: musicalTime(0), partId: 'P1', measureIndex: 0, measureNumber: '1', staff: null, voice: null, type: 'crescendo' as const, number: '1' },
      { id: 'wedge:stop', position: musicalTime(7), measureOnset: musicalTime(0), partId: 'P1', measureIndex: 7, measureNumber: '8', staff: null, voice: null, type: 'stop' as const, number: '1' },
    ],
  }
  return analyzeExpression({ normalizedScore, expectedPlan: plan, recording, alignment, noteGrading })
}

function resultWithDynamicsFindings(scores: readonly number[]) {
  const result = resultFixture()
  const template = result.dynamics.observations[0]!
  const observations = scores.map((score, index) => ({ ...template, id: `finding:${index}`, targetId: `target:${index}`, score, summary: `finding ${index} at ${score}` }))
  return {
    ...result,
    dynamics: {
      ...result.dynamics,
      status: scores.length ? 'ready' as const : 'unavailable' as const,
      reliability: scores.length ? 'limited' as const : 'unavailable' as const,
      unavailableReason: scores.length ? null : 'No safe authored target evidence.',
      score: scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null,
      observations,
      coverage: { authoredTargetCount: scores.length, analyzedTargetCount: scores.length, ratio: scores.length ? 1 : null },
    },
  }
}

describe('ExpressionAnalysisPanel', () => {
  it('renders honest idle, processing, and error states', () => {
    expect(renderToStaticMarkup(<ExpressionAnalysisPanel analysis={{ status: 'idle' }} onAnalyze={noOp} />)).toContain('Analyze dynamics and articulation')
    expect(renderToStaticMarkup(<ExpressionAnalysisPanel analysis={{ status: 'analyzing' }} onAnalyze={noOp} />)).toContain('Mapping authored expression')
    const error = renderToStaticMarkup(<ExpressionAnalysisPanel analysis={{ status: 'error', message: 'No safe mapping.' }} onAnalyze={noOp} />)
    expect(error).toContain('No safe mapping.')
    expect(error).not.toContain('0.0')
  })

  it('keeps Dynamics and Articulation separate with visible methodology caveats', () => {
    const html = renderToStaticMarkup(<ExpressionAnalysisPanel analysis={{ status: 'ready', result: resultFixture() }} onAnalyze={noOp} />)
    expect(html).toContain('Relative MIDI dynamics')
    expect(html).toContain('Physical key articulation')
    expect(html).toContain('not an overall performance or musicality score')
    expect(html).toContain('normalized once')
    expect(html).toContain('Sustain pedal can change the audible result')
    expect(html).toContain('No supported authored key-articulation targets')
  })

  it('shows a strong-only finding without inventing an issue', () => {
    const html = renderToStaticMarkup(<ExpressionAnalysisPanel analysis={{ status: 'ready', result: resultWithDynamicsFindings([0.9]) }} onAnalyze={noOp} />)
    expect(html).toContain('class="success"')
    expect(html).toContain('finding 0 at 0.9')
    expect(html).not.toContain('class="issue"')
  })

  it('shows a weak-only finding without inventing a success', () => {
    const html = renderToStaticMarkup(<ExpressionAnalysisPanel analysis={{ status: 'ready', result: resultWithDynamicsFindings([0.3]) }} onAnalyze={noOp} />)
    expect(html).toContain('class="issue"')
    expect(html).toContain('finding 0 at 0.3')
    expect(html).not.toContain('class="success"')
  })

  it('shows distinct strongest-success and weakest-issue findings for mixed evidence', () => {
    const html = renderToStaticMarkup(<ExpressionAnalysisPanel analysis={{ status: 'ready', result: resultWithDynamicsFindings([0.9, 0.2, 0.8]) }} onAnalyze={noOp} />)
    expect(html).toContain('finding 0 at 0.9')
    expect(html).toContain('finding 1 at 0.2')
    expect(html).not.toContain('finding 2 at 0.8')
    expect(html.match(/class="success"/g)).toHaveLength(1)
    expect(html.match(/class="issue"/g)).toHaveLength(1)
  })

  it('renders unavailable evidence without fake success or issue findings', () => {
    const html = renderToStaticMarkup(<ExpressionAnalysisPanel analysis={{ status: 'ready', result: resultWithDynamicsFindings([]) }} onAnalyze={noOp} />)
    expect(html).toContain('No safe authored target evidence.')
    expect(html).not.toContain('class="success"')
    expect(html).not.toContain('class="issue"')
  })

  it('shows a truthful V1 historical state and uses an exact supplied V2 snapshot', () => {
    const legacy = renderToStaticMarkup(<HistoricalExpressionPanel result={null} />)
    expect(legacy).toContain('Dynamics and Articulation not analyzed')
    expect(legacy).toContain('will not silently regrade')
    expect(legacy).not.toContain('0.0')
    const result = resultFixture()
    const current = renderToStaticMarkup(<HistoricalExpressionPanel result={result} />)
    expect(current).toContain('Saved expression snapshot')
    expect(current).toContain(result.diagnostics.expressionAnalysisEngineVersion)
  })
})
