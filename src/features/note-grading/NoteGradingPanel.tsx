import { AlertCircle, BadgeCheck, CircleMinus, CircleX, ListFilter, Music2, PlusCircle, RefreshCw, ScanSearch } from 'lucide-react'
import { useState } from 'react'
import { Button, ScoreRing, StatusPill } from '../../components/ui'
import { midiNoteName } from '../midi/notes'
import type { NoteGradingAnalysisState } from './useNoteGradingAnalysis'
import type { ExpectedTargetResult, GradingScopeType, NoteGradingResult, PerformedAttackResult } from './types'

type ResultFilter = 'issues' | 'all' | 'wrong-pitch' | 'missed' | 'additional'

function percent(value: number | null): string {
  return value === null ? '—' : `${(value * 100).toFixed(1)}%`
}

function ScopeControl({ scope, disabled, onChange }: { scope: GradingScopeType; disabled?: boolean; onChange: (scope: GradingScopeType) => void }) {
  return <div className="note-scope"><span>Analyze</span><div><button className={scope === 'aligned-span' ? 'active' : ''} disabled={disabled} onClick={() => onChange('aligned-span')}>Played section</button><button className={scope === 'full-plan' ? 'active' : ''} disabled={disabled} onClick={() => onChange('full-plan')}>Full score</button></div><small>{scope === 'aligned-span' ? 'Only the portion confidently aligned to this take.' : 'All unplayed expected targets count as missed.'}</small></div>
}

interface DetailRow {
  id: string
  kind: 'correct' | 'wrong-pitch' | 'missed' | 'additional'
  measure: string
  expectedMidi: number | null
  performedMidi: number | null
  delta: number | null
  confidence: 'likely' | 'ambiguous' | null
}

function detailRows(result: NoteGradingResult): DetailRow[] {
  const groups = new Map(result.groupResults.map((group) => [group.groupAlignmentId, group]))
  const expected = result.expectedResults.flatMap((item: ExpectedTargetResult): DetailRow[] => {
    if (item.kind === 'unattempted' || item.kind === 'excluded') return []
    return [{
      id: item.id,
      kind: item.kind,
      measure: item.target.measureNumbers[0] ?? '—',
      expectedMidi: item.target.midi,
      performedMidi: item.kind === 'correct' ? item.target.midi : item.kind === 'wrong-pitch' ? item.performedMidi : null,
      delta: item.kind === 'wrong-pitch' ? item.semitoneDelta : null,
      confidence: item.kind === 'wrong-pitch' ? item.confidence : null,
    }]
  })
  const additional = result.performedResults.flatMap((item: PerformedAttackResult): DetailRow[] => item.kind === 'additional' ? [{
    id: item.id,
    kind: 'additional',
    measure: item.groupAlignmentId ? groups.get(item.groupAlignmentId)?.measureNumbers[0] ?? 'Take' : 'Take',
    expectedMidi: null,
    performedMidi: item.midi,
    delta: null,
    confidence: null,
  }] : [])
  return [...expected, ...additional]
}

function NoteResultList({ result }: { result: NoteGradingResult }) {
  const [filter, setFilter] = useState<ResultFilter>('issues')
  const rows = detailRows(result).filter((row) => filter === 'all' || filter === 'issues' ? filter === 'all' || row.kind !== 'correct' : row.kind === filter)
  const visible = rows.slice(0, 100)
  return <div className="note-detail-card"><div className="note-detail-head"><div><ListFilter /><span><strong>Note details</strong><small>Errors first · up to 100 rows</small></span></div><div className="note-filters">{(['issues', 'all', 'wrong-pitch', 'missed', 'additional'] as ResultFilter[]).map((option) => <button key={option} className={filter === option ? 'active' : ''} onClick={() => setFilter(option)}>{option === 'wrong-pitch' ? 'Wrong pitch' : option === 'additional' ? 'Extra' : option[0]!.toUpperCase() + option.slice(1)}</button>)}</div></div><div className="note-detail-rows">{visible.length ? visible.map((row) => <div className={`note-detail-row ${row.kind}`} key={row.id}><span className="note-measure">{row.measure === 'Take' ? 'Take' : `M${row.measure}`}</span><span className="note-symbol">{row.kind === 'correct' ? <BadgeCheck /> : row.kind === 'wrong-pitch' ? <CircleX /> : row.kind === 'missed' ? <CircleMinus /> : <PlusCircle />}</span><strong>{row.kind === 'wrong-pitch' ? `${midiNoteName(row.expectedMidi!)} → ${midiNoteName(row.performedMidi!)}` : row.kind === 'additional' ? `+ ${midiNoteName(row.performedMidi!)}` : midiNoteName(row.expectedMidi!)}</strong><em>{row.kind === 'wrong-pitch' ? `${row.delta! > 0 ? '+' : '−'}${Math.abs(row.delta!)} semitone${Math.abs(row.delta!) === 1 ? '' : 's'}${row.confidence === 'ambiguous' ? ' · ambiguous' : ''}` : row.kind === 'additional' ? 'Extra' : row.kind === 'missed' ? 'Missed' : 'Correct'}</em></div>) : <div className="note-detail-empty">No note results match this filter.</div>}</div>{rows.length > visible.length && <div className="note-detail-limit">Showing 100 of {rows.length} matching note results.</div>}</div>
}

