import { Activity, FileMusic, Gauge, Layers3, Music2, SlidersHorizontal, Volume2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { PerformanceAttemptRecord, PersistedScoreVersion } from '../features/persistence/types'
import { HistoricalExpressionPanel } from '../features/expression-analysis/HistoricalExpressionPanel'
import { HistoricalPedalPanel } from '../features/pedal-analysis/HistoricalPedalPanel'
import { buildScoreHighlightModel, type ScoreHighlightModel } from '../features/performance-results/highlightModel'
import { PerformanceResultsPanel } from '../features/performance-results/PerformanceResultsPanel'
import type { ResultDimension } from '../features/performance-results/types'
import { formatPercent } from '../features/progress/model'
import { OsmdScoreRenderer } from '../features/score-renderer/OsmdScoreRenderer'
import { HistoricalVoicingPanel } from '../features/voicing-analysis/HistoricalVoicingPanel'
import { coreMeasureEvidence, deriveLowestCoreDimension, historicalDimensions, type HistoricalDimensionId } from './historicalEvidencePresentation'

const icons = { notes: Music2, rhythm: Activity, tempo: Gauge, dynamics: Volume2, articulation: SlidersHorizontal, pedal: Gauge, voicing: Layers3 } as const
const coreDimensions: readonly HistoricalDimensionId[] = ['notes', 'rhythm', 'tempo']

export function HistoricalEvidenceInspector({ attempt, scoreVersion }: { readonly attempt: PerformanceAttemptRecord; readonly scoreVersion: PersistedScoreVersion }) {
  const [selected, setSelected] = useState<HistoricalDimensionId>('notes')
  const [selectedMeasureId, setSelectedMeasureId] = useState<string | null>(null)
  const [detailedCoreOpen, setDetailedCoreOpen] = useState(false)
  const dimensions = useMemo(() => historicalDimensions(attempt), [attempt])
  const selectedPresentation = dimensions.find((dimension) => dimension.id === selected)!
  const lowest = deriveLowestCoreDimension(attempt.performanceResults)
  const measureEvidence = coreDimensions.includes(selected) ? coreMeasureEvidence(attempt.performanceResults, selected as ResultDimension) : []
  const focusedMeasureId = selectedMeasureId && measureEvidence.some((measure) => measure.measureResultId === selectedMeasureId) ? selectedMeasureId : measureEvidence[0]?.measureResultId ?? null
  const highlights: ScoreHighlightModel | null = focusedMeasureId ? buildScoreHighlightModel(attempt.performanceResults, { measureResultIds: [focusedMeasureId] }) : null

  return <section className="historical-evidence-inspector">
    <div className="historical-score-workspace panel notation-panel"><div className="score-section-heading notation-heading"><div><span className="score-section-icon paper"><FileMusic /></span><div><h2>Exact historical score</h2><p>{scoreVersion.sourceFileName} · ScoreVersion {scoreVersion.version} · parser {scoreVersion.parserVersion}</p></div></div></div><div className="notation-paper"><OsmdScoreRenderer musicXmlText={scoreVersion.canonicalMusicXml} zoom={0.7} highlights={highlights} /></div></div>
    <aside className="historical-dimension-inspector panel">
      <header><span className="eyebrow">Evidence inspector</span><h2>Independent dimensions</h2><p>Select one saved evidence lane. Reference comparison is not a scored dimension.</p></header>
      <div className="dimension-selector" role="tablist" aria-label="Historical analysis dimensions">{dimensions.map((dimension) => { const Icon = icons[dimension.id]; return <button role="tab" aria-selected={selected === dimension.id} aria-controls="historical-dimension-panel" className={selected === dimension.id ? 'selected' : ''} key={dimension.id} onClick={() => { setSelected(dimension.id); setSelectedMeasureId(null) }}><Icon /><span>{dimension.label}</span><strong>{formatPercent(dimension.score)}</strong><small>{dimension.status.replace('-', ' ')}</small></button> })}</div>
      <div id="historical-dimension-panel" role="tabpanel" className="selected-dimension-summary"><span>{selectedPresentation.label}</span><strong>{formatPercent(selectedPresentation.score)}</strong><small>{selectedPresentation.reliability} · {selectedPresentation.status.replace('-', ' ')}</small><p>{selectedPresentation.detail}</p></div>
      {coreDimensions.includes(selected) && <div className="core-measure-evidence"><strong>{selectedPresentation.label} evidence by analyzed measure</strong>{measureEvidence.length ? measureEvidence.slice(0, 8).map((measure) => <button aria-pressed={focusedMeasureId === measure.measureResultId} className={focusedMeasureId === measure.measureResultId ? 'selected' : ''} key={measure.measureResultId} onClick={() => setSelectedMeasureId(measure.measureResultId)}><span>Measure {measure.displayMeasureNumber}</span><strong>{formatPercent(measure.score)}</strong><small>{measure.evidenceCount} observations · {measure.confidence} confidence</small></button>) : <p>No measure has sufficient saved {selectedPresentation.label.toLowerCase()} evidence.</p>}</div>}
      {selected === 'dynamics' && <HistoricalExpressionPanel result={attempt.schemaVersion !== 1 ? attempt.expressionAnalysis : null} dimension="dynamics" />}
      {selected === 'articulation' && <HistoricalExpressionPanel result={attempt.schemaVersion !== 1 ? attempt.expressionAnalysis : null} dimension="articulation" />}
      {selected === 'pedal' && <HistoricalPedalPanel result={attempt.schemaVersion === 3 || attempt.schemaVersion === 4 ? attempt.pedalAnalysis : null} recording={attempt.recording} />}
      {selected === 'voicing' && <HistoricalVoicingPanel result={attempt.schemaVersion === 4 ? attempt.voicingAnalysis : null} />}
    </aside>
    <div className="lowest-core panel"><span>Lowest core dimension this take</span>{lowest ? <><strong>{lowest.dimensions.map((dimension) => dimension[0]!.toUpperCase() + dimension.slice(1)).join(' · ')}</strong><small>{formatPercent(lowest.score)} · {lowest.dimensions.length > 1 ? 'tied available core dimensions' : 'factual saved take summary'}</small></> : <><strong>Unavailable</strong><small>Notes, Rhythm, and Tempo contain no comparable saved value.</small></>}</div>
    <details className="panel detailed-core-analysis" onToggle={(event) => setDetailedCoreOpen(event.currentTarget.open)}><summary>Detailed core analysis</summary>{detailedCoreOpen && <PerformanceResultsPanel analysis={{ status: 'ready', result: attempt.performanceResults }} scope={attempt.gradingScope} onAnalyze={() => undefined} onHighlightChange={() => undefined} readOnly />}</details>
  </section>
}
