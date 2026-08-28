import { Activity, CalendarRange, Clock3, Music2, TrendingUp } from 'lucide-react'
import { useState } from 'react'
import { PageHeader, SectionHeading, Stat, StatusPill } from '../components/ui'
import { SkillRatingsPanel } from '../components/Phase13Panels'
import { useRepositoryQuery } from '../features/persistence/PersistenceContext'
import { PersistenceErrorState } from '../features/persistence/PersistenceErrorState'
import type { ProgressRange, ProgressSnapshot } from '../features/persistence/types'
import { comparableAttemptKey, deriveRollingMetrics, formatPercent, metricSeriesSegments, selectLatestHeadlineAttempt } from '../features/progress/model'
import { deriveAllSkillRatings } from '../features/skill-model'
import type { SkillRating } from '../features/skill-model'
import { deriveArrangementMastery, type ArrangementMastery } from '../features/mastery-model'
import type { AttemptSummary, RepertoireListItem } from '../features/persistence/types'

interface ProgressPageData {
  readonly snapshot: ProgressSnapshot
  readonly skills: readonly SkillRating[]
  readonly mastery: readonly { readonly item: RepertoireListItem; readonly value: ArrangementMastery }[]
}

function formatDuration(milliseconds: number): string {
  const minutes = Math.round(milliseconds / 60_000)
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

export function ProgressPage() {
  const [range, setRange] = useState<ProgressRange>('30d')
  const state = useRepositoryQuery<ProgressPageData>(async (repository) => {
    const asOf = new Date().toISOString()
    const [snapshot, techniqueSummaries, repertoire, attempts] = await Promise.all([repository.getProgress(range), repository.listTechniqueAttemptSummaries(), repository.listRepertoire(), repository.listAttemptSummaries()])
    return { snapshot, skills: deriveAllSkillRatings(techniqueSummaries, asOf), mastery: repertoire.map((item) => ({ item, value: deriveArrangementMastery({ arrangementId: item.arrangement.id, scoreVersionId: item.scoreVersion.id, attempts: attempts.filter((attempt: AttemptSummary) => attempt.arrangementId === item.arrangement.id), asOf }) })) }
  }, `progress:${range}`)
  const snapshot = state.status === 'ready' ? state.data.snapshot : null
  const skills = state.status === 'ready' ? state.data.skills : []
  const mastery = state.status === 'ready' ? state.data.mastery : []
  const latestFull = selectLatestHeadlineAttempt(snapshot?.attempts ?? [])
  const comparable = latestFull && snapshot
    ? snapshot.attempts.filter((attempt) => comparableAttemptKey(attempt) === comparableAttemptKey(latestFull))
    : []
  const rolling = deriveRollingMetrics(comparable)
  const chartAttempts = [...comparable].reverse().slice(-12)
  const noteSegments = metricSeriesSegments(chartAttempts, 'notes')
  const chartPoint = ({ index, value }: { index: number; value: number }) => ({ x: chartAttempts.length === 1 ? 50 : 5 + index / (chartAttempts.length - 1) * 90, y: 95 - value * 80 })

  return (
    <div className="page">
      <PageHeader eyebrow="Long-term view" title="Progress" description="Real practice volume and comparable Notes, Rhythm, and Tempo trends." action={<div className="filter-tabs progress-range"><CalendarRange size={16} />{(['7d', '30d', 'all'] as const).map((value) => <button className={range === value ? 'active' : ''} onClick={() => setRange(value)} key={value}>{value === '7d' ? '7 days' : value === '30d' ? '30 days' : 'All time'}</button>)}</div>} />
      {state.status === 'loading' && <div className="route-loader"><strong>Calculating local progress…</strong></div>}
      {state.status === 'error' && <PersistenceErrorState title="Progress could not be calculated" error={state.error} />}
      {snapshot && <>
        <div className="progress-stat-grid reveal delay-1"><div className="panel progress-primary"><div><span>Practice time</span><strong>{formatDuration(snapshot.practiceTimeMs)}</strong><small>Sum of completed sessions, never multiplied by attempts</small></div></div><Stat icon={Music2} label="Attempts" value={`${snapshot.attemptCount}`} detail={`${snapshot.sessionCount} sessions`} /><Stat icon={Activity} label="Active days" value={`${snapshot.activeDays}`} detail="Based on local calendar dates" /><Stat icon={Clock3} label="Latest comparable tempo" value={formatPercent(latestFull?.tempo ?? null)} detail={latestFull ? `${Math.round(latestFull.practiceSpeedMultiplier * 100)}% speed` : 'No reliable or limited full-score result'} /></div>
        {snapshot.attemptCount === 0 ? <div className="empty-state"><TrendingUp /><h2>No saved results in this range</h2><p>Complete an analysis and choose Save attempt in Practice to build a history.</p></div> : <section className="progress-content-grid reveal delay-2">
          <div className="panel history-panel"><SectionHeading title="Comparable Notes trend" subtitle={latestFull ? `Same arrangement, ScoreVersion, full-score scope, and ${Math.round(latestFull.practiceSpeedMultiplier * 100)}% speed` : 'A reliable or limited full-score result is needed for headline trends'} />{chartAttempts.length ? <div className="history-chart compact"><svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Comparable note score trend">{noteSegments.map((segment, index) => segment.length > 1 ? <polyline key={index} points={segment.map((point) => { const chart = chartPoint(point); return `${chart.x},${chart.y}` }).join(' ')} fill="none" stroke="#9ce3c1" strokeWidth="2" vectorEffect="non-scaling-stroke" /> : segment[0] ? (() => { const point = chartPoint(segment[0]); return <circle key={index} cx={point.x} cy={point.y} r="1.8" fill="#9ce3c1" vectorEffect="non-scaling-stroke" /> })() : null)}</svg><div className="chart-labels"><span>{formatPercent(chartAttempts[0]?.notes ?? null)}<small>earliest</small></span><span>{formatPercent(chartAttempts.at(-1)?.notes ?? null)}<small>latest</small></span></div></div> : <div className="take-empty">Partial, provisional, or unavailable results remain in history but do not create headline personal-best or rolling-trend claims.</div>}</div>
          <div className="panel consistency-panel"><SectionHeading title="Rolling comparison" subtitle={`Current last ${rolling[0]?.windowSize ?? 5} comparable attempts versus the previous ${rolling[0]?.windowSize ?? 5}`} /><div className="rolling-metrics">{rolling.map((metric) => <article key={metric.metric}><span>{metric.metric}</span><strong>{formatPercent(metric.currentAverage)}</strong><small>{metric.currentCount} current · {metric.previousCount} previous</small><StatusPill tone={metric.change !== null && metric.change > 0 ? 'positive' : 'neutral'}>{metric.change === null ? 'Needs prior window' : `${metric.change >= 0 ? '+' : ''}${(metric.change * 100).toFixed(1)} pts`}</StatusPill></article>)}</div></div>
        </section>}
        <section className="panel mastery-report"><SectionHeading title="Arrangement Mastery" subtitle="Current state for each Arrangement and its exact current ScoreVersion; demonstrated speed stays separate" /><div className="mastery-report-grid">{mastery.length ? mastery.map(({ item, value }) => <article key={item.arrangement.id}><div><strong>{item.work.title}</strong><small>{item.arrangement.name} · ScoreVersion v{item.scoreVersion.version}</small></div><span><small>Mastery</small><strong>{value.mastery === null ? '—' : `${value.mastery.toFixed(1)}%`}</strong><em>{value.confidence} confidence</em></span><span><small>Demonstrated speed</small><strong>{value.demonstratedSpeedMultiplier === null ? '—' : `${Math.round(value.demonstratedSpeedMultiplier * 100)}%`}</strong><em>Target 100%</em></span></article>) : <div className="take-empty">No current repertoire arrangements are available for Mastery reporting.</div>}</div></section>
        <SkillRatingsPanel skills={skills} clarifyProgressRange />
      </>}
    </div>
  )
}
