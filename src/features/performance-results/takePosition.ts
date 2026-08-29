import type { MatchedTakeRegion } from '../alignment/types'

export interface TakePositionView {
  readonly matchedMeasureRange: {
    readonly startIndex: number
    readonly endIndex: number
    readonly indices: readonly number[]
    readonly displayNumbers: readonly string[]
    readonly displayRange: string
  }
  readonly expectedGroupRange: {
    readonly startIndex: number
    readonly endIndex: number
    readonly startGroupId: string
    readonly endGroupId: string
  }
  readonly performedGroupRange: {
    readonly startIndex: number
    readonly endIndex: number
    readonly startGroupId: string
    readonly endGroupId: string
  }
  readonly currentMeasureIndex: number | null
  readonly currentPerformedGroupIndex: number | null
  readonly currentPerformedGroupId: string | null
}

export interface CurrentTakePosition {
  readonly measureIndex?: number | null
  readonly performedGroupIndex?: number | null
  readonly performedGroupId?: string | null
}

function deepFreeze(view: TakePositionView): TakePositionView {
  Object.freeze(view.matchedMeasureRange.indices)
  Object.freeze(view.matchedMeasureRange.displayNumbers)
  Object.freeze(view.matchedMeasureRange)
  Object.freeze(view.expectedGroupRange)
  Object.freeze(view.performedGroupRange)
  return Object.freeze(view)
}

/**
 * Application-owned adapter for Take Review and a future score follower. UI
 * consumers receive stable range/current-position facts without traversing an
 * AlignmentResult or interpreting correspondence steps themselves.
 */
export function buildTakePositionView(region: MatchedTakeRegion, current: CurrentTakePosition = {}): TakePositionView {
  return deepFreeze({
    matchedMeasureRange: {
      startIndex: region.measureIndices[0] ?? 0,
      endIndex: region.measureIndices.at(-1) ?? region.measureIndices[0] ?? 0,
      indices: [...region.measureIndices],
      displayNumbers: [...region.measureNumbers],
      displayRange: region.displayRange,
    },
    expectedGroupRange: {
      startIndex: region.expectedStartIndex,
      endIndex: region.expectedEndIndex,
      startGroupId: region.expectedStartGroupId,
      endGroupId: region.expectedEndGroupId,
    },
    performedGroupRange: {
      startIndex: region.performedStartIndex,
      endIndex: region.performedEndIndex,
      startGroupId: region.performedStartGroupId,
      endGroupId: region.performedEndGroupId,
    },
    currentMeasureIndex: current.measureIndex ?? null,
    currentPerformedGroupIndex: current.performedGroupIndex ?? null,
    currentPerformedGroupId: current.performedGroupId ?? null,
  })
}
