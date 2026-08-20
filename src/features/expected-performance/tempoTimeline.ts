import { compareTime, subtractTime, timeToNumber, ZERO_TIME, type MusicalTime } from '../musicxml/musicalTime'
import type { TempoEvent } from '../musicxml/types'
import type { ExpectedPerformanceWarning, TempoTimeline, TempoTimelinePoint } from './types'

export interface TempoTimelineResult {
  timeline: TempoTimeline
  warnings: ExpectedPerformanceWarning[]
}

function assertPositiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} must be a positive finite number.`)
}

function positionKey(position: MusicalTime): string {
  return `${position.numerator}/${position.denominator}`
}

export function buildTempoTimeline(events: TempoEvent[], fallbackQuarterBpm: number): TempoTimelineResult {
  assertPositiveFinite(fallbackQuarterBpm, 'Fallback tempo')
  const warnings: ExpectedPerformanceWarning[] = []
  const ordered = events.map((event, sourceOrder) => ({ event, sourceOrder })).sort((left, right) =>
    compareTime(left.event.position, right.event.position) || left.sourceOrder - right.sourceOrder || left.event.id.localeCompare(right.event.id))
  const grouped = new Map<string, typeof ordered>()
  for (const item of ordered) {
    const key = positionKey(item.event.position)
    const group = grouped.get(key)
    if (group) group.push(item)
    else grouped.set(key, [item])
  }

  const authoredPoints: TempoTimelinePoint[] = []
  for (const group of grouped.values()) {
    const winner = group[group.length - 1]!
    const distinctTempos = new Set(group.map(({ event }) => event.quarterBpm))
    if (distinctTempos.size > 1) {
      warnings.push({
        code: 'CONFLICTING_TEMPO_EVENTS',
        severity: 'warning',
        position: winner.event.position,
        partId: winner.event.partId,
        message: `Conflicting tempo events share score position ${positionKey(winner.event.position)}; the last authored event deterministically takes precedence.`,
      })
    }
    authoredPoints.push({
      id: `tempo-point:${positionKey(winner.event.position)}:${winner.event.id}`,
      position: winner.event.position,
      quarterBpm: winner.event.quarterBpm,
      source: 'authored',
      sourceEventIds: group.map(({ event }) => event.id),
    })
  }

  const hasInitialAuthoredTempo = authoredPoints.some((point) => compareTime(point.position, ZERO_TIME) === 0)
  const points = [...authoredPoints]
  if (!hasInitialAuthoredTempo) {
    points.unshift({ id: `tempo-point:fallback:${fallbackQuarterBpm}`, position: ZERO_TIME, quarterBpm: fallbackQuarterBpm, source: 'fallback', sourceEventIds: [] })
    warnings.push({ code: 'MISSING_TEMPO_BEFORE_FIRST_EVENT', severity: 'info', position: ZERO_TIME, message: `No authored tempo begins the selected score; the explicit ${fallbackQuarterBpm} quarter-note BPM fallback is active.` })
  }
  points.sort((left, right) => compareTime(left.position, right.position) || (left.source === 'fallback' ? -1 : right.source === 'fallback' ? 1 : left.id.localeCompare(right.id)))
  return { timeline: { fallbackQuarterBpm, points, usesFallback: !hasInitialAuthoredTempo }, warnings }
}

export function durationBetweenScorePositionsToMilliseconds(
  start: MusicalTime,
  end: MusicalTime,
  timeline: TempoTimeline,
  speedMultiplier = 1,
): number {
  assertPositiveFinite(speedMultiplier, 'Practice speed')
  if (compareTime(start, ZERO_TIME) < 0 || compareTime(end, start) < 0) throw new RangeError('Score-time range must be ordered and non-negative.')
  if (timeline.points.length === 0) throw new RangeError('Tempo timeline must contain at least one point.')

  let elapsedMs = 0
  let cursor = start
  let activeTempo = timeline.points[0]!.quarterBpm
  for (const point of timeline.points) {
    if (compareTime(point.position, start) <= 0) {
      activeTempo = point.quarterBpm
      continue
    }
    if (compareTime(point.position, end) >= 0) break
    const segmentDuration = subtractTime(point.position, cursor)
    elapsedMs += timeToNumber(segmentDuration) * 60_000 / activeTempo
    cursor = point.position
    activeTempo = point.quarterBpm
  }
  elapsedMs += timeToNumber(subtractTime(end, cursor)) * 60_000 / activeTempo
  return elapsedMs / speedMultiplier
}

export function scoreTimeToMilliseconds(position: MusicalTime, timeline: TempoTimeline, speedMultiplier = 1): number {
  return durationBetweenScorePositionsToMilliseconds(ZERO_TIME, position, timeline, speedMultiplier)
}
