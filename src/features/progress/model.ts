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

export interface RollingMetric {
  readonly metric: ProgressMetric
  readonly currentAverage: number | null
  readonly previousAverage: number | null
  readonly change: number | null
  readonly currentCount: number
  readonly previousCount: number
  readonly windowSize: 5
}

const METRICS: readonly ProgressMetric[] = ['notes', 'rhythm', 'tempo']

function average(values: readonly number[]): number | null {
  return values.length === 0 ? null : values.reduce((total, value) => total + value, 0) / values.length
}

export function isHeadlineComparable(attempt: AttemptSummary): boolean {
  return attempt.gradingScope === 'full-plan' && attempt.reliability !== 'unavailable'
}

export function comparableAttemptKey(attempt: AttemptSummary): string {
  return `${attempt.arrangementId}|${attempt.scoreVersionId}|${attempt.gradingScope}|${attempt.practiceSpeedMultiplier}`
}

export function comparableAttempts(attempt: AttemptSummary, history: readonly AttemptSummary[]): readonly AttemptSummary[] {
  const key = comparableAttemptKey(attempt)
  return history.filter((candidate) => isHeadlineComparable(candidate) && comparableAttemptKey(candidate) === key)
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
      windowSize: 5,
    }
  })
}

export function formatPercent(value: number | null): string {
  return value === null ? '—' : `${Math.round(value * 100)}%`
}
