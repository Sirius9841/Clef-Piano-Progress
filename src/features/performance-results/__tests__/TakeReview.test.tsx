import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { alignPerformance } from '../../alignment/alignPerformance'
import { makePlan, melodyRecording } from '../../alignment/__tests__/fixtures'
import { gradeNotes } from '../../note-grading/gradeNotes'
import { analyzeTiming } from '../../timing-analysis/analyzeTiming'
import { buildPerformanceResults } from '../buildPerformanceResults'
import { TakeReview } from '../TakeReview'
import { boundedProblemMeasures, confirmTakeRegionCandidate, INITIAL_TAKE_REVIEW_INTERACTION, takeReviewInteractionReducer } from '../takeReviewInteraction'
import { takeAnalysisPipelineKey } from '../useTakeAnalysisPipeline'
import { makeScore } from './fixtures'

const noOp = () => undefined
const source = readFileSync(new URL('../TakeReview.tsx', import.meta.url), 'utf8')

function boundedTake() {
  const plan = makePlan(Array.from({ length: 8 }, (_, index) => [60 + index]), { measureIndices: Array.from({ length: 8 }, (_, index) => index) })
  const recording = melodyRecording([60, 61, 62, 63], [0, 500, 1_000, 1_500])
  const alignment = alignPerformance(plan, recording, { localizationHint: { mode: 'beginning' } })
  const noteGrading = gradeNotes({ expectedPlan: plan, recording, alignment })
  const timingAnalysis = analyzeTiming({ expectedPlan: plan, recording, alignment, noteGrading })
  const results = buildPerformanceResults({ normalizedScore: makeScore(plan, 8, 1), expectedPlan: plan, alignment, noteGrading, timingAnalysis })
  return { recording, alignment, results }
}

describe('TakeReview', () => {
  it('shows the matched range and maps only localized measures with independent core dimensions', () => {
    const take = boundedTake()
    const html = renderToStaticMarkup(<TakeReview {...take} practiceSpeed={1} expression={null} pedal={null} voicing={null} onConfirmRegion={noOp} onHighlightChange={noOp} />)

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

  it('shows competing repeated regions and confirmation controls without headline grades', () => {
    const pattern = [[60], [62], [64], [65]]
    const plan = makePlan([...pattern, [80], [81], ...pattern])
    const recording = melodyRecording([60, 62, 64, 65], [0, 500, 1_000, 1_500])
    const alignment = alignPerformance(plan, recording, { localizationHint: { mode: 'auto' } })
    const html = renderToStaticMarkup(<TakeReview alignment={alignment} recording={recording} practiceSpeed={1} results={null} expression={null} pedal={null} voicing={null} onConfirmRegion={noOp} onHighlightChange={noOp} />)

    expect(html).toContain('Score region unresolved')
    expect(html).toContain('Candidate A')
    expect(html).toContain('Confirm this region')
    expect(html).toContain('remain unavailable until the score region is resolved')
    expect(html).not.toContain('Independent core dimensions')
  })

  it('keeps seven dimensions independent and compactly names unavailable Pedal and Voicing truth', () => {
    for (const label of ['Notes', 'Rhythm', 'Tempo', 'Dynamics', 'Articulation', 'Pedal', 'Voicing']) expect(source).toContain(`label: '${label}'`)
    expect(source).toContain('CC64 activity captured')
    expect(source).toContain('no authored pedal target in this score')
    expect(source).toContain('Not configured · explicit foreground/support intent is required')
    expect(source).not.toContain('Expression score')
    expect(source).not.toContain('Overall Performance Score')
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

  it('confirms the exact ambiguity candidate selected by the user', () => {
    const pattern = [[60], [62], [64], [65]]
    const alignment = alignPerformance(makePlan([...pattern, [80], [81], ...pattern]), melodyRecording([60, 62, 64, 65], [0, 500, 1_000, 1_500]))
    const candidate = alignment.localization!.candidates[1]!
    let confirmed: typeof candidate | null = null

    confirmTakeRegionCandidate(candidate, (selected) => { confirmed = selected })

    expect(confirmed).toBe(candidate)
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
