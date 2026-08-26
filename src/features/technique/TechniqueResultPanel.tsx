import { StatusPill } from '../../components/ui'
import type { TechniqueAnalysisResultV1, TechniqueAnalysisResultV2 } from './types'

export function TechniqueResultPanel({ result }: { result: TechniqueAnalysisResultV1 | TechniqueAnalysisResultV2 }) {
  const versionTwo = 'eventCoverageRatio' in result.completion
  const completionRatio = versionTwo ? result.completion.eventCoverageRatio : result.completion.ratio
  const completionLabel = versionTwo ? 'event coverage' : 'reached'
  return <section className="panel technique-results">
    <div className="section-heading"><div><span>Technique evidence</span><h2>Independent facets</h2></div><StatusPill tone={result.status === 'ready' ? 'positive' : 'warning'}>{Math.round(completionRatio * 100)}% {completionLabel}</StatusPill></div>
    {versionTwo && <p className="challenge-line">Reached span {Math.round(result.completion.spanReachedRatio * 100)}% · {result.completion.completeCorrectOrIncorrectEventCount}/{result.completion.expectedEventCount} fully observed events · {result.novelty.firstSavedAttempt ? 'first saved encounter' : 'repeat practice context'}</p>}
    <div className="technique-facet-grid">{result.facets.map((facet) => <article key={facet.id}><span>{facet.label}</span><strong>{facet.score === null ? 'Unavailable' : `${facet.score.toFixed(1)}%`}</strong><small>{facet.summary}</small><div className="challenge-line">{facet.evidenceCount}/{facet.eligibleCount} evidence · {facet.reliability}{'evidenceFamily' in facet ? ` · ${facet.evidenceFamily}` : ''}</div></article>)}</div>
    <div className="challenge-profile"><strong>Challenge profile</strong><span>{result.challenge.targetTempoBpm} BPM · {result.challenge.eventCount} events · {result.challenge.pitchSpanSemitones} semitone span · max jump {result.challenge.maximumJumpSemitones} · subdivision 1/{result.challenge.smallestSubdivision}{'declaredHandContext' in result.challenge ? ` · ${result.challenge.declaredHandContext} hand context` : ''}</span></div>
    {result.warnings.map((warning) => <p className="inline-notice warning" key={warning}>{warning}</p>)}
  </section>
}
