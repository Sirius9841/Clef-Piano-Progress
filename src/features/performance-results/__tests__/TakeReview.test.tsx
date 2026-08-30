// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import { act, type ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { alignPerformance } from '../../alignment/alignPerformance'
import { makePlan, melodyRecording } from '../../alignment/__tests__/fixtures'
import { analyzeExpression } from '../../expression-analysis/analyzeExpression'
import { gradeNotes } from '../../note-grading/gradeNotes'
import { analyzePedal } from '../../pedal-analysis/analyzePedal'
import { analyzeTiming } from '../../timing-analysis/analyzeTiming'
import { analyzeVoicing } from '../../voicing-analysis/analyzeVoicing'
import { buildPerformanceResults } from '../buildPerformanceResults'
import { TakeReview } from '../TakeReview'
import { boundedProblemMeasures, confirmTakeRegionCandidate, INITIAL_TAKE_REVIEW_INTERACTION, takeReviewInteractionReducer } from '../takeReviewInteraction'
import { takeAnalysisPipelineKey } from '../useTakeAnalysisPipeline'
import { makeScore } from './fixtures'

const noOp = () => undefined
const source = readFileSync('src/features/performance-results/TakeReview.tsx', 'utf8')
const idleInterpretation = {
  expressionAnalysis: { status: 'idle' as const },
  pedalAnalysis: { status: 'idle' as const },
  voicingAnalysis: { status: 'idle' as const },
}

function boundedTake() {
  const plan = makePlan(Array.from({ length: 8 }, (_, index) => [60 + index]), { measureIndices: Array.from({ length: 8 }, (_, index) => index) })
  const recording = melodyRecording([60, 61, 62, 63], [0, 500, 1_000, 1_500])
  const alignment = alignPerformance(plan, recording, { localizationHint: { mode: 'beginning' } })
  const noteGrading = gradeNotes({ expectedPlan: plan, recording, alignment })
  const timingAnalysis = analyzeTiming({ expectedPlan: plan, recording, alignment, noteGrading })
  const score = makeScore(plan, 8, 1)
  const results = buildPerformanceResults({ normalizedScore: score, expectedPlan: plan, alignment, noteGrading, timingAnalysis })
  return { score, plan, recording, alignment, noteGrading, timingAnalysis, results }
}

function renderInteractive(element: ReactElement) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  act(() => root.render(element))
  return {
    container,
    click(selector: string, text?: string) {
      const candidates = [...container.querySelectorAll<HTMLButtonElement>(selector)]
      const button = text ? candidates.find((candidate) => candidate.textContent?.trim() === text) : candidates[0]
      if (!button) throw new Error(`Button ${text ?? selector} was not found.`)
      act(() => button.click())
    },
    close() {
      act(() => root.unmount())
      container.remove()
    },
  }
}

