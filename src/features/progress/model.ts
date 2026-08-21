import type { AttemptSummary } from '../persistence/types'

export type ProgressMetric = 'notes' | 'rhythm' | 'tempo'

export interface PersonalBest {
  readonly metric: ProgressMetric
  readonly value: number
  readonly attemptId: string
  readonly performedAt: string
}

export interface PersonalBestEvent {
  readonly metric: ProgressMetric
  readonly kind: 'first-full-result' | 'new-personal-best'
  readonly value: number
  readonly previousValue: number | null
}

export interface PersonalBestHistoryEvent extends PersonalBestEvent {
  readonly attemptId: string
  readonly performedAt: string
}

export interface RollingMetric {
  readonly metric: ProgressMetric
  readonly currentAverage: number | null
  readonly previousAverage: number | null
  readonly change: number | null
  readonly currentCount: number
  readonly previousCount: number
  readonly windowSize: number
}

export interface MetricSeriesPoint {
  readonly index: number
  readonly value: number
}

const METRICS: readonly ProgressMetric[] = ['notes', 'rhythm', 'tempo']

function average(values: readonly number[]): number | null {
  return values.length === 0 ? null : values.reduce((total, value) => total + value, 0) / values.length
}

export function isHeadlineComparable(attempt: AttemptSummary): boolean {
  return attempt.gradingScope === 'full-plan' && (attempt.reliability === 'reliable' || attempt.reliability === 'limited')
}

export function comparableAttemptKey(attempt: AttemptSummary): string {
  return `${attempt.arrangementId}|${attempt.scoreVersionId}|${attempt.gradingScope}|${attempt.practiceSpeedMultiplier}`
}

export function comparableAttempts(attempt: AttemptSummary, history: readonly AttemptSummary[]): readonly AttemptSummary[] {
  const key = comparableAttemptKey(attempt)
  return history.filter((candidate) => isHeadlineComparable(candidate) && comparableAttemptKey(candidate) === key)
}

export function selectLatestHeadlineAttempt(attempts: readonly AttemptSummary[]): AttemptSummary | null {
  return [...attempts].filter(isHeadlineComparable).sort((left, right) => right.performedAt.localeCompare(left.performedAt) || left.id.localeCompare(right.id))[0] ?? null
}

export function detectPersonalBestEvents(next: AttemptSummary, history: readonly AttemptSummary[]): readonly PersonalBestEvent[] {
  if (!isHeadlineComparable(next)) return []
  const prior = comparableAttempts(next, history).filter((candidate) => candidate.id !== next.id)
  return METRICS.flatMap((metric): PersonalBestEvent[] => {
    const value = next[metric]
    if (value === null) return []
    const previousValues = prior.map((candidate) => candidate[metric]).filter((candidate): candidate is number => candidate !== null)
    if (previousValues.length === 0) return [{ metric, kind: 'first-full-result', value, previousValue: null }]
    const previousValue = Math.max(...previousValues)
    return value > previousValue ? [{ metric, kind: 'new-personal-best', value, previousValue }] : []
  })
}

export function derivePersonalBestHistory(attempts: readonly AttemptSummary[]): readonly PersonalBestHistoryEvent[] {
  const ordered = [...attempts].filter(isHeadlineComparable).sort((left, right) => left.performedAt.localeCompare(right.performedAt) || left.id.localeCompare(right.id))
  const bestByContext = new Map<string, Partial<Record<ProgressMetric, number>>>()
  const events: PersonalBestHistoryEvent[] = []
  ordered.forEach((attempt) => {
    const key = comparableAttemptKey(attempt)
    const best = bestByContext.get(key) ?? {}
    METRICS.forEach((metric) => {
      const value = attempt[metric]
      if (value === null) return
      const previousValue = best[metric]
      if (previousValue === undefined || value > previousValue) {
        events.push({
          attemptId: attempt.id,
          performedAt: attempt.performedAt,
          metric,
          kind: previousValue === undefined ? 'first-full-result' : 'new-personal-best',
          value,
          previousValue: previousValue ?? null,
        })
        best[metric] = value
      }
    })
    bestByContext.set(key, best)
  })
  return events
}

export function derivePersonalBests(attempts: readonly AttemptSummary[]): readonly PersonalBest[] {
  const fullAttempts = attempts.filter(isHeadlineComparable)
  return METRICS.flatMap((metric): PersonalBest[] => {
    const candidates = fullAttempts.filter((attempt): attempt is AttemptSummary & Record<typeof metric, number> => attempt[metric] !== null)
    const best = candidates.sort((left, right) => right[metric] - left[metric] || right.performedAt.localeCompare(left.performedAt) || left.id.localeCompare(right.id))[0]
    return best ? [{ metric, value: best[metric], attemptId: best.id, performedAt: best.performedAt }] : []
  })
}

export function deriveRollingMetrics(attempts: readonly AttemptSummary[], windowSize = 5): readonly RollingMetric[] {
  const ordered = [...attempts].filter(isHeadlineComparable).sort((left, right) => right.performedAt.localeCompare(left.performedAt) || left.id.localeCompare(right.id))
  return METRICS.map((metric) => {
    const values = ordered.map((attempt) => attempt[metric]).filter((value): value is number => value !== null)
    const current = values.slice(0, windowSize)
    const previous = values.slice(windowSize, windowSize * 2)
    const currentAverage = average(current)
    const previousAverage = average(previous)
    return {
      metric,
      currentAverage,
      previousAverage,
      change: currentAverage === null || previousAverage === null ? null : currentAverage - previousAverage,
      currentCount: current.length,
      previousCount: previous.length,
      windowSize,
    }
  })
}

export function metricSeriesSegments(attempts: readonly AttemptSummary[], metric: ProgressMetric): readonly (readonly MetricSeriesPoint[])[] {
  const segments: MetricSeriesPoint[][] = []
  let current: MetricSeriesPoint[] = []
  attempts.forEach((attempt, index) => {
    const value = attempt[metric]
    if (value === null) {
      if (current.length > 0) segments.push(current)
      current = []
      return
    }
    current.push({ index, value })
  })
  if (current.length > 0) segments.push(current)
  return segments
}

export function formatPercent(value: number | null): string {
  return value === null ? '—' : `${Math.round(value * 100)}%`
}
