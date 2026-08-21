import { ArrowLeft, CalendarDays, FileMusic, History, Play, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button, PageHeader, SectionHeading, Stat } from '../components/ui'
import { buildExpectedPerformancePlan } from '../features/expected-performance/builder'
import { parseMusicXml } from '../features/musicxml/parser'
import { usePersistence, useRepositoryQuery } from '../features/persistence/PersistenceContext'
import { PersistenceErrorState } from '../features/persistence/PersistenceErrorState'
import type { AttemptSummary, RepertoireListItem } from '../features/persistence/types'
import { derivePersonalBests, formatPercent } from '../features/progress/model'
import { usePracticeSession } from '../features/practice/PracticeSessionContext'

interface PieceData {
  readonly item: RepertoireListItem | null
  readonly attempts: readonly AttemptSummary[]
}

function formatPracticeTime(milliseconds: number): string {
  const minutes = Math.round(milliseconds / 60_000)
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

export function PieceDetailPage() {
  const { arrangementId = '' } = useParams()
  const navigate = useNavigate()
  const persistence = usePersistence()
  const practice = usePracticeSession()
  const [actionError, setActionError] = useState<string | null>(null)
  const state = useRepositoryQuery<PieceData>(async (repository) => {
    const [items, attempts] = await Promise.all([repository.listRepertoire(), repository.listAttemptSummaries(arrangementId)])
    return { item: items.find((candidate) => candidate.arrangement.id === arrangementId) ?? null, attempts }
  }, `piece:${arrangementId}`)
  const data = state.status === 'ready' ? state.data : null
  const item = data?.item ?? null
  const attempts = data?.attempts ?? []
  const latestFull = attempts.find((attempt) => attempt.gradingScope === 'full-plan')
  const comparable = latestFull
    ? attempts.filter((attempt) => attempt.scoreVersionId === latestFull.scoreVersionId && attempt.practiceSpeedMultiplier === latestFull.practiceSpeedMultiplier)
    : []
  const personalBests = derivePersonalBests(comparable)

  const startPractice = () => {
    if (!item) return
    try {
      const score = parseMusicXml(item.scoreVersion.canonicalMusicXml)
      const plan = buildExpectedPerformancePlan(score, { includedPartIds: [...item.scoreVersion.includedPartIds], fallbackQuarterBpm: 120 })
      practice.startSession({
        arrangementId: item.arrangement.id,
        scoreVersionId: item.scoreVersion.id,
        source: {
          fileName: item.scoreVersion.sourceFileName,
          sourceFormat: item.scoreVersion.format,
          musicXmlText: item.scoreVersion.canonicalMusicXml,
          sourceBytes: item.scoreVersion.sourceBytes,
          uncompressedBytes: item.scoreVersion.uncompressedBytes,
        },
        score,
        plan,
        sourceLabel: `${item.scoreVersion.sourceFileName} · v${item.scoreVersion.version}`,
        isDemo: false,
        speedMultiplier: 1,
      })
      navigate('/practice/session')
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'This saved score could not be prepared for practice.')
    }
  }

  const remove = async () => {
    if (!item || !persistence.repository) return
    const confirmed = window.confirm(`Remove “${item.work.title}” from Repertoire? Its score versions, sessions, and performance history will be preserved.`)
    if (!confirmed) return
    await persistence.repository.removeFromRepertoire(item.arrangement.id)
    navigate('/repertoire')
  }

  if (state.status === 'loading') return <div className="page"><div className="route-loader"><strong>Opening arrangement history…</strong></div></div>
  if (state.status === 'error') return <div className="page"><PersistenceErrorState title="Arrangement could not be opened" error={state.error} /></div>
  if (!item) return <div className="page"><div className="empty-state"><FileMusic /><h2>Arrangement not found</h2><p>It may have been removed from your active repertoire.</p><Link className="button primary" to="/repertoire">Back to Repertoire</Link></div></div>

  return (
    <div className="page piece-page">
      <Link to="/repertoire" className="back-link"><ArrowLeft size={15} /> Repertoire</Link>
      <PageHeader eyebrow={`${item.arrangement.difficulty} · ${item.repertoire.status}`} title={item.work.title} description={`${item.work.composer} · ${item.arrangement.name}`} action={<Button icon={Play} onClick={startPractice}>Start practice</Button>} />
      {actionError && <div className="renderer-inline-error">{actionError}</div>}
      <section className="piece-hero reveal delay-1">
        <div className="piece-cover artwork-1"><span>{item.work.title.split(' ').slice(0, 2).map((word) => word[0]).join('')}</span><i /><div className="cover-caption"><small>SCORE VERSION</small><strong>v{item.scoreVersion.version}</strong></div></div>
        <div className="piece-score-panel panel"><FileMusic size={42} /><div className="piece-score-copy"><span>Immutable analysis score</span><strong>{item.scoreVersion.sourceFileName}</strong><p>SHA-256 {item.scoreVersion.contentHash.slice(0, 12)}… · imported {formatDate(item.scoreVersion.createdAt)}</p></div></div>
        <div className="piece-stat-grid panel">
          <Stat icon={History} label="Attempts" value={`${attempts.length}`} detail={`${item.sessionCount} completed sessions`} />
          <Stat icon={CalendarDays} label="Practice time" value={formatPracticeTime(item.totalPracticeMs)} detail={item.lastPracticedAt ? `Last ${formatDate(item.lastPracticedAt)}` : 'No completed session yet'} />
          {(['notes', 'rhythm', 'tempo'] as const).map((metric) => { const best = personalBests.find((value) => value.metric === metric); return <Stat key={metric} icon={History} label={`Best ${metric}`} value={formatPercent(best?.value ?? null)} detail={latestFull ? `Full score · ${Math.round(latestFull.practiceSpeedMultiplier * 100)}% speed` : 'Needs a full-score result'} /> })}
        </div>
      </section>

      <section className="panel history-panel reveal delay-2">
        <SectionHeading title="Performance history" subtitle="Saved attempts retain the exact score, MIDI recording, and analysis snapshots" />
        {attempts.length === 0 ? <div className="take-empty">No saved attempts yet. Record, analyze, and explicitly save a take from Practice.</div> : <div className="attempt-history-list">{attempts.map((attempt) => <Link key={attempt.id} to={`/history/${attempt.id}`} className="attempt-history-row"><div><strong>{formatDate(attempt.performedAt)}</strong><span>Score v{item.scoreVersion.version} · {Math.round(attempt.practiceSpeedMultiplier * 100)}% · {attempt.gradingScope === 'full-plan' ? 'Full score' : 'Played section'}</span></div><div><span>Notes <strong>{formatPercent(attempt.notes)}</strong></span><span>Rhythm <strong>{formatPercent(attempt.rhythm)}</strong></span><span>Tempo <strong>{formatPercent(attempt.tempo)}</strong></span></div></Link>)}</div>}
      </section>

      <section className="panel local-data-actions reveal delay-3"><div><strong>Repertoire membership</strong><p>Removing this arrangement hides it from active repertoire while preserving its immutable score and history.</p></div><Button variant="ghost" icon={Trash2} onClick={() => void remove()}>Remove from repertoire</Button></section>
    </div>
  )
}
