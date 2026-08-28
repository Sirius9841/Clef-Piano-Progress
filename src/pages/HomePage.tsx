import { ArrowRight, CircleGauge, Clock3, FileMusic, History, Music, Play, ShieldCheck, Sparkles, TrendingUp } from 'lucide-react'
import { Link } from 'react-router-dom'
import { CurrentPracticePlanning } from '../components/PracticePlanningPanel'
import { PracticeLaunchButton } from '../components/PracticeLaunchButton'
import { PageHeader, SectionHeading, Stat, StatusPill } from '../components/ui'
import { useRepositoryQuery } from '../features/persistence/PersistenceContext'
import { PersistenceErrorState } from '../features/persistence/PersistenceErrorState'
import type { AttemptSummary, ProgressSnapshot, RepertoireListItem } from '../features/persistence/types'
import { derivePersonalBestHistory, formatPercent, selectLatestHeadlineAttempt, type PersonalBestEvent } from '../features/progress/model'
import { deriveArrangementMastery } from '../features/mastery-model'
import { currentScorePersonalBestEvents, latestAttemptForScoreVersion } from '../components/currentScorePresentation'

interface HomeData {
  readonly repertoire: readonly RepertoireListItem[]
  readonly week: ProgressSnapshot
  readonly allAttempts: readonly AttemptSummary[]
  readonly asOf: string
}

interface RecentImprovement {
  readonly attempt: AttemptSummary
  readonly event: PersonalBestEvent
}

