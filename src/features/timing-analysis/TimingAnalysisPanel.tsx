import { Activity, AlertCircle, Clock3, Gauge, LineChart, Music2, RefreshCw, ScanSearch, TimerReset, TrendingDown, TrendingUp } from 'lucide-react'
import { useMemo } from 'react'
import { Button, StatusPill } from '../../components/ui'
import type { NoteGradingResult, GradingScopeType } from '../note-grading/types'
import type { TimingAnalysisState } from './useTimingAnalysis'
import type { LocalTempoSample, RhythmObservation, TempoTrend, TimingAnalysisResult } from './types'

function score(value: number | null): string {
  return value === null ? '—' : (value * 100).toFixed(1)
}

function percent(value: number | null): string {
  return value === null ? '—' : `${(value * 100).toFixed(1)}%`
}

function signedMs(value: number): string {
  return `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(0)} ms`
}

function ScopeControl({ scope, disabled, onChange }: { scope: GradingScopeType; disabled?: boolean; onChange: (scope: GradingScopeType) => void }) {
  return <div className="timing-scope"><span>Analyze</span><div><button className={scope === 'aligned-span' ? 'active' : ''} disabled={disabled} onClick={() => onChange('aligned-span')}>Played section</button><button className={scope === 'full-plan' ? 'active' : ''} disabled={disabled} onClick={() => onChange('full-plan')}>Full score</button></div><small>{scope === 'aligned-span' ? 'Timing only inside the confidently played section.' : 'Whole-score scope; timing still requires matched onsets.'}</small></div>
}

function trendLabel(trend: TempoTrend): string {
  if (trend === 'rushing') return 'Gradually rushing'
  if (trend === 'dragging') return 'Gradually dragging'
  if (trend === 'stable') return 'Stable trend'
  return 'Trend needs more data'
}

function TempoChart({ result }: { result: TimingAnalysisResult }) {
  const samples = result.tempo.localSamples
  const geometry = useMemo(() => {
    if (samples.length === 0) return null
    const allBpm = samples.flatMap((sample) => [sample.targetQuarterBpm, sample.performedQuarterBpm])
    const minimum = Math.min(...allBpm) * 0.92
    const maximum = Math.max(...allBpm) * 1.08
    const range = Math.max(1, maximum - minimum)
    const point = (sample: LocalTempoSample, index: number, key: 'targetQuarterBpm' | 'performedQuarterBpm') => {
      const x = samples.length === 1 ? 300 : 28 + index / (samples.length - 1) * 544
      const y = 148 - (sample[key] - minimum) / range * 116
      return `${x.toFixed(1)},${y.toFixed(1)}`
    }
    return {
      target: samples.map((sample, index) => point(sample, index, 'targetQuarterBpm')).join(' '),
      performed: samples.map((sample, index) => point(sample, index, 'performedQuarterBpm')).join(' '),
      minimum,
      maximum,
    }
  }, [samples])
  return <div className="tempo-chart"><div className="timing-detail-title"><div><LineChart /><span><strong>Tempo over score position</strong><small>{result.tempo.target.variableNumericTempo ? 'Variable numeric target' : 'Effective target and local estimate'}</small></span></div><div className="tempo-legend"><span className="target">Target</span><span className="performed">Performed</span></div></div>{geometry ? <svg viewBox="0 0 600 170" role="img" aria-label="Target and performed local tempo"><line x1="28" y1="148" x2="572" y2="148" /><line x1="28" y1="32" x2="28" y2="148" /><text x="30" y="27">{geometry.maximum.toFixed(0)} BPM</text><text x="30" y="164">{geometry.minimum.toFixed(0)} BPM</text><polyline className="target-line" points={geometry.target} /><polyline className="performed-line" points={geometry.performed} />{samples.map((sample, index) => { const [x, y] = geometry.performed.split(' ')[index]!.split(','); return <circle key={sample.id} cx={x} cy={y} r="3" /> })}</svg> : <div className="tempo-chart-empty">More strong timing anchors are needed for a local tempo line.</div>}{result.tempo.directionObservations.length > 0 && <div className="tempo-directions">{result.tempo.directionObservations.map((direction) => <div key={direction.id}><strong>{direction.text}</strong><span>{direction.outcome === 'insufficient-data' ? 'Not enough local samples' : direction.outcome === 'followed' ? 'Direction broadly followed' : 'Direction not evident'}</span><em>Qualitative only · no invented BPM curve</em></div>)}</div>}</div>
}

