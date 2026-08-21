import { ArrowLeft, FileClock, FileMusic } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { PageHeader, StatusPill } from '../components/ui'
import { PerformanceResultsPanel } from '../features/performance-results/PerformanceResultsPanel'
import type { ScoreHighlightModel } from '../features/performance-results/highlightModel'
import { useRepositoryQuery } from '../features/persistence/PersistenceContext'
import { PersistenceErrorState } from '../features/persistence/PersistenceErrorState'
import type { PerformanceAttemptRecord, PersistedArrangement, PersistedScoreVersion, PersistedWork } from '../features/persistence/types'
import { OsmdScoreRenderer } from '../features/score-renderer/OsmdScoreRenderer'

interface HistoricalData {
  readonly attempt: PerformanceAttemptRecord | null
  readonly scoreVersion: PersistedScoreVersion | null
  readonly arrangement: PersistedArrangement | null
  readonly work: PersistedWork | null
}

export function HistoricalResultPage() {
  const { attemptId = '' } = useParams()
  const [highlights, setHighlights] = useState<ScoreHighlightModel | null>(null)
  const state = useRepositoryQuery<HistoricalData>(async (repository) => {
    const attempt = await repository.getAttempt(attemptId)
    if (!attempt) return { attempt: null, scoreVersion: null, arrangement: null, work: null }
    const [scoreVersion, arrangement, works] = await Promise.all([
      repository.getScoreVersion(attempt.scoreVersionId), repository.getArrangement(attempt.arrangementId), repository.listWorks(),
    ])
    return { attempt, scoreVersion, arrangement, work: works.find((candidate) => candidate.id === arrangement?.workId) ?? null }
  }, `history:${attemptId}`)

  if (state.status === 'loading') return <div className="page"><div className="route-loader"><strong>Opening historical result…</strong></div></div>
  if (state.status === 'error') return <div className="page"><PersistenceErrorState title="Result could not be opened" error={state.error} /></div>
  const { attempt, scoreVersion, arrangement, work } = state.data
  if (!attempt || !scoreVersion || !arrangement || !work) return <div className="page"><div className="empty-state"><FileClock /><h2>Historical attempt not found</h2><Link className="button primary" to="/repertoire">Back to Repertoire</Link></div></div>

  return <div className="page historical-result-page">
    <Link to={`/repertoire/${arrangement.id}`} className="back-link"><ArrowLeft size={15} /> {work.title}</Link>
    <PageHeader eyebrow="Read-only history" title={work.title} description={`${new Intl.DateTimeFormat(undefined, { dateStyle: 'long', timeStyle: 'short' }).format(new Date(attempt.performedAt))} · ${Math.round(attempt.practiceSpeedMultiplier * 100)}% speed`} action={<StatusPill tone="violet"><FileClock size={12} /> Saved snapshot</StatusPill>} />
    <section className="panel notation-panel historical-notation"><div className="score-section-heading notation-heading"><div><span className="score-section-icon paper"><FileMusic /></span><div><h2>Exact historical score</h2><p>{scoreVersion.sourceFileName} · ScoreVersion {scoreVersion.version} · parser {scoreVersion.parserVersion}</p></div></div></div><div className="notation-paper"><OsmdScoreRenderer musicXmlText={scoreVersion.canonicalMusicXml} zoom={0.7} highlights={highlights} /></div></section>
    <PerformanceResultsPanel analysis={{ status: 'ready', result: attempt.performanceResults }} scope={attempt.gradingScope} onAnalyze={() => undefined} onHighlightChange={setHighlights} readOnly />
    <details className="panel results-diagnostics"><summary>Historical engine versions</summary><div><span>Alignment <strong>{attempt.engineVersions.alignment}</strong></span><span>Notes <strong>{attempt.engineVersions.noteGrading}</strong></span><span>Timing <strong>{attempt.engineVersions.timingAnalysis}</strong></span><span>Results <strong>{attempt.engineVersions.resultAggregation}</strong></span></div></details>
  </div>
}
