import type { ScoreRegionCandidate } from '../alignment/types'
import type { MeasureResult, ResultDimension } from './types'

export type TakeReviewDimension = 'overview' | ResultDimension | 'dynamics' | 'articulation' | 'pedal' | 'voicing'

export interface TakeReviewInteractionState {
  readonly dimension: TakeReviewDimension
  readonly selectedMeasureId: string | null
}

export type TakeReviewInteractionAction =
  | Readonly<{ type: 'select-dimension'; dimension: TakeReviewDimension }>
  | Readonly<{ type: 'select-measure'; measureId: string; allowedMeasureIds: readonly string[] }>

export const INITIAL_TAKE_REVIEW_INTERACTION: TakeReviewInteractionState = Object.freeze({ dimension: 'overview', selectedMeasureId: null })

export function takeReviewInteractionReducer(state: TakeReviewInteractionState, action: TakeReviewInteractionAction): TakeReviewInteractionState {
  if (action.type === 'select-dimension') return { ...state, dimension: action.dimension }
  return action.allowedMeasureIds.includes(action.measureId) ? { ...state, selectedMeasureId: action.measureId } : state
}

export function boundedProblemMeasures(measures: readonly MeasureResult[]): readonly MeasureResult[] {
  return [...measures]
    .filter((measure) => measure.analysisState === 'analyzed' && measure.mainIssues.length > 0)
    .sort((left, right) => (right.practicePriority.confidenceAdjustedPriority ?? -1) - (left.practicePriority.confidenceAdjustedPriority ?? -1) || left.measureIndex - right.measureIndex)
    .slice(0, 5)
}

export function confirmTakeRegionCandidate(candidate: ScoreRegionCandidate, onConfirm: (selected: ScoreRegionCandidate) => void): void {
  onConfirm(candidate)
}
