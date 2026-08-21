import type { PerformanceResults } from './types'

export type ScoreHighlightKind = 'wrong-pitch' | 'missed' | 'rhythm-issue' | 'tempo-region' | 'additional-marker'

export interface SourceNoteHighlight {
  readonly sourceNoteId: string
  readonly kind: 'wrong-pitch' | 'missed'
  readonly mistakeIds: readonly string[]
  readonly selected: boolean
}

export interface ScoreMeasureHighlight {
  readonly sourceMeasureIds: readonly string[]
  readonly measureResultId: string
  readonly displayMeasureNumber: string
  readonly kinds: readonly ScoreHighlightKind[]
  readonly mistakeIds: readonly string[]
  readonly selected: boolean
}

export interface ScoreHighlightModel {
  readonly resultId: string
  readonly focusKey: string
  readonly selectedMistakeId: string | null
  readonly selectedMeasureResultIds: readonly string[]
  readonly sourceNotes: readonly SourceNoteHighlight[]
  readonly measures: readonly ScoreMeasureHighlight[]
}

export interface ScoreHighlightSelection {
  readonly measureResultIds?: readonly string[]
  readonly mistakeId?: string | null
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)]
}

function highlightKind(type: PerformanceResults['mistakes'][number]['type']): ScoreHighlightKind {
  if (type === 'wrong-pitch') return 'wrong-pitch'
  if (type === 'missed') return 'missed'
  if (type === 'additional') return 'additional-marker'
  if (type === 'timing-early' || type === 'timing-late') return 'rhythm-issue'
  return 'tempo-region'
}

export function buildScoreHighlightModel(results: PerformanceResults, selection: ScoreHighlightSelection = {}): ScoreHighlightModel {
  const selectedMistake = selection.mistakeId ? results.mistakes.find((mistake) => mistake.id === selection.mistakeId) ?? null : null
  const selectedMeasureResultIds = unique([
    ...(selection.measureResultIds ?? []),
    ...(selectedMistake?.measureResultId ? [selectedMistake.measureResultId] : []),
  ])
  const noteHighlights = new Map<string, { kind: 'wrong-pitch' | 'missed'; mistakeIds: string[]; selected: boolean }>()
  const mistakesByMeasure = new Map<string, PerformanceResults['mistakes'][number][]>()
  for (const mistake of results.mistakes) {
    if (mistake.measureResultId) {
      const measureMistakes = mistakesByMeasure.get(mistake.measureResultId)
      if (measureMistakes) measureMistakes.push(mistake)
      else mistakesByMeasure.set(mistake.measureResultId, [mistake])
    }
    if (mistake.type !== 'wrong-pitch' && mistake.type !== 'missed') continue
    for (const sourceNoteId of mistake.sourceNoteIds) {
      const current = noteHighlights.get(sourceNoteId)
      if (current) {
        current.mistakeIds.push(mistake.id)
        current.selected ||= mistake.id === selectedMistake?.id
        if (mistake.type === 'wrong-pitch') current.kind = 'wrong-pitch'
      } else noteHighlights.set(sourceNoteId, { kind: mistake.type, mistakeIds: [mistake.id], selected: mistake.id === selectedMistake?.id })
    }
  }
  const measures = results.measures.flatMap((measure): ScoreMeasureHighlight[] => {
    const measureMistakes = mistakesByMeasure.get(measure.id) ?? []
    const selected = selectedMeasureResultIds.includes(measure.id)
    if (!selected && measureMistakes.length === 0) return []
    return [{
      sourceMeasureIds: [...measure.sourceMeasureIds],
      measureResultId: measure.id,
      displayMeasureNumber: measure.displayMeasureNumber,
      kinds: unique(measureMistakes.map((mistake) => highlightKind(mistake.type))),
      mistakeIds: measureMistakes.map((mistake) => mistake.id),
      selected,
    }]
  })
  return {
    resultId: results.id,
    focusKey: `${results.id}:${selectedMeasureResultIds.join(',')}:${selectedMistake?.id ?? 'none'}`,
    selectedMistakeId: selectedMistake?.id ?? null,
    selectedMeasureResultIds,
    sourceNotes: [...noteHighlights.entries()].map(([sourceNoteId, value]) => ({ sourceNoteId, kind: value.kind, mistakeIds: unique(value.mistakeIds), selected: value.selected })),
    measures,
  }
}
