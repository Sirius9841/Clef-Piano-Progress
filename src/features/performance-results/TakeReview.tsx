import { AlertCircle, ChevronRight, Map, Music2, Target } from 'lucide-react'
import { useEffect, useMemo, useReducer } from 'react'
import { StatusPill } from '../../components/ui'
import type { AlignmentResult, ScoreRegionCandidate } from '../alignment/types'
import type { ExpressionAnalysisResult } from '../expression-analysis/types'
import type { PedalAnalysisResult } from '../pedal-analysis/types'
import type { PerformanceRecording } from '../performance/types'
import type { VoicingAnalysisResult } from '../voicing-analysis/types'
import { buildScoreHighlightModel, type ScoreHighlightModel } from './highlightModel'
import { buildTakePositionView } from './takePosition'
import { boundedProblemMeasures, confirmTakeRegionCandidate, INITIAL_TAKE_REVIEW_INTERACTION, takeReviewInteractionReducer, type TakeReviewDimension } from './takeReviewInteraction'
import type { MeasureResult, PerformanceResults } from './types'

export interface TakeReviewProps {
  readonly alignment: AlignmentResult
  readonly recording: PerformanceRecording
  readonly practiceSpeed: number
  readonly results: PerformanceResults | null
  readonly expression: ExpressionAnalysisResult | null
  readonly pedal: PedalAnalysisResult | null
  readonly voicing: VoicingAnalysisResult | null
  readonly onConfirmRegion: (candidate: ScoreRegionCandidate) => void
  readonly onHighlightChange: (model: ScoreHighlightModel | null) => void
}

function percent(value: number | null): string {
  return value === null ? 'Unavailable' : `${(value * 100).toFixed(1)}`
}

