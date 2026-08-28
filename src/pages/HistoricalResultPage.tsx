import { ArrowLeft, FileClock, ShieldCheck, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Button, PageHeader, StatusPill } from '../components/ui'
import { usePersistence, useRepositoryQuery } from '../features/persistence/PersistenceContext'
import { PersistenceErrorState } from '../features/persistence/PersistenceErrorState'
import type { PerformanceAttemptRecord, PersistedArrangement, PersistedScoreVersion, PersistedWork } from '../features/persistence/types'
import { HistoricalReferenceComparisonPanel } from '../features/reference-comparison/HistoricalReferenceComparisonPanel'
import { setInterpretationReferenceSafely } from '../features/persistence/mutations'
import type { AttemptSummary } from '../features/persistence/types'
import { derivePersonalBestHistory } from '../features/progress/model'
import { CurrentPracticePlanning } from '../components/PracticePlanningPanel'
import { HistoricalEvidenceInspector } from '../components/HistoricalEvidenceInspector'

interface HistoricalData {
  readonly attempt: PerformanceAttemptRecord | null
  readonly scoreVersion: PersistedScoreVersion | null
  readonly arrangement: PersistedArrangement | null
  readonly work: PersistedWork | null
  readonly activeScoreVersionId: string | null
  readonly summaries: readonly AttemptSummary[]
}

export function HistoricalResultPage() {
  const { attemptId = '' } = useParams()
  const persistence = usePersistence()
  const [referenceMessage, setReferenceMessage] = useState<string | null>(null)
  const state = useRepositoryQuery<HistoricalData>(async (repository) => {
    const attempt = await repository.getAttempt(attemptId)
    if (!attempt) return { attempt: null, scoreVersion: null, arrangement: null, work: null, activeScoreVersionId: null, summaries: [] }
    const [scoreVersion, arrangement, works, repertoire, summaries] = await Promise.all([
      repository.getScoreVersion(attempt.scoreVersionId), repository.getArrangement(attempt.arrangementId), repository.listWorks(), repository.listRepertoire(), repository.listAttemptSummaries(attempt.arrangementId),
    ])
    return { attempt, scoreVersion, arrangement, work: works.find((candidate) => candidate.id === arrangement?.workId) ?? null, activeScoreVersionId: repertoire.find((item) => item.arrangement.id === attempt.arrangementId)?.scoreVersion.id ?? null, summaries }
  }, `history:${attemptId}`)

  if (state.status === 'loading') return <div className="page"><div className="route-loader"><strong>Opening historical result…</strong></div></div>
  if (state.status === 'error') return <div className="page"><PersistenceErrorState title="Result could not be opened" error={state.error} /></div>
  const { attempt, scoreVersion, arrangement, work, activeScoreVersionId, summaries } = state.data
  if (!attempt || !scoreVersion || !arrangement || !work) return <div className="page"><div className="empty-state"><FileClock /><h2>Historical attempt not found</h2><Link className="button primary" to="/repertoire">Back to Repertoire</Link></div></div>

  const personalBests = derivePersonalBestHistory(summaries).filter((event) => event.attemptId === attempt.id && event.kind === 'new-personal-best')
  return <div className="page historical-result-page evidence-inspector">
    <Link to={`/repertoire/${arrangement.id}`} className="back-link"><ArrowLeft size={15} /> {work.title}</Link>
    <PageHeader eyebrow="Read-only history" title={work.title} description={`${new Intl.DateTimeFormat(undefined, { dateStyle: 'long', timeStyle: 'short' }).format(new Date(attempt.performedAt))} · ${Math.round(attempt.practiceSpeedMultiplier * 100)}% speed`} action={<div className="historical-actions"><StatusPill tone="violet"><FileClock size={12} /> Saved snapshot</StatusPill><Button variant="secondary" disabled={activeScoreVersionId !== attempt.scoreVersionId} title={activeScoreVersionId === null ? 'This Arrangement is not in active Repertoire.' : activeScoreVersionId !== attempt.scoreVersionId ? 'This take uses a different ScoreVersion from the current Practice score.' : undefined} onClick={async () => { if (!persistence.repository) return; const result = await setInterpretationReferenceSafely(persistence.repository, attempt.arrangementId, attempt.scoreVersionId, attempt.id); setReferenceMessage(result.ok ? 'Using this take as interpretation reference.' : result.error.message) }}>{activeScoreVersionId === attempt.scoreVersionId ? 'Use as interpretation reference' : activeScoreVersionId === null ? 'No active Repertoire score' : 'Different current ScoreVersion'}</Button></div>} />
    {referenceMessage && <div className="save-confirmation">{referenceMessage}</div>}
    <section className="attempt-evidence-header panel"><div><span>Attempt</span><strong>{attempt.id}</strong><small>{attempt.gradingScope === 'full-plan' ? 'Full score' : 'Partial / aligned section'} · {attempt.performanceResults.reliability} evidence</small></div><div><span>Exact identity</span><strong>ScoreVersion v{scoreVersion.version}</strong><small>{Math.round(attempt.practiceSpeedMultiplier * 100)}% stored practice speed · schema V{attempt.schemaVersion}</small></div><div><span>Snapshot</span><strong><ShieldCheck /> Analysis snapshot preserved</strong><small>Historical evidence is read-only and never regraded.</small></div>{personalBests.length > 0 && <div className="attempt-pbs"><span>Factual PBs</span>{personalBests.map((event) => <span className="pb-chip settle" key={event.metric}><Sparkles /> {event.metric} {Math.round(event.value * 100)}%</span>)}</div>}</section>
    {attempt.gradingScope !== 'full-plan' && <div className="inline-notice warning"><span>This partial attempt remains factual history, but it is excluded from headline full-performance PB and Mastery qualification.</span></div>}
    <div className="evidence-language panel"><strong>Frozen Phase 7 take evidence</strong><p>Phase 7 measure and section priority belongs to this saved take. Current Phase 14 planning appears separately below when the ScoreVersion is still active.</p></div>
    <HistoricalEvidenceInspector attempt={attempt} scoreVersion={scoreVersion} />
    <details className="panel historical-reference-context"><summary>Interpretation reference comparison · not a scored dimension</summary><HistoricalReferenceComparisonPanel result={attempt.schemaVersion === 4 ? attempt.referenceComparison : null} /></details>
    {activeScoreVersionId === attempt.scoreVersionId && <section className="historical-current-planning"><span className="eyebrow">Current read model · separate from this take</span><CurrentPracticePlanning arrangementId={attempt.arrangementId} scoreVersionId={attempt.scoreVersionId} limit={2} /></section>}
    <details className="panel results-diagnostics"><summary>Historical engine versions</summary><div><span>Alignment <strong>{attempt.engineVersions.alignment}</strong></span><span>Notes <strong>{attempt.engineVersions.noteGrading}</strong></span><span>Timing <strong>{attempt.engineVersions.timingAnalysis}</strong></span><span>Results <strong>{attempt.engineVersions.resultAggregation}</strong></span>{attempt.schemaVersion !== 1 && <span>Expression <strong>{attempt.engineVersions.expressionAnalysis}</strong></span>}{(attempt.schemaVersion === 3 || attempt.schemaVersion === 4) && <span>Pedal <strong>{attempt.engineVersions.pedalAnalysis}</strong></span>}{attempt.schemaVersion === 4 && <><span>Voicing <strong>{attempt.engineVersions.voicingAnalysis}</strong></span><span>Reference <strong>{attempt.engineVersions.referenceComparison}</strong></span></>}</div></details>
  </div>
}
