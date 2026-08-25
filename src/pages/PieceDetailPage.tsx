import { ArrowLeft, CalendarDays, FileMusic, History, Play, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button, PageHeader, SectionHeading, Stat } from '../components/ui'
import { REPERTOIRE_STATUSES, type RepertoireStatus } from '../domain/music'
import { parseMusicXml } from '../features/musicxml/parser'
import { usePersistence, useRepositoryQuery } from '../features/persistence/PersistenceContext'
import { PersistenceErrorState } from '../features/persistence/PersistenceErrorState'
import { scoreVersionNumberForAttempt } from '../features/persistence/history'
import { removeRepertoireSafely, setInterpretationReferenceSafely, updateRepertoireStatusSafely } from '../features/persistence/mutations'
import type { AttemptSummary, PersistedScoreVersion, RepertoireListItem } from '../features/persistence/types'
import { comparableAttemptKey, derivePersonalBests, formatPercent, selectLatestHeadlineAttempt } from '../features/progress/model'
import { usePracticeSession } from '../features/practice/PracticeSessionContext'
import { buildPersistedPracticePlan } from '../features/practice/persistedPractice'

interface PieceData {
  readonly item: RepertoireListItem | null
  readonly attempts: readonly AttemptSummary[]
  readonly scoreVersions: readonly PersistedScoreVersion[]
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
  const [mutationState, setMutationState] = useState<'idle' | 'saving'>('idle')
  const state = useRepositoryQuery<PieceData>(async (repository) => {
    const [items, attempts, scoreVersions] = await Promise.all([repository.listRepertoire(), repository.listAttemptSummaries(arrangementId), repository.listScoreVersions(arrangementId)])
    return { item: items.find((candidate) => candidate.arrangement.id === arrangementId) ?? null, attempts, scoreVersions }
  }, `piece:${arrangementId}`)
  const data = state.status === 'ready' ? state.data : null
  const item = data?.item ?? null
  const attempts = data?.attempts ?? []
  const latestFull = selectLatestHeadlineAttempt(attempts)
  const comparable = latestFull
    ? attempts.filter((attempt) => comparableAttemptKey(attempt) === comparableAttemptKey(latestFull))
    : []
  const personalBests = derivePersonalBests(comparable)

  const startPractice = () => {
    if (!item) return
    setActionError(null)
    try {
      const score = parseMusicXml(item.scoreVersion.canonicalMusicXml)
      const plan = buildPersistedPracticePlan(score, item.scoreVersion)
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
    setActionError(null)
    setMutationState('saving')
    const result = await removeRepertoireSafely(persistence.repository, item.arrangement.id)
    setMutationState('idle')
    if (!result.ok) {
      setActionError(`Repertoire removal failed: ${result.error.message} You can retry safely.`)
      return
    }
    navigate('/repertoire')
  }

  const updateStatus = async (status: RepertoireStatus) => {
    if (!item || !persistence.repository || status === item.repertoire.status) return
    setActionError(null)
    setMutationState('saving')
    const result = await updateRepertoireStatusSafely(persistence.repository, item.arrangement.id, status)
    setMutationState('idle')
    if (!result.ok) setActionError(`Status update failed: ${result.error.message} Your existing status was preserved.`)
  }

  const setReference = async (attempt: AttemptSummary) => {
    if (!item || !persistence.repository) return
    setActionError(null); setMutationState('saving')
    const result = await setInterpretationReferenceSafely(persistence.repository, item.arrangement.id, item.scoreVersion.id, attempt.id)
    setMutationState('idle')
    if (!result.ok) setActionError(result.error.message)
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
        {attempts.length === 0 ? <div className="take-empty">No saved attempts yet. Record, analyze, and explicitly save a take from Practice.</div> : <div className="attempt-history-list">{attempts.map((attempt) => { const version = scoreVersionNumberForAttempt(attempt, data?.scoreVersions ?? []); const compatible = attempt.scoreVersionId === item.scoreVersion.id; const selected = item.arrangement.analysisPreferences?.referenceByScoreVersion[item.scoreVersion.id] === attempt.id; return <div key={attempt.id} className="attempt-history-shell"><Link to={`/history/${attempt.id}`} className="attempt-history-row"><div><strong>{formatDate(attempt.performedAt)}</strong><span>{version === null ? 'Score version unavailable' : `Score v${version}`} · {Math.round(attempt.practiceSpeedMultiplier * 100)}% · {attempt.gradingScope === 'full-plan' ? 'Full score' : 'Played section'}</span></div><div><span>Notes <strong>{formatPercent(attempt.notes)}</strong></span><span>Rhythm <strong>{formatPercent(attempt.rhythm)}</strong></span><span>Tempo <strong>{formatPercent(attempt.tempo)}</strong></span></div></Link><Button variant="ghost" disabled={!compatible || mutationState === 'saving'} onClick={() => void setReference(attempt)}>{selected ? 'Current reference' : compatible ? 'Use as interpretation reference' : 'Different ScoreVersion'}</Button></div> })}</div>}
      </section>

      <section className="panel local-data-actions reveal delay-3"><div><strong>Repertoire status</strong><p>This user-controlled status changes only active Repertoire membership metadata; score versions and history remain immutable.</p></div><label className="select-field"><span>Current status</span><select value={item.repertoire.status} disabled={mutationState === 'saving'} onChange={(event) => void updateStatus(event.target.value as RepertoireStatus)}>{REPERTOIRE_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label></section>
      <section className="panel local-data-actions reveal delay-3"><div><strong>Repertoire membership</strong><p>Removing this arrangement hides it from active repertoire while preserving its immutable score and history.</p></div><Button variant="ghost" icon={Trash2} disabled={mutationState === 'saving'} onClick={() => void remove()}>{mutationState === 'saving' ? 'Saving…' : 'Remove from repertoire'}</Button></section>
    </div>
  )
}
