import { Activity, CalendarRange, Clock3, Music2, TrendingUp } from 'lucide-react'
import { useState } from 'react'
import { PageHeader, SectionHeading, Stat, StatusPill } from '../components/ui'
import { useRepositoryQuery } from '../features/persistence/PersistenceContext'
import { PersistenceErrorState } from '../features/persistence/PersistenceErrorState'
import type { ProgressRange } from '../features/persistence/types'
import { comparableAttemptKey, deriveRollingMetrics, formatPercent } from '../features/progress/model'

function formatDuration(milliseconds: number): string {
  const minutes = Math.round(milliseconds / 60_000)
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

export function ProgressPage() {
  const [range, setRange] = useState<ProgressRange>('30d')
  const state = useRepositoryQuery((repository) => repository.getProgress(range), `progress:${range}`)
  const snapshot = state.status === 'ready' ? state.data : null
  const latestFull = snapshot?.attempts.find((attempt) => attempt.gradingScope === 'full-plan')
  const comparable = latestFull && snapshot
    ? snapshot.attempts.filter((attempt) => comparableAttemptKey(attempt) === comparableAttemptKey(latestFull))
    : []
  const rolling = deriveRollingMetrics(comparable)
  const chartAttempts = [...comparable].reverse().slice(-12)
  const notePoints = chartAttempts.map((attempt, index) => `${chartAttempts.length === 1 ? 50 : 5 + index / (chartAttempts.length - 1) * 90},${95 - (attempt.notes ?? 0) * 80}`).join(' ')

  return (
    <div className="page">
      <PageHeader eyebrow="Long-term view" title="Progress" description="Real practice volume and comparable Notes, Rhythm, and Tempo trends." action={<div className="filter-tabs progress-range"><CalendarRange size={16} />{(['7d', '30d', 'all'] as const).map((value) => <button className={range === value ? 'active' : ''} onClick={() => setRange(value)} key={value}>{value === '7d' ? '7 days' : value === '30d' ? '30 days' : 'All time'}</button>)}</div>} />
      {state.status === 'loading' && <div className="route-loader"><strong>Calculating local progress…</strong></div>}
      {state.status === 'error' && <PersistenceErrorState title="Progress could not be calculated" error={state.error} />}
      {snapshot && <>
        <div className="progress-stat-grid reveal delay-1"><div className="panel progress-primary"><div><span>Practice time</span><strong>{formatDuration(snapshot.practiceTimeMs)}</strong><small>Sum of completed sessions, never multiplied by attempts</small></div></div><Stat icon={Music2} label="Attempts" value={`${snapshot.attemptCount}`} detail={`${snapshot.sessionCount} sessions`} /><Stat icon={Activity} label="Active days" value={`${snapshot.activeDays}`} detail="Based on real session dates" /><Stat icon={Clock3} label="Latest tempo" value={formatPercent(snapshot.attempts[0]?.tempo ?? null)} detail={snapshot.attempts[0] ? `${Math.round(snapshot.attempts[0].practiceSpeedMultiplier * 100)}% speed` : 'No saved attempt'} /></div>
        {snapshot.attemptCount === 0 ? <div className="empty-state"><TrendingUp /><h2>No saved results in this range</h2><p>Complete an analysis and choose Save attempt in Practice to build a history.</p></div> : <section className="progress-content-grid reveal delay-2">
          <div className="panel history-panel"><SectionHeading title="Comparable Notes trend" subtitle={latestFull ? `Same arrangement, ScoreVersion, full-score scope, and ${Math.round(latestFull.practiceSpeedMultiplier * 100)}% speed` : 'A full-score result is needed for headline trends'} />{chartAttempts.length ? <div className="history-chart compact"><svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Comparable note score trend"><polyline points={notePoints} fill="none" stroke="#9ce3c1" strokeWidth="2" vectorEffect="non-scaling-stroke" /></svg><div className="chart-labels"><span>{formatPercent(chartAttempts[0]?.notes ?? null)}<small>earliest</small></span><span>{formatPercent(chartAttempts.at(-1)?.notes ?? null)}<small>latest</small></span></div></div> : <div className="take-empty">Partial results remain in history but do not create headline personal-best or rolling-trend claims.</div>}</div>
          <div className="panel consistency-panel"><SectionHeading title="Rolling comparison" subtitle="Current last 5 comparable attempts versus the previous 5" /><div className="rolling-metrics">{rolling.map((metric) => <article key={metric.metric}><span>{metric.metric}</span><strong>{formatPercent(metric.currentAverage)}</strong><small>{metric.currentCount} current · {metric.previousCount} previous</small><StatusPill tone={metric.change !== null && metric.change > 0 ? 'positive' : 'neutral'}>{metric.change === null ? 'Needs prior window' : `${metric.change >= 0 ? '+' : ''}${(metric.change * 100).toFixed(1)} pts`}</StatusPill></article>)}</div></div>
        </section>}
      </>}
    </div>
  )
}
