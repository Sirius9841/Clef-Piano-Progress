import { Activity, AlertCircle, ArrowLeft, ArrowRight, Crosshair, Gauge, ListFilter, Map, Medal, Music2, RefreshCw, ScanSearch, Target } from 'lucide-react'
import { useEffect, useMemo, useReducer } from 'react'
import { Button, StatusPill } from '../../components/ui'
import type { GradingScopeType } from '../note-grading/types'
import { buildScoreHighlightModel, type ScoreHighlightModel } from './highlightModel'
import type { PerformanceResultsAnalysisState } from './usePerformanceResults'
import { adjacentMistakeId, createPerformanceResultsViewState, performanceResultsViewReducer, visibleMistakes, type MistakeFilter } from './viewState'
import type { HeatmapMode, MeasureResult, MistakeResult, PerformanceResults, ResultIssueCategory, SectionResult } from './types'

function score(value: number | null): string {
  return value === null ? '—' : (value * 100).toFixed(1)
}

function confidenceLabel(category: MeasureResult['confidence']['category']): string {
  return category === 'high' ? 'High evidence' : category === 'medium' ? 'Moderate evidence' : category === 'low' ? 'Limited evidence' : 'Insufficient evidence'
}

function issueLabel(issue: ResultIssueCategory): string {
  const labels: Record<ResultIssueCategory, string> = { 'pitch-accuracy': 'Pitch accuracy', 'missed-notes': 'Missed notes', 'additional-notes': 'Additional notes', 'rhythm-consistency': 'Rhythm consistency', 'tempo-control': 'Tempo control', 'tempo-direction': 'Expressive tempo direction' }
  return labels[issue]
}

function ScopeControl({ scope, disabled, onChange }: { scope: GradingScopeType; disabled?: boolean; onChange: (scope: GradingScopeType) => void }) {
  return <div className="results-scope"><span>Result scope</span><div><button className={scope === 'aligned-span' ? 'active' : ''} disabled={disabled} onClick={() => onChange('aligned-span')}>Played section</button><button className={scope === 'full-plan' ? 'active' : ''} disabled={disabled} onClick={() => onChange('full-plan')}>Full score</button></div><small>{scope === 'aligned-span' ? 'Unplayed material outside the aligned span stays not analyzed.' : 'All expected score targets are included.'}</small></div>
}

function DimensionMetrics({ values }: { values: PerformanceResults['summary'] | { notes: number | null; rhythm: number | null; tempo: number | null } }) {
  const metrics = [{ label: 'Notes', value: values.notes, icon: Music2 }, { label: 'Rhythm', value: values.rhythm, icon: Activity }, { label: 'Tempo', value: values.tempo, icon: Gauge }]
  return <div className="results-dimensions">{metrics.map(({ label, value, icon: Icon }) => <div key={label}><Icon /><span>{label}</span><strong>{score(value)}</strong><small>{value === null ? 'Insufficient evidence' : 'Independent performance dimension'}</small></div>)}</div>
}

function heatmapValue(measure: MeasureResult, mode: HeatmapMode): number | null {
  if (mode === 'practice-priority') return measure.practicePriority.confidenceAdjustedPriority
  if (mode === 'notes') return measure.note.noteScore
  if (mode === 'rhythm') return measure.rhythm.rhythmScore
  return measure.tempo.tempoScore
}

function MeasureHeatmap({ results, mode, selectedMeasureId, onMode, onSelect }: { results: PerformanceResults; mode: HeatmapMode; selectedMeasureId: string | null; onMode: (mode: HeatmapMode) => void; onSelect: (id: string) => void }) {
  const modes: { id: HeatmapMode; label: string }[] = [{ id: 'practice-priority', label: 'Practice Priority' }, { id: 'notes', label: 'Notes' }, { id: 'rhythm', label: 'Rhythm' }, { id: 'tempo', label: 'Tempo' }]
  return <section className="results-heatmap"><div className="results-section-head"><div><Map /><span><strong>Measure heatmap</strong><small>{mode === 'practice-priority' ? 'Ranking utility, not an overall score' : `${modes.find((item) => item.id === mode)?.label} evidence by measure`}</small></span></div><div className="results-segments">{modes.map((item) => <button className={mode === item.id ? 'active' : ''} key={item.id} onClick={() => onMode(item.id)}>{item.label}</button>)}</div></div><div className="heatmap-strip" role="group" aria-label={`${modes.find((item) => item.id === mode)?.label} measure heatmap`}>{results.measures.map((measure, index) => { const cell = results.heatmap[index]!; const value = heatmapValue(measure, mode); return <button aria-label={`${cell.accessibleSummary} ${mode === 'practice-priority' ? 'Practice priority' : mode} ${value === null ? 'unavailable' : Math.round(value * 100)}.`} aria-pressed={selectedMeasureId === measure.id} className={`${cell.semanticLevel} confidence-${cell.confidence} ${selectedMeasureId === measure.id ? 'selected' : ''}`} data-level={value === null ? 'none' : value >= 0.8 ? 'high' : value >= 0.55 ? 'medium' : 'low'} key={measure.id} onClick={() => onSelect(measure.id)} title={cell.accessibleSummary}><span>M{measure.displayMeasureNumber}</span><strong>{value === null ? '—' : Math.round(value * 100)}</strong><i /></button> })}</div></section>
}

