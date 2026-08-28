import { ArrowRight, CircleGauge, Clock3, Crosshair, History, Music2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { derivePracticePlanning, preparePracticePlanningContext, type PracticePlanningResult, type PracticeRecommendation } from '../features/practice-planning'
import { useRepositoryQuery } from '../features/persistence/PersistenceContext'
import { PersistenceErrorState } from '../features/persistence/PersistenceErrorState'
import { SectionHeading, StatusPill } from './ui'
import { recommendationWhat, recommendationWhy } from './practicePlanningPresentation'

function speedLabel(recommendation: PracticeRecommendation): string | null {
  if (recommendation.suggestedPracticeSpeedMultiplier === null) return null
  const source = recommendation.sourcePracticeSpeedMultiplier
  return source === null
    ? `${Math.round(recommendation.suggestedPracticeSpeedMultiplier * 100)}% target`
    : `${Math.round(source * 100)}% → ${Math.round(recommendation.suggestedPracticeSpeedMultiplier * 100)}%`
}

function RecommendationCard({ recommendation, arrangementId }: { readonly recommendation: PracticeRecommendation; readonly arrangementId: string }) {
  const href = recommendation.target.type === 'technique' ? `/technique/${recommendation.target.moduleId}` : `/practice/${arrangementId}`
  return <article className="planning-card">
    <div className="planning-card-head"><span className="planning-rank">{String(recommendation.rank).padStart(2, '0')}</span><StatusPill tone={recommendation.evidenceStrength === 'strong' || recommendation.evidenceStrength === 'supported' ? 'positive' : 'neutral'}>{recommendation.evidenceStrength}</StatusPill></div>
    <span className="planning-label">WHAT</span><h3>{recommendationWhat(recommendation)}</h3>
    <span className="planning-label">WHY</span><p>{recommendationWhy(recommendation)}</p>
    <div className="planning-meta">{speedLabel(recommendation) && <span><CircleGauge /> {speedLabel(recommendation)}</span>}<span><History /> {recommendation.evidenceSessionIds.length} session{recommendation.evidenceSessionIds.length === 1 ? '' : 's'}</span></div>
    <details><summary>Exact provenance</summary><code>{recommendation.id}</code><span>{recommendation.evidenceAttemptIds.length ? `Attempts: ${recommendation.evidenceAttemptIds.join(', ')}` : 'No attempt IDs support this recommendation.'}</span></details>
    <Link className="text-link planning-action" to={href}>Open target <ArrowRight /></Link>
  </article>
}

export function PracticePlanningView({ result, limit = 3 }: { readonly result: PracticePlanningResult; readonly limit?: number }) {
  return <section className="panel planning-panel">
    <SectionHeading title="Suggested next practice" subtitle="Based on recent evidence · current Arrangement and exact ScoreVersion" action={<span className="provenance-tag">{result.modelVersion}</span>} />
    {result.recommendations.length === 0 ? <div className="truthful-empty"><Music2 /><div><h3>No current recommendation</h3><p>Clef does not yet have enough compatible recent evidence to suggest a section, speed, full run, or independent Technique target.</p></div></div> : <div className="planning-grid">{result.recommendations.slice(0, limit).map((recommendation) => <RecommendationCard key={recommendation.id} recommendation={recommendation} arrangementId={result.arrangementId} />)}</div>}
    {result.sectionHistories.length > 0 && <details className="planning-history"><summary>Persistent section evidence</summary><div>{result.sectionHistories.slice(0, 6).map((history) => <article key={history.section.id}><strong>{history.section.displayRange}</strong><span>{history.dimensions.map((dimension) => `${dimension.dimension} ${dimension.qualityEstimate === null ? 'unavailable' : `${dimension.qualityEstimate.toFixed(1)}%`}`).join(' · ')}</span><code>{history.section.id}</code></article>)}</div></details>}
    <footer className="planning-footer"><span><Clock3 /> As of {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(result.asOf))}</span><span><Crosshair /> {result.diagnostics.acceptedAttemptCount} compatible attempt{result.diagnostics.acceptedAttemptCount === 1 ? '' : 's'}</span></footer>
  </section>
}

export function CurrentPracticePlanning({ arrangementId, scoreVersionId, limit }: { readonly arrangementId: string; readonly scoreVersionId: string; readonly limit?: number }) {
  const [asOf] = useState(() => new Date().toISOString())
  const state = useRepositoryQuery(async (repository) => derivePracticePlanning(await preparePracticePlanningContext({ repository, arrangementId, scoreVersionId, asOf })), `practice-planning:${arrangementId}:${scoreVersionId}:${asOf}`)
  if (state.status === 'loading') return <section className="panel planning-panel"><div className="route-loader"><strong>Preparing current practice evidence…</strong></div></section>
  if (state.status === 'error') return <PersistenceErrorState title="Practice suggestions could not be prepared" error={state.error} />
  return <PracticePlanningView result={state.data} limit={limit} />
}
