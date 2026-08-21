import type { HeatmapMode, PerformanceResults, ResultDimension } from './types'

export type MistakeFilter = 'all' | ResultDimension

export interface PerformanceResultsViewState {
  readonly heatmapMode: HeatmapMode
  readonly mistakeFilter: MistakeFilter
  readonly selectedMeasureId: string | null
  readonly selectedSectionId: string | null
  readonly selectedMistakeId: string | null
}

export type PerformanceResultsViewAction =
  | { type: 'set-heatmap-mode'; mode: HeatmapMode }
  | { type: 'set-mistake-filter'; filter: MistakeFilter; firstVisibleMistakeId: string | null; firstVisibleMeasureId: string | null }
  | { type: 'select-measure'; measureId: string }
  | { type: 'select-section'; sectionId: string; firstMeasureId: string; firstMistakeId: string | null }
  | { type: 'select-mistake'; mistakeId: string; measureId: string | null }

export function createPerformanceResultsViewState(results: PerformanceResults): PerformanceResultsViewState {
  const firstSection = results.weakestSections[0] ?? results.strongestSections[0] ?? null
  const firstMeasure = firstSection ? results.measures.find((measure) => firstSection.measureResultIds.includes(measure.id)) : results.measures.find((measure) => measure.analysisState === 'analyzed')
  const firstMistake = results.mistakes.find((mistake) => mistake.measureResultId === firstMeasure?.id) ?? results.mistakes[0] ?? null
  return {
    heatmapMode: 'practice-priority',
    mistakeFilter: 'all',
    selectedMeasureId: firstMistake?.measureResultId ?? firstMeasure?.id ?? null,
    selectedSectionId: firstSection?.id ?? null,
    selectedMistakeId: firstMistake?.id ?? null,
  }
}

export function performanceResultsViewReducer(state: PerformanceResultsViewState, action: PerformanceResultsViewAction): PerformanceResultsViewState {
  if (action.type === 'set-heatmap-mode') return { ...state, heatmapMode: action.mode }
  if (action.type === 'set-mistake-filter') return { ...state, mistakeFilter: action.filter, selectedMistakeId: action.firstVisibleMistakeId, selectedMeasureId: action.firstVisibleMeasureId ?? state.selectedMeasureId, selectedSectionId: null }
  if (action.type === 'select-measure') return { ...state, selectedMeasureId: action.measureId, selectedSectionId: null, selectedMistakeId: null }
  if (action.type === 'select-section') return { ...state, selectedSectionId: action.sectionId, selectedMeasureId: action.firstMeasureId, selectedMistakeId: action.firstMistakeId }
  return { ...state, selectedMistakeId: action.mistakeId, selectedMeasureId: action.measureId ?? state.selectedMeasureId, selectedSectionId: null }
}

export function visibleMistakes(results: PerformanceResults, filter: MistakeFilter) {
  return filter === 'all' ? results.mistakes : results.mistakes.filter((mistake) => mistake.dimension === filter)
}

export function adjacentMistakeId(results: PerformanceResults, state: PerformanceResultsViewState, direction: -1 | 1): string | null {
  const visible = visibleMistakes(results, state.mistakeFilter)
  if (visible.length === 0) return null
  const current = visible.findIndex((mistake) => mistake.id === state.selectedMistakeId)
  const next = current < 0 ? 0 : (current + direction + visible.length) % visible.length
  return visible[next]!.id
}