function duration(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1_000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

function measureIssues(measure: MeasureResult): string {
  const parts: string[] = []
  if (measure.note.missed) parts.push(`${measure.note.missed} missed`)
  if (measure.note.wrongPitch) parts.push(`${measure.note.wrongPitch} wrong pitch`)
  if (measure.note.additional) parts.push(`${measure.note.additional} additional`)
  if (measure.mainIssues.includes('rhythm-consistency')) parts.push('timing unstable')
  if (measure.mainIssues.includes('tempo-control')) parts.push('tempo control')
  return parts.join(' · ') || 'No material issue'
}

function DimensionValue({ label, value, detail }: { label: string; value: number | null; detail: string }) {
  return <div className="take-review-dimension-value"><span>{label}</span><strong>{percent(value)}</strong><small>{detail}</small></div>
}

function EvidenceInspector({ dimension, measure, results, expression, pedal, voicing, recording }: {
  dimension: TakeReviewDimension
  measure: MeasureResult | null
  results: PerformanceResults
  expression: ExpressionAnalysisResult | null
  pedal: PedalAnalysisResult | null
  voicing: VoicingAnalysisResult | null
  recording: PerformanceRecording
}) {
  if (dimension === 'overview') {
    return <div className="take-review-overview"><span className="step-label">Selected measure</span><h3>{measure ? `Measure ${measure.displayMeasureNumber}` : 'Matched take'}</h3><p>{measure ? measureIssues(measure) : 'Select a matched measure to inspect its bounded evidence.'}</p>{measure && <div className="take-review-mini-metrics"><span>Notes <strong>{percent(measure.note.noteScore)}</strong></span><span>Rhythm <strong>{percent(measure.rhythm.rhythmScore)}</strong></span><span>Tempo <strong>{percent(measure.tempo.tempoScore)}</strong></span></div>}</div>
  }
  if (dimension === 'notes') return <DimensionValue label="Notes" value={measure?.note.noteScore ?? results.summary.notes} detail={measure ? `${measure.note.correct} correct · ${measure.note.wrongPitch} wrong · ${measure.note.missed} missed · ${measure.note.additional} additional` : 'Pitch-only precision and recall evidence'} />
  if (dimension === 'rhythm') return <DimensionValue label="Rhythm" value={measure?.rhythm.rhythmScore ?? results.summary.rhythm} detail={measure ? `${measure.rhythm.scoredIntervalCount} trustworthy intervals` : 'Tempo-normalized local interval control'} />
  if (dimension === 'tempo') return <DimensionValue label="Tempo" value={measure?.tempo.tempoScore ?? results.summary.tempo} detail={measure ? `${measure.tempo.sampleCount} trustworthy local samples` : 'Target speed and local stability remain independent from Rhythm'} />
  if (dimension === 'dynamics') return <DimensionValue label="Dynamics" value={expression?.dynamics.score ?? null} detail={expression?.dynamics.unavailableReason ?? `${expression?.dynamics.coverage.analyzedTargetCount ?? 0} of ${expression?.dynamics.coverage.authoredTargetCount ?? 0} authored targets analyzed`} />
  if (dimension === 'articulation') return <DimensionValue label="Articulation" value={expression?.articulation.score ?? null} detail={expression?.articulation.unavailableReason ?? `${expression?.articulation.coverage.analyzedTargetCount ?? 0} of ${expression?.articulation.coverage.authoredTargetCount ?? 0} authored targets analyzed`} />
  if (dimension === 'pedal') {
    const captured = recording.statistics.sustainChangeCount
    const noAuthoredTarget = !pedal || pedal.coverage.authoredPhraseCount === 0
    return <DimensionValue label="Pedal" value={noAuthoredTarget ? null : pedal.score} detail={noAuthoredTarget ? `Not graded · ${captured ? `CC64 activity captured (${captured} changes)` : 'no CC64 activity captured'} · no authored pedal target in this score` : pedal.unavailableReason ?? `${pedal.coverage.analyzedPhraseCount} of ${pedal.coverage.authoredPhraseCount} authored phrases analyzed`} />
  }
  const notConfigured = !voicing || voicing.intentProfileSnapshot === null
  return <DimensionValue label="Voicing" value={notConfigured ? null : voicing.score} detail={notConfigured ? 'Not configured · explicit foreground/support intent is required' : voicing.unavailableReason ?? `${voicing.coverage.analyzedTargetCount} of ${voicing.coverage.configuredTargetCount} configured targets analyzed`} />
}

export function TakeReview({ alignment, recording, practiceSpeed, results, expression, pedal, voicing, onConfirmRegion, onHighlightChange }: TakeReviewProps) {
  const [interaction, dispatchInteraction] = useReducer(takeReviewInteractionReducer, INITIAL_TAKE_REVIEW_INTERACTION)
  const localization = alignment.localization
  const region = localization?.takeRegion ?? null
  const takePosition = useMemo(() => region ? buildTakePositionView(region) : null, [region])
  const matchedMeasures = useMemo(() => results && takePosition ? results.measures.filter((measure) => takePosition.matchedMeasureRange.indices.includes(measure.measureIndex)) : [], [results, takePosition])
  const rankedProblems = useMemo(() => boundedProblemMeasures(matchedMeasures), [matchedMeasures])
  const allowedMeasureIds = useMemo(() => matchedMeasures.map((measure) => measure.id), [matchedMeasures])
  const selectedMeasure = matchedMeasures.find((measure) => measure.id === interaction.selectedMeasureId) ?? rankedProblems[0] ?? matchedMeasures[0] ?? null
  const selectedPosition = useMemo(() => region ? buildTakePositionView(region, { measureIndex: selectedMeasure?.measureIndex ?? null }) : null, [region, selectedMeasure?.measureIndex])

  useEffect(() => {
    if (!results || !selectedMeasure) {
      onHighlightChange(null)
      return
    }
    onHighlightChange(buildScoreHighlightModel(results, { measureResultIds: [selectedMeasure.id] }))
  }, [onHighlightChange, results, selectedMeasure])

  if (!localization || !region) {
    const candidates = localization?.candidates ?? []
    return <section className="panel take-review take-review-unresolved" aria-label="Take Review"><header><div><StatusPill tone="warning"><AlertCircle /> Needs confirmation</StatusPill><h2>Score region unresolved</h2><p>{localization?.explanation ?? 'This historical alignment has no saved played-region provenance.'}</p></div><span>{candidates.length} plausible match{candidates.length === 1 ? '' : 'es'}</span></header>{candidates.length > 0 && <div className="localization-candidates">{candidates.map((candidate, index) => <article key={candidate.id}><div><span>Candidate {String.fromCharCode(65 + index)}</span><strong>{candidate.displayRange}</strong><small>{candidate.evidence.exactPitchAnchorCount} exact onset anchors · {Math.round(candidate.evidence.performedCoverage * 100)}% correspondence coverage</small></div><button onClick={() => confirmTakeRegionCandidate(candidate, onConfirmRegion)}>Confirm this region <ChevronRight /></button></article>)}</div>}<p className="take-review-gate">Notes, Rhythm, Tempo, and downstream expression evidence remain unavailable until the score region is resolved. Confirmation changes this take’s analysis path only; it never rewrites the score or saved history.</p></section>
  }

  if (!results) {
    return <section className="panel take-review" aria-label="Take Review"><header className="take-review-header"><div><StatusPill tone={localization.status === 'confident' ? 'positive' : 'warning'}><Target /> Matched region</StatusPill><h2>Matched score region · {region.displayRange}</h2><p>{localization.explanation}</p></div><div className="take-review-facts"><span>Localization <strong>{localization.status === 'confident' ? 'Confident' : 'Limited'}</strong></span><span>Recorded <strong>{duration(recording.durationMs)}</strong></span><span>Practice speed <strong>{Math.round(practiceSpeed * 100)}%</strong></span></div></header><p className="take-review-gate">The region is resolved, but the bounded Notes, Rhythm, and Tempo result is not available yet. No headline values are inferred.</p></section>
  }

  const nav: readonly { id: TakeReviewDimension; label: string }[] = [
    { id: 'overview', label: 'Overview' }, { id: 'notes', label: 'Notes' }, { id: 'rhythm', label: 'Rhythm' }, { id: 'tempo', label: 'Tempo' },
    { id: 'dynamics', label: 'Dynamics' }, { id: 'articulation', label: 'Articulation' }, { id: 'pedal', label: 'Pedal' }, { id: 'voicing', label: 'Voicing' },
  ]
  return <section className="panel take-review" aria-label="Take Review">
    <header className="take-review-header"><div><span className="step-label">Take Review</span><h2>Matched score region · {takePosition?.matchedMeasureRange.displayRange}</h2><p>{localization.explanation}</p></div><div className="take-review-facts"><span>Localization <strong>{localization.status === 'confident' ? 'Confident' : 'Limited'}</strong></span><span>Recorded <strong>{duration(recording.durationMs)}</strong></span><span>Practice speed <strong>{Math.round(practiceSpeed * 100)}%</strong></span></div></header>
    <div className="take-review-core" aria-label="Independent core dimensions"><DimensionValue label="Notes" value={results?.summary.notes ?? null} detail="Independent pitch evidence" /><DimensionValue label="Rhythm" value={results?.summary.rhythm ?? null} detail="Independent interval evidence" /><DimensionValue label="Tempo" value={results?.summary.tempo ?? null} detail="Independent speed evidence" /></div>
    <div className="take-review-map"><div><Map /><span><strong>Matched measures</strong><small>Only the localized take region</small></span></div><div role="group" aria-label="Matched measure map">{matchedMeasures.map((measure) => <button key={measure.id} aria-pressed={measure.id === selectedMeasure?.id} className={measure.id === selectedMeasure?.id ? 'selected' : ''} onClick={() => dispatchInteraction({ type: 'select-measure', measureId: measure.id, allowedMeasureIds })}>M{measure.displayMeasureNumber}</button>)}</div></div>
    <nav className="take-review-nav" aria-label="Take evidence dimension">{nav.map((item) => <button key={item.id} className={interaction.dimension === item.id ? 'active' : ''} aria-pressed={interaction.dimension === item.id} onClick={() => dispatchInteraction({ type: 'select-dimension', dimension: item.id })}>{item.label}</button>)}</nav>
    <div className="take-review-workspace"><div className="take-review-main"><div className="take-review-context"><Target /><div><span>Current matched position</span><strong>{selectedMeasure ? `Measure ${selectedMeasure.displayMeasureNumber}` : selectedPosition?.matchedMeasureRange.displayRange}</strong><p>{selectedMeasure ? measureIssues(selectedMeasure) : 'No measure-specific evidence is available.'}</p></div></div><div className="take-review-problems"><strong>Useful problem measures</strong>{rankedProblems.length ? rankedProblems.map((measure) => <button key={measure.id} onClick={() => dispatchInteraction({ type: 'select-measure', measureId: measure.id, allowedMeasureIds })}><span>M{measure.displayMeasureNumber}</span><small>{measureIssues(measure)}</small></button>) : <p>No problem measure has enough bounded evidence.</p>}</div>{results.strongestSections[0] && <div className="take-review-clean"><Music2 /><span><small>Strongest clean region</small><strong>{results.strongestSections[0].displayRange}</strong></span></div>}</div><aside className="take-review-inspector" aria-live="polite"><EvidenceInspector dimension={interaction.dimension} measure={selectedMeasure} results={results} expression={expression} pedal={pedal} voicing={voicing} recording={recording} /></aside></div>
    <a className="take-review-next" href="#detailed-analysis">Open detailed analysis for event-level evidence <ChevronRight /></a>
  </section>
}