describe('TakeReview', () => {
  it('shows the matched range and maps only localized measures with independent core dimensions', () => {
    const take = boundedTake()
    const html = renderToStaticMarkup(<TakeReview {...take} practiceSpeed={1} {...idleInterpretation} onConfirmRegion={noOp} onHighlightChange={noOp} />)

    expect(html).toContain('Matched score region · M1–M4')
    expect(html).toContain('Independent core dimensions')
    expect(html).toContain('>M1</button>')
    expect(html).toContain('>M4</button>')
    expect(html).not.toContain('>M5</button>')
    expect(html).not.toContain('overall score')
    expect(html).not.toContain('Mistake navigator')
    expect(html).toContain('Open detailed analysis for event-level evidence')
    expect(source).not.toMatch(/focused section|focus section/i)
  })

  it('keeps Take Review visible with Notes when Rhythm and Tempo are unavailable', () => {
    const plan = makePlan([[60]], { measureIndices: [0] })
    const recording = melodyRecording([60], [0])
    const alignment = alignPerformance(plan, recording, { localizationHint: { mode: 'beginning' } })
    const noteGrading = gradeNotes({ expectedPlan: plan, recording, alignment })
    const timingAnalysis = analyzeTiming({ expectedPlan: plan, recording, alignment, noteGrading })
    const results = buildPerformanceResults({ normalizedScore: makeScore(plan, 1, 1), expectedPlan: plan, alignment, noteGrading, timingAnalysis })
    const html = renderToStaticMarkup(<TakeReview alignment={alignment} recording={recording} practiceSpeed={1} results={results} {...idleInterpretation} onConfirmRegion={noOp} onHighlightChange={noOp} />)

    expect(results.status).toBe('ready')
    expect(timingAnalysis.status).toBe('unavailable')
    expect(html).toContain('Independent core dimensions')
    expect(html).toContain('<span>Notes</span><strong>100.0</strong>')
    expect(html.match(/<strong>Unavailable<\/strong>/g)?.length).toBeGreaterThanOrEqual(2)
    expect(html).not.toContain('This take could not be reviewed safely')
    expect(html).not.toContain('overall score')
  })

  it('shows competing repeated regions and confirmation controls without headline grades', () => {
    const pattern = [[60], [62], [64], [65]]
    const plan = makePlan([...pattern, [80], [81], ...pattern])
    const recording = melodyRecording([60, 62, 64, 65], [0, 500, 1_000, 1_500])
    const alignment = alignPerformance(plan, recording, { localizationHint: { mode: 'auto' } })
    const html = renderToStaticMarkup(<TakeReview alignment={alignment} recording={recording} practiceSpeed={1} results={null} {...idleInterpretation} onConfirmRegion={noOp} onHighlightChange={noOp} />)

    expect(html).toContain('Score region unresolved')
    expect(html).toContain('Candidate A')
    expect(html).toContain('Confirm this region')
    expect(html).toContain('remain unavailable until the score region is resolved')
    expect(html).not.toContain('Independent core dimensions')
  })

  it('keeps seven dimensions independent without inferring interpretation truth from idle state', () => {
    for (const label of ['Notes', 'Rhythm', 'Tempo', 'Dynamics', 'Articulation', 'Pedal', 'Voicing']) expect(source).toContain(`label: '${label}'`)
    expect(source).not.toContain('Expression score')
    expect(source).not.toContain('Overall Performance Score')

    const view = renderInteractive(<TakeReview {...boundedTake()} practiceSpeed={1} {...idleInterpretation} onConfirmRegion={noOp} onHighlightChange={noOp} />)
    view.click('.take-review-nav button', 'Pedal')
    expect(view.container.textContent).toContain('Not analyzed yet')
    expect(view.container.textContent).not.toContain('No authored pedal target')
    view.click('.take-review-nav button', 'Voicing')
    expect(view.container.textContent).toContain('Not analyzed yet')
    expect(view.container.textContent).not.toContain('Not configured')
    view.click('.take-review-nav button', 'Dynamics')
    expect(view.container.textContent).not.toContain('0 of 0 authored targets analyzed')
    view.close()
  })

  it('changes the selected matched measure while rejecting measures outside the localized region', () => {
    const { results } = boundedTake()
    const allowed = results.measures.slice(0, 4).map((measure) => measure.id)
    const selected = takeReviewInteractionReducer(INITIAL_TAKE_REVIEW_INTERACTION, { type: 'select-measure', measureId: allowed[2]!, allowedMeasureIds: allowed })
    const rejected = takeReviewInteractionReducer(selected, { type: 'select-measure', measureId: results.measures[6]!.id, allowedMeasureIds: allowed })

    expect(selected.selectedMeasureId).toBe(allowed[2])
    expect(rejected).toBe(selected)
  })

  it('switches the evidence inspector among independent Notes, Rhythm, and Tempo views', () => {
    let state = INITIAL_TAKE_REVIEW_INTERACTION
    for (const dimension of ['notes', 'rhythm', 'tempo'] as const) {
      state = takeReviewInteractionReducer(state, { type: 'select-dimension', dimension })
      expect(state.dimension).toBe(dimension)
    }
  })

  it('updates the real DOM for matched-measure and independent-dimension interactions', () => {
    const view = renderInteractive(<TakeReview {...boundedTake()} practiceSpeed={1} {...idleInterpretation} onConfirmRegion={noOp} onHighlightChange={noOp} />)
    view.click('[aria-label="Matched measure map"] button', 'M3')
    expect(view.container.querySelector('.take-review-context')?.textContent).toContain('Measure 3')
    for (const dimension of ['Notes', 'Rhythm', 'Tempo']) {
      view.click('.take-review-nav button', dimension)
      expect(view.container.querySelector('.take-review-inspector')?.textContent).toContain(dimension)
    }
    view.close()
  })

  it('confirms the exact ambiguity candidate selected by the user', () => {
    const pattern = [[60], [62], [64], [65]]
    const alignment = alignPerformance(makePlan([...pattern, [80], [81], ...pattern]), melodyRecording([60, 62, 64, 65], [0, 500, 1_000, 1_500]))
    const candidate = alignment.localization!.candidates[1]!
    let confirmed: typeof candidate | null = null

    confirmTakeRegionCandidate(candidate, (selected) => { confirmed = selected })

    expect(confirmed).toBe(candidate)
  })

  it('fires the exact Candidate B callback through the rendered confirmation control', () => {
    const pattern = [[60], [62], [64], [65]]
    const plan = makePlan([...pattern, [80], [81], ...pattern])
    const recording = melodyRecording([60, 62, 64, 65], [0, 500, 1_000, 1_500])
    const alignment = alignPerformance(plan, recording)
    let confirmedId: string | null = null
    const view = renderInteractive(<TakeReview alignment={alignment} recording={recording} practiceSpeed={1} results={null} {...idleInterpretation} onConfirmRegion={(candidate) => { confirmedId = candidate.id }} onHighlightChange={noOp} />)
    const buttons = view.container.querySelectorAll<HTMLButtonElement>('.localization-candidates button')
    act(() => buttons[1]!.click())
    expect(confirmedId).toBe(alignment.localization!.candidates[1]!.id)
    view.close()
  })

  it('distinguishes analyzed no-target, unavailable-target, and absent-intent states', () => {
    const take = boundedTake()
    const expression = analyzeExpression({ normalizedScore: take.score, expectedPlan: take.plan, recording: take.recording, alignment: take.alignment, noteGrading: take.noteGrading })
    const pedal = analyzePedal({ normalizedScore: take.score, expectedPlan: take.plan, recording: take.recording, alignment: take.alignment, noteGrading: take.noteGrading, expressionAnalysis: expression })
    const voicing = analyzeVoicing({ normalizedScore: take.score, scoreVersionId: 'score-version:test', expectedPlan: take.plan, recording: take.recording, alignment: take.alignment, noteGrading: take.noteGrading, expressionAnalysis: expression, intentProfile: null })
    const analyzed = { expressionAnalysis: { status: 'ready' as const, result: expression }, pedalAnalysis: { status: 'ready' as const, result: pedal }, voicingAnalysis: { status: 'ready' as const, result: voicing } }
    const view = renderInteractive(<TakeReview {...take} practiceSpeed={1} {...analyzed} onConfirmRegion={noOp} onHighlightChange={noOp} />)

    view.click('.take-review-nav button', 'Pedal')
    expect(view.container.querySelector('.take-review-inspector')?.textContent).toContain('Not graded')
    expect(view.container.querySelector('.take-review-inspector')?.textContent).toContain('No authored pedal target in this score')
    view.click('.take-review-nav button', 'Voicing')
    expect(view.container.querySelector('.take-review-inspector')?.textContent).toContain('Not configured')

    const pedalWithTargetsUnavailable = { ...pedal, status: 'unavailable' as const, score: null, unavailableReason: 'Authored pedal exists, but performed controller evidence is insufficient.', coverage: { ...pedal.coverage, authoredPhraseCount: 1 } }
    view.close()
    const unavailable = renderInteractive(<TakeReview {...take} practiceSpeed={1} expressionAnalysis={analyzed.expressionAnalysis} pedalAnalysis={{ status: 'ready', result: pedalWithTargetsUnavailable }} voicingAnalysis={analyzed.voicingAnalysis} onConfirmRegion={noOp} onHighlightChange={noOp} />)
    unavailable.click('.take-review-nav button', 'Pedal')
    expect(unavailable.container.querySelector('.take-review-inspector')?.textContent).toContain('Authored pedal exists')
    expect(unavailable.container.querySelector('.take-review-inspector')?.textContent).not.toContain('No authored pedal target')
    unavailable.close()
  })

  it('keeps unavailable Dynamics independent from ready Articulation', () => {
    const take = boundedTake()
    const expression = analyzeExpression({ normalizedScore: take.score, expectedPlan: take.plan, recording: take.recording, alignment: take.alignment, noteGrading: take.noteGrading })
    const mixedExpression = { ...expression, articulation: { ...expression.articulation, status: 'ready' as const, score: 0.82, reliability: 'limited' as const, unavailableReason: null, coverage: { authoredTargetCount: 1, analyzedTargetCount: 1, ratio: 1 } } }
    const view = renderInteractive(<TakeReview {...take} practiceSpeed={1} expressionAnalysis={{ status: 'ready', result: mixedExpression }} pedalAnalysis={{ status: 'idle' }} voicingAnalysis={{ status: 'idle' }} onConfirmRegion={noOp} onHighlightChange={noOp} />)
    view.click('.take-review-nav button', 'Dynamics')
    expect(view.container.querySelector('.take-review-inspector')?.textContent).toContain('Unavailable')
    expect(view.container.querySelector('.take-review-inspector')?.textContent).toContain('No authored dynamics')
    view.click('.take-review-nav button', 'Articulation')
    expect(view.container.querySelector('.take-review-inspector')?.textContent).toContain('82.0')
    view.close()
  })

  it('bounds problem-measure actions to five', () => {
    const plan = makePlan(Array.from({ length: 8 }, (_, index) => [60 + index]), { measureIndices: Array.from({ length: 8 }, (_, index) => index) })
    const recording = melodyRecording(Array.from({ length: 8 }, (_, index) => 72 + index), Array.from({ length: 8 }, (_, index) => index * 500))
    const alignment = alignPerformance(plan, recording, { localizationHint: { mode: 'confirmed', expectedStartIndex: 0, expectedEndIndex: 7 } })
    const notes = gradeNotes({ expectedPlan: plan, recording, alignment })
    const timing = analyzeTiming({ expectedPlan: plan, recording, alignment, noteGrading: notes })
    const results = buildPerformanceResults({ normalizedScore: makeScore(plan, 8, 1), expectedPlan: plan, alignment, noteGrading: notes, timingAnalysis: timing })

    expect(boundedProblemMeasures(results.measures)).toHaveLength(5)
  })

  it('gives localization intent a deterministic analysis identity that invalidates stale state', () => {
    const plan = makePlan([[60], [62], [64]])
    const recording = melodyRecording([60, 62, 64], [0, 500, 1_000])
    const score = makeScore(plan, 3, 1)
    const beginning = takeAnalysisPipelineKey(score, plan, recording, 1, { mode: 'beginning' })
    const automatic = takeAnalysisPipelineKey(score, plan, recording, 1, { mode: 'auto' })
    const sectionA = takeAnalysisPipelineKey(score, plan, recording, 1, { mode: 'section', scoreVersionId: 'sv', startMeasureIndex: 0, endMeasureIndex: 2, sourceMeasureIds: ['b', 'a'] })
    const sectionB = takeAnalysisPipelineKey(score, plan, recording, 1, { mode: 'section', scoreVersionId: 'sv', startMeasureIndex: 0, endMeasureIndex: 2, sourceMeasureIds: ['a', 'b'] })
    const confirmed = takeAnalysisPipelineKey(score, plan, recording, 1, { mode: 'confirmed', expectedStartIndex: 0, expectedEndIndex: 2 })

    expect(new Set([beginning, automatic, sectionA, confirmed])).toHaveLength(4)
    expect(sectionA).toBe(sectionB)
  })
})