function SectionMetrics({ section }: { section: SectionResult }) {
  return <div className="section-metric-row"><span>Notes <strong>{score(section.note.noteScore)}</strong></span><span>Rhythm <strong>{score(section.rhythm.rhythmScore)}</strong></span><span>Tempo <strong>{score(section.tempo.tempoScore)}</strong></span></div>
}

function RankedSections({ title, sections, kind, onReview }: { title: string; sections: readonly SectionResult[]; kind: 'weak' | 'strong'; onReview: (section: SectionResult) => void }) {
  const Icon = kind === 'weak' ? Target : Medal
  return <section className={`ranked-sections ${kind}`}><div className="results-section-head"><div><Icon /><span><strong>{title}</strong><small>{kind === 'weak' ? 'Distinct confidence-aware practice regions' : 'Well-supported clean regions in this take'}</small></span></div></div>{sections.length ? <div className="section-card-grid">{sections.map((section) => <article key={section.id}><div className="section-card-top"><span><strong>{section.displayRange}</strong><small>{confidenceLabel(section.confidence.category)}</small></span><StatusPill tone={kind === 'weak' ? 'warning' : 'positive'}>{kind === 'weak' ? `${section.practicePriority.label} priority` : 'Strong'}</StatusPill></div><SectionMetrics section={section} /><div className="section-issues">{section.mainIssues.length ? section.mainIssues.slice(0, 3).map((issue) => <span key={issue}>{issueLabel(issue)}</span>) : <span>No material issues detected</span>}</div><button onClick={() => onReview(section)}>{kind === 'weak' ? 'Review section' : 'Focus section'} <Crosshair /></button></article>)}</div> : <div className="results-empty-inline">{kind === 'weak' ? 'No distinct weak section clears the current evidence threshold.' : 'No section has enough evidence and consistently high dimensions yet.'}</div>}</section>
}

function MeasureDetail({ measure }: { measure: MeasureResult | null }) {
  if (!measure) return <section className="measure-detail"><div className="results-empty-inline">Select an analyzed measure to inspect its evidence.</div></section>
  return <section className="measure-detail"><div className="results-section-head"><div><Crosshair /><span><strong>Measure {measure.displayMeasureNumber}</strong><small>{confidenceLabel(measure.confidence.category)}</small></span></div><StatusPill tone={measure.analysisState === 'analyzed' ? 'violet' : 'neutral'}>{measure.analysisState === 'outside-scope' ? 'Not analyzed' : measure.analysisState === 'insufficient-evidence' ? 'Insufficient' : `${measure.practicePriority.label} priority`}</StatusPill></div><DimensionMetrics values={{ notes: measure.note.noteScore, rhythm: measure.rhythm.rhythmScore, tempo: measure.tempo.tempoScore }} /><div className="measure-evidence-grid"><span>Correct <strong>{measure.note.correct}</strong></span><span>Wrong pitch <strong>{measure.note.wrongPitch}</strong></span><span>Missed <strong>{measure.note.missed}</strong></span><span>Extra <strong>{measure.note.additional}</strong></span><span>Rhythm intervals <strong>{measure.rhythm.scoredIntervalCount}</strong></span><span>Tempo samples <strong>{measure.tempo.sampleCount}</strong></span><span>Median residual <strong>{measure.rhythm.medianAbsoluteResidualMs === null ? '—' : `${measure.rhythm.medianAbsoluteResidualMs.toFixed(0)} ms`}</strong></span><span>Target tempo <strong>{measure.tempo.targetVaries ? 'Varies' : measure.tempo.effectiveTargetQuarterBpm === null ? '—' : `${measure.tempo.effectiveTargetQuarterBpm.toFixed(0)} BPM`}</strong></span></div>{measure.mainIssues.length > 0 && <div className="measure-issues">{measure.mainIssues.map((issue) => <span key={issue}>{issueLabel(issue)}</span>)}</div>}</section>
}

