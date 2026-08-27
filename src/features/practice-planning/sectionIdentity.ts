import type { SectionResult } from '../performance-results/types'
import type { PlanningSectionIdentity } from './types'

export function canonicalSourceMeasureIds(sourceMeasureIds: readonly string[]): readonly string[] {
  return [...new Set(sourceMeasureIds)].sort((left, right) => left.localeCompare(right))
}

export function createPlanningSectionIdentity(scoreVersionId: string, section: Pick<SectionResult, 'startMeasureIndex' | 'endMeasureIndex' | 'sourceMeasureIds' | 'displayRange'>): PlanningSectionIdentity {
  const sourceMeasureIds = canonicalSourceMeasureIds(section.sourceMeasureIds)
  if (!scoreVersionId.trim() || !Number.isInteger(section.startMeasureIndex) || !Number.isInteger(section.endMeasureIndex) || section.startMeasureIndex < 0 || section.endMeasureIndex < section.startMeasureIndex || sourceMeasureIds.length === 0 || sourceMeasureIds.some((id) => !id.trim())) {
    throw new RangeError('Section identity requires an exact ScoreVersion, ordered measure indexes, and canonical source measure IDs.')
  }
  return {
    id: JSON.stringify([scoreVersionId, section.startMeasureIndex, section.endMeasureIndex, sourceMeasureIds]),
    scoreVersionId,
    startMeasureIndex: section.startMeasureIndex,
    endMeasureIndex: section.endMeasureIndex,
    sourceMeasureIds,
    displayRange: section.displayRange,
  }
}

export function sectionOverlapRatio(left: PlanningSectionIdentity, right: PlanningSectionIdentity): number {
  if (left.scoreVersionId !== right.scoreVersionId) return 0
  const overlap = Math.max(0, Math.min(left.endMeasureIndex, right.endMeasureIndex) - Math.max(left.startMeasureIndex, right.startMeasureIndex) + 1)
  if (overlap === 0) return 0
  const leftLength = left.endMeasureIndex - left.startMeasureIndex + 1
  const rightLength = right.endMeasureIndex - right.startMeasureIndex + 1
  return overlap / Math.min(leftLength, rightLength)
}