function RhythmDetails({ observations }: { observations: readonly RhythmObservation[] }) {
  const issues = [...observations].filter((item) => item.rhythmLoss !== null && item.intervalCategory !== 'within-tolerance').sort((left, right) => (right.rhythmLoss ?? 0) - (left.rhythmLoss ?? 0)).slice(0, 12)
  return <div className="rhythm-details"><div className="timing-detail-title"><div><TimerReset /><span><strong>Rhythm details</strong><small>Largest tempo-normalized interval deviations</small></span></div><span>{issues.length} shown</span></div>{issues.length ? <div className="rhythm-detail-rows">{issues.map((item) => <div key={item.id}><span>M{item.measureNumbers[0] ?? '—'}</span><strong>{item.intervalCategory === 'compressed' ? 'Interval compressed' : 'Interval expanded'}</strong><em>{signedMs(item.intervalDifferenceMs ?? 0)}</em><small>{item.timingCategory === 'on-time' ? 'Onset near fitted timeline' : `${item.timingCategory[0]!.toUpperCase()}${item.timingCategory.slice(1)} onset`}</small></div>)}</div> : <div className="rhythm-empty">No meaningful interval deviations exceed the current human-timing tolerance.</div>}</div>
}

function MetricSummary({ result, noteGrading }: { result: TimingAnalysisResult; noteGrading: NoteGradingResult }) {
  const metrics = [
    { label: 'Notes', value: noteGrading.metrics.noteScore, icon: Music2, detail: `${noteGrading.counts.correct} correct · ${noteGrading.counts.wrongPitch + noteGrading.counts.missed + noteGrading.counts.additional} issues` },
    { label: 'Rhythm', value: result.rhythm.rhythmScore, icon: Activity, detail: `${result.rhythm.scoredIntervalCount} scored intervals` },
    { label: 'Tempo', value: result.tempo.tempoScore, icon: Gauge, detail: result.tempo.globalTempoRatio === null ? 'Tempo ratio unavailable' : `${percent(result.tempo.globalTempoRatio)} of target` },
  ]
  return <div className="performance-dimensions">{metrics.map(({ label, value, icon: Icon, detail }) => <div key={label}><Icon /><span>{label}</span><strong>{score(value)}</strong><small>{detail}</small></div>)}</div>
}