function mistakeFilterLabel(filter: MistakeFilter): string {
  return filter === 'all' ? 'All' : filter[0]!.toUpperCase() + filter.slice(1)
}

function MistakeNavigator({ results, filter, selectedMistakeId, onFilter, onSelect, onAdjacent }: { results: PerformanceResults; filter: MistakeFilter; selectedMistakeId: string | null; onFilter: (filter: MistakeFilter) => void; onSelect: (mistake: MistakeResult) => void; onAdjacent: (direction: -1 | 1) => void }) {
  const visible = visibleMistakes(results, filter)
  const currentIndex = visible.findIndex((mistake) => mistake.id === selectedMistakeId)
  const selected = currentIndex >= 0 ? visible[currentIndex]! : null
  const filters: MistakeFilter[] = ['all', 'notes', 'rhythm', 'tempo']
  return <section className="mistake-navigator"><div className="results-section-head"><div><ListFilter /><span><strong>Mistake navigator</strong><small>Musical score order · {visible.length} visible</small></span></div><div className="mistake-arrows"><button disabled={!visible.length} aria-label="Previous issue" onClick={() => onAdjacent(-1)}><ArrowLeft /></button><span>{selected ? `${currentIndex + 1} / ${visible.length}` : `0 / ${visible.length}`}</span><button disabled={!visible.length} aria-label="Next issue" onClick={() => onAdjacent(1)}><ArrowRight /></button></div></div><div className="results-segments mistake-filters">{filters.map((item) => <button className={filter === item ? 'active' : ''} key={item} onClick={() => onFilter(item)}>{mistakeFilterLabel(item)}</button>)}</div>{selected ? <div className={`mistake-focus severity-${selected.severityLabel}`}><span>{selected.displayMeasureNumber ? `Measure ${selected.displayMeasureNumber}` : 'Unattributed take issue'}</span><strong>{selected.title}</strong><p>{selected.detail}</p><small>{selected.severityLabel} navigation severity · {selected.dimension}</small></div> : <div className="results-empty-inline">No issues match this filter.</div>}<div className="mistake-list">{visible.slice(0, 80).map((mistake) => <button className={mistake.id === selectedMistakeId ? 'selected' : ''} key={mistake.id} onClick={() => onSelect(mistake)}><span>{mistake.displayMeasureNumber ? `M${mistake.displayMeasureNumber}` : 'Take'}</span><strong>{mistake.title}</strong><em>{mistake.dimension}</em></button>)}</div>{visible.length > 80 && <small className="result-list-limit">Showing 80 of {visible.length} issues.</small>}</section>
}

