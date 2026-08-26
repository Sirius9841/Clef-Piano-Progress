import { compareTime, subtractTime, type MusicalTime } from '../musicxml/musicalTime'

export interface LocalTempoWindowAnchor {
  readonly id: string
  readonly position: MusicalTime
}

export interface LocalTempoWindowGeometry<TAnchor extends LocalTempoWindowAnchor> {
  readonly start: TAnchor
  readonly end: TAnchor
  readonly windowScoreDuration: MusicalTime
  readonly anchorCount: number
}

/**
 * Selects local-tempo windows from an ordered score-side anchor population.
 * TimingAnalysis and downstream opportunity accounting share this exact geometry.
 */
export function buildLocalTempoWindowGeometry<TAnchor extends LocalTempoWindowAnchor>(
  anchors: readonly TAnchor[],
  localTempoWindowBeats: MusicalTime,
  minimumTempoWindowAnchors: number,
): readonly LocalTempoWindowGeometry<TAnchor>[] {
  const windows: LocalTempoWindowGeometry<TAnchor>[] = []
  let startIndex = 0
  for (let endIndex = 1; endIndex < anchors.length; endIndex += 1) {
    while (
      startIndex + 1 < endIndex
      && endIndex - (startIndex + 1) + 1 >= minimumTempoWindowAnchors
      && compareTime(subtractTime(anchors[endIndex]!.position, anchors[startIndex + 1]!.position), localTempoWindowBeats) >= 0
    ) startIndex += 1
    const start = anchors[startIndex]!
    const end = anchors[endIndex]!
    const windowScoreDuration = subtractTime(end.position, start.position)
    if (endIndex - startIndex + 1 < minimumTempoWindowAnchors || compareTime(windowScoreDuration, localTempoWindowBeats) < 0) continue
    windows.push({ start, end, windowScoreDuration, anchorCount: endIndex - startIndex + 1 })
  }
  return windows
}