export function TimingAnalysisPanel({ analysis, scope, noteGrading, onAnalyze }: { analysis: TimingAnalysisState; scope: GradingScopeType; noteGrading: NoteGradingResult; onAnalyze: (scope: GradingScopeType) => void }) {
  if (analysis.status === 'idle') return <section className="panel timing-state"><div className="timing-state-icon"><Clock3 /></div><div className="timing-state-copy"><span className="step-label">Phase 6 timing</span><h2>Analyze rhythm and tempo</h2><p>Separate local rhythmic proportion from target-speed control using the existing alignment transform.</p></div><ScopeControl scope={scope} onChange={onAnalyze} /><Button icon={LineChart} onClick={() => onAnalyze(scope)}>Analyze timing</Button></section>
  if (analysis.status === 'analyzing') return <section className="panel timing-state processing"><div className="timing-state-icon"><ScanSearch className="spin" /></div><div className="timing-state-copy"><span className="step-label">Timing engine</span><h2>Resolving musical intervals</h2><p>Normalizing rhythm for global speed and estimating local tempo over score-time windows.</p></div><ScopeControl scope={scope} disabled onChange={onAnalyze} /><StatusPill tone="violet">Analyzing</StatusPill></section>
  if (analysis.status === 'unavailable') return <section className="panel timing-state unavailable"><div className="timing-state-icon"><AlertCircle /></div><div className="timing-state-copy"><span className="step-label">Timing unavailable</span><h2>No trustworthy timing score</h2><p>{analysis.message}</p></div><ScopeControl scope={scope} onChange={onAnalyze} /><Button variant="secondary" icon={RefreshCw} onClick={() => onAnalyze(scope)}>Try scope</Button></section>

  const result = analysis.result
  const TrendIcon = result.tempo.trend === 'rushing' ? TrendingUp : result.tempo.trend === 'dragging' ? TrendingDown : Activity
  return <section className="panel timing-results"><div className="timing-results-header"><div><StatusPill tone={result.reliability === 'reliable' ? 'positive' : 'warning'}><Clock3 /> {result.reliability === 'reliable' ? 'Timing result ready' : result.reliability === 'limited' ? 'Limited timing evidence' : 'Provisional timing result'}</StatusPill><h2>Performance timing</h2><p>Notes, rhythm, and tempo are independent dimensions. No overall score is calculated.</p></div><ScopeControl scope={scope} onChange={onAnalyze} /></div><MetricSummary result={result} noteGrading={noteGrading} /><div className="timing-insight-grid"><div><Clock3 /><span>Effective target</span><strong>{result.tempo.target.constantEffectiveQuarterBpm === null ? `${result.tempo.target.minimumEffectiveQuarterBpm.toFixed(0)}–${result.tempo.target.maximumEffectiveQuarterBpm.toFixed(0)} BPM` : `${result.tempo.target.constantEffectiveQuarterBpm.toFixed(0)} BPM`}</strong><small>{result.tempo.target.source === 'fallback' ? 'Explicit fallback' : result.tempo.target.variableNumericTempo ? 'Authored tempo changes' : 'Authored numeric tempo'} · {Math.round(result.tempo.target.practiceSpeedMultiplier * 100)}% practice</small></div><div><Gauge /><span>Estimated average</span><strong>{result.tempo.estimatedAverageQuarterBpm === null ? '—' : `${result.tempo.estimatedAverageQuarterBpm.toFixed(1)} BPM`}</strong><small>{result.tempo.globalTempoRatio === null ? 'Insufficient strong anchors' : `${percent(result.tempo.globalTempoRatio)} of effective target`}</small></div><div><TrendIcon /><span>Tempo behavior</span><strong>{trendLabel(result.tempo.trend)}</strong><small>{result.tempo.tempoStabilityScore === null ? 'Stability needs more samples' : `${percent(result.tempo.tempoStabilityScore)} stability component`}</small></div><div><Activity /><span>Rhythm tolerance</span><strong>{percent(result.rhythm.proportionInsideTolerance)}</strong><small>Intervals inside tempo-scaled human tolerance</small></div></div><div className="timing-detail-grid"><TempoChart result={result} /><RhythmDetails observations={result.rhythm.observations} /></div>{result.rhythm.chordSpreadDiagnostics.some((item) => item.classification === 'wide') && <div className="timing-chord-note"><Music2 /><span><strong>Chord spread is diagnostic only</strong>Wide performed onsets are preserved for review but do not reduce the Phase 6 rhythm score.</span></div>}{result.warnings.some((warning) => warning.severity === 'warning') && <div className="timing-warnings"><AlertCircle /><div><strong>Timing-analysis notes</strong>{result.warnings.filter((warning) => warning.severity === 'warning').map((warning, index) => <span key={`${warning.code}:${index}`}>{warning.message}</span>)}</div></div>}<details className="timing-diagnostics"><summary>Engine diagnostics</summary><div><span>Timing engine <strong>{result.diagnostics.timingAnalysisEngineVersion}</strong></span><span>Alignment engine <strong>{result.diagnostics.alignmentEngineVersion}</strong></span><span>Correspondences <strong>{result.diagnostics.inScopeCorrespondenceCount}</strong></span><span>Strong anchors <strong>{result.diagnostics.strongAnchorCount}</strong></span><span>Rhythm intervals <strong>{result.diagnostics.scoredRhythmIntervalCount}</strong></span><span>Tempo samples <strong>{result.diagnostics.localTempoSampleCount}</strong></span></div></details></section>
}