function ReadyResults({ results, scope, onAnalyze, onHighlightChange, readOnly = false }: { results: PerformanceResults; scope: GradingScopeType; onAnalyze: (scope: GradingScopeType) => void; onHighlightChange: (model: ScoreHighlightModel | null) => void; readOnly?: boolean }) {
  const [view, dispatch] = useReducer(performanceResultsViewReducer, results, createPerformanceResultsViewState)
  const selectedMeasure = results.measures.find((measure) => measure.id === view.selectedMeasureId) ?? null
  const selectedSection = results.sections.find((section) => section.id === view.selectedSectionId) ?? null
  const highlightModel = useMemo(() => buildScoreHighlightModel(results, { measureResultIds: selectedSection?.measureResultIds ?? (selectedMeasure ? [selectedMeasure.id] : []), mistakeId: view.selectedMistakeId }), [results, selectedMeasure, selectedSection, view.selectedMistakeId])
  useEffect(() => { onHighlightChange(highlightModel) }, [highlightModel, onHighlightChange])
  useEffect(() => () => onHighlightChange(null), [onHighlightChange])
  const selectMistake = (mistake: MistakeResult) => dispatch({ type: 'select-mistake', mistakeId: mistake.id, measureId: mistake.measureResultId })
  const moveMistake = (direction: -1 | 1) => { const id = adjacentMistakeId(results, view, direction); const mistake = results.mistakes.find((item) => item.id === id); if (mistake) selectMistake(mistake) }
  const setFilter = (filter: MistakeFilter) => { const first = visibleMistakes(results, filter)[0] ?? null; dispatch({ type: 'set-mistake-filter', filter, firstVisibleMistakeId: first?.id ?? null, firstVisibleMeasureId: first?.measureResultId ?? null }) }
  const reviewSection = (section: SectionResult) => dispatch({ type: 'select-section', sectionId: section.id, firstMeasureId: section.measureResultIds[0]!, firstMistakeId: section.mistakeIds[0] ?? null })
  return <section className="panel performance-results"><header className="performance-results-header"><div><StatusPill tone={results.reliability === 'provisional' ? 'warning' : 'positive'}><Target /> {results.reliability === 'provisional' ? 'Provisional analysis' : results.reliability === 'limited' ? 'Limited timing evidence' : readOnly ? 'Saved result' : 'Results ready'}</StatusPill><h2>Performance results</h2><p>{readOnly ? 'Read-only historical snapshot using the exact saved engine outputs.' : 'Measure-grounded practice feedback. Notes, Rhythm, and Tempo remain independent.'}</p></div><ScopeControl scope={scope} disabled={readOnly} onChange={onAnalyze} /></header><DimensionMetrics values={results.summary} /><MeasureHeatmap results={results} mode={view.heatmapMode} selectedMeasureId={view.selectedMeasureId} onMode={(mode) => dispatch({ type: 'set-heatmap-mode', mode })} onSelect={(measureId) => dispatch({ type: 'select-measure', measureId })} /><div className="result-detail-layout"><MeasureDetail measure={selectedMeasure} /><MistakeNavigator results={results} filter={view.mistakeFilter} selectedMistakeId={view.selectedMistakeId} onFilter={setFilter} onSelect={selectMistake} onAdjacent={moveMistake} /></div><div className="ranked-layout"><RankedSections title="Needs work" sections={results.weakestSections} kind="weak" onReview={reviewSection} /><RankedSections title="Strongest sections" sections={results.strongestSections} kind="strong" onReview={reviewSection} /></div><details className="results-diagnostics"><summary>Result methodology</summary><div><span>Aggregation <strong>{results.diagnostics.resultAggregationVersion}</strong></span><span>Analyzed measures <strong>{results.diagnostics.analyzedMeasureCount}</strong></span><span>Section windows <strong>{results.diagnostics.sectionWindowCount}</strong></span><span>Mapped mistakes <strong>{results.diagnostics.mistakeCount}</strong></span><span>Unattributed extras <strong>{results.diagnostics.unattributedMistakeCount}</strong></span><span>Scope <strong>{results.scope}</strong></span></div><p>Practice Priority is a confidence-adjusted ranking utility for choosing what to work on next. It is not an overall performance score, mastery, or skill rating.</p></details></section>
}

export function PerformanceResultsPanel({ analysis, scope, onAnalyze, onHighlightChange, readOnly = false }: { analysis: PerformanceResultsAnalysisState; scope: GradingScopeType; onAnalyze: (scope: GradingScopeType) => void; onHighlightChange: (model: ScoreHighlightModel | null) => void; readOnly?: boolean }) {
  if (analysis.status === 'idle') return <section className="panel results-state"><div className="results-state-icon"><Target /></div><div><span className="step-label">Phase 7 results</span><h2>Turn this take into a practice map</h2><p>Aggregate note, rhythm, and tempo evidence into measures, distinct sections, score mapping, and issue navigation.</p></div><ScopeControl scope={scope} onChange={onAnalyze} /><Button icon={Map} onClick={() => onAnalyze(scope)}>Build results</Button></section>
  if (analysis.status === 'building') return <section className="panel results-state"><div className="results-state-icon"><ScanSearch className="spin" /></div><div><span className="step-label">Result aggregation</span><h2>Building the measure map</h2><p>Indexing deterministic score provenance and ranking distinct practice sections from underlying evidence.</p></div><ScopeControl scope={scope} disabled onChange={onAnalyze} /><StatusPill tone="violet">Processing</StatusPill></section>
  if (analysis.status === 'unavailable') return <section className="panel results-state unavailable"><div className="results-state-icon"><AlertCircle /></div><div><span className="step-label">Results unavailable</span><h2>No trustworthy result map</h2><p>{analysis.message}</p></div><ScopeControl scope={scope} onChange={onAnalyze} /><Button variant="secondary" icon={RefreshCw} onClick={() => onAnalyze(scope)}>Try scope</Button></section>
  return <ReadyResults key={analysis.result.id} results={analysis.result} scope={scope} onAnalyze={onAnalyze} onHighlightChange={onHighlightChange} readOnly={readOnly} />
}