export function NoteGradingPanel({ analysis, scope, onAnalyze }: { analysis: NoteGradingAnalysisState; scope: GradingScopeType; onAnalyze: (scope: GradingScopeType) => void }) {
  if (analysis.status === 'idle') return <section className="panel note-grade-state"><div className="note-state-icon"><ScanSearch /></div><div className="note-state-copy"><span className="step-label">Phase 5 note correctness</span><h2>Analyze the notes in this take</h2><p>Interpret the existing alignment as correct, wrong-pitch, missed, and extra key attacks. Timing remains ungraded.</p></div><ScopeControl scope={scope} onChange={onAnalyze} /><Button icon={Music2} onClick={() => onAnalyze(scope)}>Grade notes</Button></section>
  if (analysis.status === 'grading') return <section className="panel note-grade-state processing"><div className="note-state-icon"><ScanSearch className="spin" /></div><div className="note-state-copy"><span className="step-label">Note grading engine</span><h2>Resolving physical key results</h2><p>Prioritizing exact matches and conservatively pairing plausible pitch substitutions.</p></div><ScopeControl scope={scope} disabled onChange={onAnalyze} /><StatusPill tone="violet">Grading notes</StatusPill></section>
  if (analysis.status === 'unavailable') return <section className="panel note-grade-state unavailable"><div className="note-state-icon"><AlertCircle /></div><div className="note-state-copy"><span className="step-label">Note analysis unavailable</span><h2>No trustworthy note score</h2><p>{analysis.message}</p></div><ScopeControl scope={scope} onChange={onAnalyze} /><Button variant="secondary" icon={RefreshCw} onClick={() => onAnalyze(scope)}>Try scope</Button></section>

  const result = analysis.result
  const noteScore = (result.metrics.noteScore ?? 0) * 100
  return <section className="panel note-results"><div className="note-results-header"><div><StatusPill tone={result.reliability === 'reliable' ? 'positive' : 'warning'}><Music2 /> {result.reliability === 'reliable' ? 'Note result ready' : 'Provisional result'}</StatusPill><h2>Correct-note analysis</h2><p>{result.reliability === 'provisional' ? 'The score/performance alignment was ambiguous or incomplete; review this result provisionally.' : 'Pitch correctness only. Rhythm, tempo, dynamics, articulation, and pedal remain ungraded.'}</p></div><ScopeControl scope={scope} onChange={onAnalyze} /></div><div className="note-score-layout"><div className="note-score-card"><ScoreRing value={noteScore} label="NOTES" /><div><span>Dedicated note score</span><strong>{noteScore.toFixed(1)}</strong><small>F1 balance of note precision and recall</small></div></div><div className="note-category-grid"><div className="correct"><BadgeCheck /><span>Correct</span><strong>{result.counts.correct}</strong></div><div className="wrong"><CircleX /><span>Wrong pitch</span><strong>{result.counts.wrongPitch}</strong></div><div className="missed"><CircleMinus /><span>Missed</span><strong>{result.counts.missed}</strong></div><div className="additional"><PlusCircle /><span>Extra</span><strong>{result.counts.additional}</strong></div></div><div className="note-rate-card"><div><span>Precision</span><strong>{percent(result.metrics.precision)}</strong></div><div className="note-rate-track"><i style={{ width: `${(result.metrics.precision ?? 0) * 100}%` }} /></div><small>Expected pitch among graded attacks</small><div><span>Recall</span><strong>{percent(result.metrics.recall)}</strong></div><div className="note-rate-track"><i style={{ width: `${(result.metrics.recall ?? 0) * 100}%` }} /></div><small>Expected targets played correctly</small></div></div><NoteResultList result={result} />{result.warnings.length > 0 && <div className="note-warnings"><AlertCircle /><div><strong>Note-analysis notes</strong>{result.warnings.map((warning, index) => <span key={`${warning.code}:${index}`}>{warning.message}</span>)}</div></div>}<details className="note-diagnostics"><summary>Engine diagnostics</summary><div><span>Note engine <strong>{result.diagnostics.noteGradingEngineVersion}</strong></span><span>Alignment engine <strong>{result.diagnostics.alignmentEngineVersion}</strong></span><span>Physical targets <strong>{result.diagnostics.expectedKeyTargetCount}</strong></span><span>Excluded targets <strong>{result.counts.excludedExpectedTargets}</strong></span><span>Outside scope <strong>{result.counts.outsideScopeExpectedTargets}</strong></span><span>Flexible exclusions <strong>{result.counts.excludedFlexibleEvents}</strong></span></div></details></section>
}