function formatDuration(milliseconds: number): string {
  const minutes = Math.round(milliseconds / 60_000)
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

export function HomePage() {
  const state = useRepositoryQuery<HomeData>(async (repository) => {
    const [repertoire, week, allAttempts] = await Promise.all([repository.listRepertoire(), repository.getProgress('7d'), repository.listAttemptSummaries()])
    return { repertoire, week, allAttempts, asOf: new Date().toISOString() }
  }, 'home')
  const data = state.status === 'ready' ? state.data : null
  const featured = data?.repertoire.slice(0, 3) ?? []
  const current = featured[0] ?? null
  const latest = selectLatestHeadlineAttempt(data?.week.attempts ?? [])
  const recentImprovements: readonly RecentImprovement[] = data ? (() => {
    const attemptsById = new Map(data.allAttempts.map((attempt) => [attempt.id, attempt]))
    return derivePersonalBestHistory(data.allAttempts).filter((event) => event.kind === 'new-personal-best').reverse().flatMap((event) => {
      const attempt = attemptsById.get(event.attemptId)
      return attempt ? [{ attempt, event }] : []
    }).slice(0, 3)
  })() : []
  const currentAttempts = current && data ? data.allAttempts.filter((attempt) => attempt.arrangementId === current.arrangement.id) : []
  const currentMastery = current && data ? deriveArrangementMastery({ arrangementId: current.arrangement.id, scoreVersionId: current.scoreVersion.id, attempts: currentAttempts, asOf: data.asOf }) : null
  const allPersonalBestEvents = data ? derivePersonalBestHistory(data.allAttempts) : []
  const currentPbMetrics = current && data ? currentScorePersonalBestEvents(allPersonalBestEvents, data.allAttempts, current.arrangement.id, current.scoreVersion.id).filter((event) => event.kind === 'new-personal-best').map((event) => event.metric) : []
  const currentLatestAttempt = current && data ? latestAttemptForScoreVersion(data.allAttempts.filter((attempt) => attempt.arrangementId === current.arrangement.id), current.scoreVersion.id) : null

  return (
    <div className="page home-page">
      <PageHeader eyebrow={new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())} title={featured.length ? 'Return to the music that matters.' : 'Build a truthful record of your playing.'} description={featured.length ? 'Your repertoire and performance history stay local to this browser.' : 'Import a machine-readable score to begin with real repertoire—not placeholder progress.'} action={<StatusPill tone="positive"><ShieldCheck size={13} /> Local-first</StatusPill>} />
      {state.status === 'loading' && <div className="route-loader"><strong>Reading local progress…</strong></div>}
      {state.status === 'error' && <PersistenceErrorState title="Local progress could not be opened" error={state.error} />}
      {data && featured.length === 0 && <section className="panel import-hero"><div className="empty-state"><FileMusic /><h2>Your first score becomes your first real arrangement</h2><p>Clef will preserve its exact MusicXML, practice sessions, MIDI takes, and analysis history locally.</p><Link className="button primary" to="/imports">Import MusicXML</Link></div></section>}
      {data && featured.length > 0 && <>
        {current && currentMastery && <section className="continue-hero panel reveal delay-1">
          <div className="continue-hero-copy"><span className="eyebrow">Continue practice</span><div className="hero-status"><StatusPill>{current.repertoire.status}</StatusPill><span>ScoreVersion v{current.scoreVersion.version}</span>{currentPbMetrics.length > 0 && <span className="pb-chip settle"><Sparkles /> PB · {currentPbMetrics.join(' / ')}</span>}</div><h2>{current.work.title}</h2><p>{current.work.composer} · {current.arrangement.name}</p><div className="hero-actions"><PracticeLaunchButton item={current}>Practice</PracticeLaunchButton>{currentLatestAttempt && <Link className="button secondary" to={`/history/${currentLatestAttempt.id}`}><History /> Review latest current-score take</Link>}<Link className="text-link" to={`/repertoire/${current.arrangement.id}`}>Piece dossier <ArrowRight /></Link></div></div>
          <div className="continue-hero-metrics"><div><span>Mastery</span><strong>{currentMastery.mastery === null ? 'Not established' : `${currentMastery.mastery.toFixed(1)}%`}</strong><small>{currentMastery.confidence} confidence · current exact score</small></div><div><span>Demonstrated speed</span><strong>{currentMastery.demonstratedSpeedMultiplier === null ? '—' : `${Math.round(currentMastery.demonstratedSpeedMultiplier * 100)}%`}</strong><small>{currentMastery.demonstratedSpeedStatus.replaceAll('-', ' ')}</small></div><div><span>Target speed</span><strong>100%</strong><small>{current.arrangement.targetTempoBpm ? `${current.arrangement.targetTempoBpm} BPM authored target` : 'Score-authored tempo'}</small></div><CircleGauge className="hero-watermark" /></div>
        </section>}
        {current && <CurrentPracticePlanning arrangementId={current.arrangement.id} scoreVersionId={current.scoreVersion.id} limit={3} />}
        <section className="hero-grid reveal delay-1">
          <div className="panel continue-panel">
            <SectionHeading title="Continue practicing" subtitle="Recently practiced arrangements" action={<Link className="text-link" to="/repertoire">All repertoire <ArrowRight size={15} /></Link>} />
            <div className="continue-list">{featured.map(({ work, arrangement, latestAttempt }, index) => <Link to={`/repertoire/${arrangement.id}`} className="continue-item" key={arrangement.id}><div className={`artwork artwork-${index + 1}`}><span>{work.title.split(' ').slice(0, 2).map((word) => word[0]).join('')}</span><i /></div><div className="piece-copy"><strong>{work.title}</strong><span>{work.composer} · {arrangement.name}</span><small>{latestAttempt ? `${latestAttempt.gradingScope === 'full-plan' ? 'Full score' : 'Played section'} · ${Math.round(latestAttempt.practiceSpeedMultiplier * 100)}%` : 'No saved attempt yet'}</small></div><div className="recent-score"><span>Notes</span><strong>{formatPercent(latestAttempt?.notes ?? null)}</strong></div><span className="play-circle"><Play size={17} fill="currentColor" /></span></Link>)}</div>
          </div>
          <div className="panel weekly-panel"><SectionHeading title="Last 7 days" subtitle="Completed practice sessions only" /><div className="weekly-stats"><Stat icon={Clock3} label="Practice" value={formatDuration(data.week.practiceTimeMs)} detail={`${data.week.sessionCount} sessions`} /><Stat icon={Music} label="Attempts" value={`${data.week.attemptCount}`} detail={`${data.week.activeDays} active days`} /><Stat icon={TrendingUp} label="Latest comparable Notes" value={formatPercent(latest?.notes ?? null)} detail={latest ? `${Math.round(latest.practiceSpeedMultiplier * 100)}% · full score` : 'No reliable or limited full-score result'} /></div></div>
        </section>
        <section className="dashboard-grid reveal delay-2"><div className="panel"><SectionHeading title="Recent improvements" subtitle="New full-score personal bests in the same version and speed context" />{recentImprovements.length ? <div className="improvement-grid real-improvements">{recentImprovements.map(({ attempt, event }) => { const item = data.repertoire.find((candidate) => candidate.arrangement.id === attempt.arrangementId); return <Link to={`/history/${attempt.id}`} className="improvement-card record" key={`${attempt.id}:${event.metric}`}><div className="improvement-top"><StatusPill tone="positive"><Sparkles size={12} /> {event.metric} personal best</StatusPill><span>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(attempt.performedAt))}</span></div><div><span>{item?.work.title ?? 'Saved arrangement'}</span><strong>{formatPercent(event.previousValue)} <ArrowRight /> {formatPercent(event.value)}</strong></div><small>Full score · {Math.round(attempt.practiceSpeedMultiplier * 100)}% speed</small></Link> })}</div> : <div className="take-empty">No new full-score personal bests yet. First results establish a baseline; equality and partial takes do not create record claims.</div>}</div><div className="panel skills-snapshot"><SectionHeading title="What Clef preserves" subtitle="Reproducible local history" /><div className="safety-list"><span><ShieldCheck /> Exact immutable ScoreVersion</span><span><ShieldCheck /> Lossless raw MIDI events</span><span><ShieldCheck /> Versioned analysis snapshots</span></div><Link className="text-link" to="/progress">Open long-term progress <ArrowRight size={15} /></Link></div></section>
      </>}
    </div>
  )
}
