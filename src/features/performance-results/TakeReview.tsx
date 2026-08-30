import { AlertCircle, ChevronRight, Map, Music2, Target } from 'lucide-react'
import { useEffect, useMemo, useReducer } from 'react'
import { StatusPill } from '../../components/ui'
import type { AlignmentResult, ScoreRegionCandidate } from '../alignment/types'
import type { ExpressionAnalysisState } from '../expression-analysis/useExpressionAnalysis'
import type { PedalAnalysisState } from '../pedal-analysis/usePedalAnalysis'
import type { PerformanceRecording } from '../performance/types'
import type { VoicingAnalysisState } from '../voicing-analysis/useVoicingAnalysis'
import { buildScoreHighlightModel, type ScoreHighlightModel } from './highlightModel'
import { buildTakePositionView } from './takePosition'
import { boundedProblemMeasures, confirmTakeRegionCandidate, INITIAL_TAKE_REVIEW_INTERACTION, takeReviewInteractionReducer, type TakeReviewDimension } from './takeReviewInteraction'
import type { MeasureResult, PerformanceResults } from './types'

export interface TakeReviewProps {
  readonly alignment: AlignmentResult
  readonly recording: PerformanceRecording
  readonly practiceSpeed: number
  readonly results: PerformanceResults | null
  readonly expressionAnalysis: ExpressionAnalysisState
  readonly pedalAnalysis: PedalAnalysisState
  readonly voicingAnalysis: VoicingAnalysisState
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

function DimensionValue({ label, value, displayValue, detail }: { label: string; value?: number | null; displayValue?: string; detail: string }) {
  return <div className="take-review-dimension-value"><span>{label}</span><strong>{displayValue ?? percent(value ?? null)}</strong><small>{detail}</small></div>
}

function pendingDimension(label: string, status: 'idle' | 'analyzing' | 'error', message?: string) {
  if (status === 'analyzing') return <DimensionValue label={label} displayValue="Analyzing…" detail={`Preparing ${label} evidence for this take.`} />
  if (status === 'error') return <DimensionValue label={label} displayValue="Unavailable" detail={`Analysis error · ${message ?? `${label} analysis could not be completed.`}`} />
  return <DimensionValue label={label} displayValue="Not analyzed yet" detail={`${label} analysis has not run for this take.`} />
}

function EvidenceInspector({ dimension, measure, results, expressionAnalysis, pedalAnalysis, voicingAnalysis, recording }: {
  dimension: TakeReviewDimension
  measure: MeasureResult | null
  results: PerformanceResults
  expressionAnalysis: ExpressionAnalysisState
  pedalAnalysis: PedalAnalysisState
  voicingAnalysis: VoicingAnalysisState
  recording: PerformanceRecording
}) {
  if (dimension === 'overview') {
    return <div className="take-review-overview"><span className="step-label">Selected measure</span><h3>{measure ? `Measure ${measure.displayMeasureNumber}` : 'Matched take'}</h3><p>{measure ? measureIssues(measure) : 'Select a matched measure to inspect its bounded evidence.'}</p>{measure && <div className="take-review-mini-metrics"><span>Notes <strong>{percent(measure.note.noteScore)}</strong></span><span>Rhythm <strong>{percent(measure.rhythm.rhythmScore)}</strong></span><span>Tempo <strong>{percent(measure.tempo.tempoScore)}</strong></span></div>}</div>
  }
  if (dimension === 'notes') return <DimensionValue label="Notes" value={measure?.note.noteScore ?? results.summary.notes} detail={measure ? `${measure.note.correct} correct · ${measure.note.wrongPitch} wrong · ${measure.note.missed} missed · ${measure.note.additional} additional` : 'Pitch-only precision and recall evidence'} />
  if (dimension === 'rhythm') return <DimensionValue label="Rhythm" value={measure?.rhythm.rhythmScore ?? results.summary.rhythm} detail={measure ? `${measure.rhythm.scoredIntervalCount} trustworthy intervals` : 'Tempo-normalized local interval control'} />
  if (dimension === 'tempo') return <DimensionValue label="Tempo" value={measure?.tempo.tempoScore ?? results.summary.tempo} detail={measure ? `${measure.tempo.sampleCount} trustworthy local samples` : 'Target speed and local stability remain independent from Rhythm'} />
  if (dimension === 'dynamics') {
    if (expressionAnalysis.status !== 'ready') return pendingDimension('Dynamics', expressionAnalysis.status, expressionAnalysis.status === 'error' ? expressionAnalysis.message : undefined)
    const dynamics = expressionAnalysis.result.dynamics
    return <DimensionValue label="Dynamics" value={dynamics.score} detail={dynamics.coverage.authoredTargetCount === 0 ? 'No authored dynamics in this matched region.' : dynamics.unavailableReason ?? `${dynamics.coverage.analyzedTargetCount} of ${dynamics.coverage.authoredTargetCount} authored targets analyzed`} />
  }
  if (dimension === 'articulation') {
    if (expressionAnalysis.status !== 'ready') return pendingDimension('Articulation', expressionAnalysis.status, expressionAnalysis.status === 'error' ? expressionAnalysis.message : undefined)
    const articulation = expressionAnalysis.result.articulation
    return <DimensionValue label="Articulation" value={articulation.score} detail={articulation.coverage.authoredTargetCount === 0 ? 'No authored articulation in this matched region.' : articulation.unavailableReason ?? `${articulation.coverage.analyzedTargetCount} of ${articulation.coverage.authoredTargetCount} authored targets analyzed`} />
  }
  if (dimension === 'pedal') {
    if (pedalAnalysis.status !== 'ready') return pendingDimension('Pedal', pedalAnalysis.status, pedalAnalysis.status === 'error' ? pedalAnalysis.message : undefined)
    const pedal = pedalAnalysis.result
    const captured = recording.statistics.sustainChangeCount
    if (pedal.coverage.authoredPhraseCount === 0) return <DimensionValue label="Pedal" displayValue="Not graded" detail={`${captured ? `CC64 activity captured (${captured} changes) · ` : ''}No authored pedal target in this score.`} />
    return <DimensionValue label="Pedal" value={pedal.score} detail={pedal.unavailableReason ?? `${pedal.coverage.analyzedPhraseCount} of ${pedal.coverage.authoredPhraseCount} authored phrases analyzed`} />
  }
  if (voicingAnalysis.status !== 'ready') return pendingDimension('Voicing', voicingAnalysis.status, voicingAnalysis.status === 'error' ? voicingAnalysis.message : undefined)
  const voicing = voicingAnalysis.result
  if (voicing.intentProfileSnapshot === null) return <DimensionValue label="Voicing" displayValue="Not configured" detail="Explicit foreground/support intent is required." />
  return <DimensionValue label="Voicing" value={voicing.score} detail={voicing.unavailableReason ?? `${voicing.coverage.analyzedTargetCount} of ${voicing.coverage.configuredTargetCount} configured targets analyzed`} />
}

export function TakeReview({ alignment, recording, practiceSpeed, results, expressionAnalysis, pedalAnalysis, voicingAnalysis, onConfirmRegion, onHighlightChange }: TakeReviewProps) {
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
    <div className="take-review-workspace"><div className="take-review-main"><div className="take-review-context"><Target /><div><span>Current matched position</span><strong>{selectedMeasure ? `Measure ${selectedMeasure.displayMeasureNumber}` : selectedPosition?.matchedMeasureRange.displayRange}</strong><p>{selectedMeasure ? measureIssues(selectedMeasure) : 'No measure-specific evidence is available.'}</p></div></div><div className="take-review-problems"><strong>Useful problem measures</strong>{rankedProblems.length ? rankedProblems.map((measure) => <button key={measure.id} onClick={() => dispatchInteraction({ type: 'select-measure', measureId: measure.id, allowedMeasureIds })}><span>M{measure.displayMeasureNumber}</span><small>{measureIssues(measure)}</small></button>) : <p>No problem measure has enough bounded evidence.</p>}</div>{results.strongestSections[0] && <div className="take-review-clean"><Music2 /><span><small>Strongest clean region</small><strong>{results.strongestSections[0].displayRange}</strong></span></div>}</div><aside className="take-review-inspector" aria-live="polite"><EvidenceInspector dimension={interaction.dimension} measure={selectedMeasure} results={results} expressionAnalysis={expressionAnalysis} pedalAnalysis={pedalAnalysis} voicingAnalysis={voicingAnalysis} recording={recording} /></aside></div>
    <a className="take-review-next" href="#detailed-analysis">Open detailed analysis for event-level evidence <ChevronRight /></a>
  </section>
}
