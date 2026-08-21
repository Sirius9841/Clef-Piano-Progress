import { describe, expect, it } from 'vitest'
import { buildScoreHighlightModel } from '../highlightModel'
import { adjacentMistakeId, createPerformanceResultsViewState, performanceResultsViewReducer, visibleMistakes } from '../viewState'
import { analyzeResult, makeResultPlan, recordingForPlan } from './fixtures'

function problemResults() {
  const plan = makeResultPlan(5, 3)
  return analyzeResult(plan, recordingForPlan(plan, (attack, index) => index === 2 ? { ...attack, midi: attack.midi + 2 } : index === 10 ? null : index >= 6 ? { ...attack, ms: attack.ms + 120 } : attack)).results
}

describe('performance results view state', () => {
  it('switches heatmap mode without losing the current score focus', () => {
    const results = problemResults()
    const initial = createPerformanceResultsViewState(results)
    const next = performanceResultsViewReducer(initial, { type: 'set-heatmap-mode', mode: 'rhythm' })

    expect(next.heatmapMode).toBe('rhythm')
    expect(next.selectedMeasureId).toBe(initial.selectedMeasureId)
  })

  it('selects a heatmap measure and clears a stale section and mistake selection', () => {
    const results = problemResults()
    const initial = createPerformanceResultsViewState(results)
    const measureId = results.measures.at(-1)!.id
    const next = performanceResultsViewReducer(initial, { type: 'select-measure', measureId })

    expect(next.selectedMeasureId).toBe(measureId)
    expect(next.selectedSectionId).toBeNull()
    expect(next.selectedMistakeId).toBeNull()
  })

  it('filters mistakes by independent dimension and initializes the first visible issue', () => {
    const results = problemResults()
    const rhythm = visibleMistakes(results, 'rhythm')
    expect(rhythm.every((mistake) => mistake.dimension === 'rhythm')).toBe(true)
    const next = performanceResultsViewReducer(createPerformanceResultsViewState(results), { type: 'set-mistake-filter', filter: 'rhythm', firstVisibleMistakeId: rhythm[0]?.id ?? null, firstVisibleMeasureId: rhythm[0]?.measureResultId ?? null })

    expect(next.mistakeFilter).toBe('rhythm')
    expect(next.selectedMistakeId).toBe(rhythm[0]?.id ?? null)
  })

  it('navigates mistakes in deterministic musical order and wraps at either end', () => {
    const results = problemResults()
    const visible = visibleMistakes(results, 'all')
    expect(visible.length).toBeGreaterThan(1)
    const state = { ...createPerformanceResultsViewState(results), selectedMistakeId: visible.at(-1)!.id }

    expect(adjacentMistakeId(results, state, 1)).toBe(visible[0]!.id)
    expect(adjacentMistakeId(results, { ...state, selectedMistakeId: visible[0]!.id }, -1)).toBe(visible.at(-1)!.id)
  })

  it('turns section review into one coherent measure-range highlight', () => {
    const results = problemResults()
    const section = results.sections[0]!
    const state = performanceResultsViewReducer(createPerformanceResultsViewState(results), { type: 'select-section', sectionId: section.id, firstMeasureId: section.measureResultIds[0]!, firstMistakeId: section.mistakeIds[0] ?? null })
    const model = buildScoreHighlightModel(results, { measureResultIds: section.measureResultIds, mistakeId: state.selectedMistakeId })

    expect(model.selectedMeasureResultIds).toEqual(section.measureResultIds)
    expect(model.measures.filter((measure) => measure.selected).map((measure) => measure.measureResultId)).toEqual(section.measureResultIds)
  })

  it('highlights only problems at note level, never correct notes', () => {
    const results = problemResults()
    const model = buildScoreHighlightModel(results)
    const problemSourceIds = new Set(results.mistakes.filter((mistake) => mistake.type === 'wrong-pitch' || mistake.type === 'missed').flatMap((mistake) => mistake.sourceNoteIds))

    expect(model.sourceNotes.length).toBe(problemSourceIds.size)
    expect(model.sourceNotes.every((note) => problemSourceIds.has(note.sourceNoteId))).toBe(true)
  })
})
