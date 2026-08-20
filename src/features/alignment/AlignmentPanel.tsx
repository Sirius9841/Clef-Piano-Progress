import { Activity, AlertCircle, GitCompareArrows, LoaderCircle, RefreshCw, Search, Waypoints } from 'lucide-react'
import { useState } from 'react'
import { Button, StatusPill } from '../../components/ui'
import { midiNoteName } from '../midi/notes'
import type { AlignmentAnalysisState } from './useAlignmentAnalysis'
import type { GroupAlignment, GroupCorrespondence } from './types'

function pitches(values: readonly number[]): string {
  return values.length ? values.map(midiNoteName).join(' · ') : '—'
}

function signedMilliseconds(value: number): string {
  return `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(1)} ms`
}

function AlignmentRow({ step, selected, onSelect }: { step: GroupAlignment; selected: boolean; onSelect: () => void }) {
  if (step.kind === 'correspondence') {
    return <button className={`alignment-row correspondence ${selected ? 'selected' : ''}`} onClick={onSelect}><span><small>Expected</small><strong>{pitches(step.expectedGroup.pitches)}</strong></span><i>↔</i><span><small>Performed</small><strong>{pitches(step.performedGroup.pitches)}</strong></span><em>{signedMilliseconds(step.timingResidualMs)}</em></button>
  }
  if (step.kind === 'expected-only') {
    return <div className="alignment-row expected-only"><span><small>Expected-only group</small><strong>{pitches(step.expectedGroup.pitches)}</strong></span><i>—</i><span><small>Position</small><strong>{step.expectedGroup.position.numerator}/{step.expectedGroup.position.denominator}</strong></span><em>Unpaired</em></div>
  }
  return <div className="alignment-row performed-only"><span><small>Performed-only group</small><strong>{pitches(step.performedGroup.pitches)}</strong></span><i>—</i><span><small>Observed</small><strong>{(step.performedGroup.representativeMs / 1_000).toFixed(3)} s</strong></span><em>Unpaired</em></div>
}

function CorrespondenceDetail({ correspondence }: { correspondence: GroupCorrespondence }) {
  const expectedNames = correspondence.attacks.unpairedExpectedAttackIds.map((id) => correspondence.expectedGroup.attacks.find((attack) => attack.id === id)?.midi).filter((midi) => midi !== undefined).map(midiNoteName)
  const performedNames = correspondence.attacks.unpairedPerformedAttackIds.map((id) => correspondence.performedGroup.attacks.find((attack) => attack.id === id)?.midi).filter((midi) => midi !== undefined).map(midiNoteName)
  return (
    <div className="correspondence-detail">
      <div className="detail-heading"><Search /><span><small>Selected correspondence</small><strong>{pitches(correspondence.expectedGroup.pitches)} ↔ {pitches(correspondence.performedGroup.pitches)}</strong></span></div>
      <div className="pairing-columns"><div><span>Exact pitch pairs</span>{correspondence.attacks.pairs.length ? correspondence.attacks.pairs.map((pair) => <b key={`${pair.expectedAttackId}:${pair.performedAttackId}`}>{midiNoteName(pair.midi)} ↔ {midiNoteName(pair.midi)}</b>) : <em>None</em>}</div><div><span>Unpaired expected</span>{expectedNames.length ? expectedNames.map((name, index) => <b key={`${name}:${index}`}>{name}</b>) : <em>None</em>}</div><div><span>Unpaired performed</span>{performedNames.length ? performedNames.map((name, index) => <b key={`${name}:${index}`}>{name}</b>) : <em>None</em>}</div></div>
      <div className="timing-detail"><span>Reference <strong>{(correspondence.expectedGroup.referenceMs / 1_000).toFixed(3)} s</strong></span><span>Observed <strong>{(correspondence.performedGroup.representativeMs / 1_000).toFixed(3)} s</strong></span><span>Residual <strong>{signedMilliseconds(correspondence.timingResidualMs)}</strong></span><span>Chord spread <strong>{correspondence.performedGroup.spreadMs.toFixed(1)} ms</strong></span></div>
    </div>
  )
}

export function AlignmentPanel({ analysis, onAnalyze }: { analysis: AlignmentAnalysisState; onAnalyze: () => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  if (analysis.status === 'idle') {
    return <section className="panel alignment-panel alignment-idle"><div className="alignment-state-icon"><GitCompareArrows /></div><div><span className="step-label">Phase 4 correspondence</span><h2>Prepare score ↔ performance alignment</h2><p>Map this take to expected onset groups without calculating correctness or a musical grade.</p></div><Button icon={Waypoints} onClick={onAnalyze}>Analyze alignment</Button></section>
  }
  if (analysis.status === 'aligning') {
    return <section className="panel alignment-panel alignment-processing"><div className="alignment-state-icon"><LoaderCircle className="spin" /></div><div><span className="step-label">Alignment engine</span><h2>Preparing correspondences</h2><p>Clustering performed attacks, fitting the timeline, and resolving a monotonic path.</p></div><StatusPill tone="violet">Aligning</StatusPill></section>
  }
  if (analysis.status === 'unavailable') {
    const failed = analysis.result?.status === 'failed'
    return <section className="panel alignment-panel alignment-unavailable"><div className="alignment-state-icon"><AlertCircle /></div><div><span className="step-label">Alignment unavailable</span><h2>{failed ? 'Alignment guardrail reached' : 'Insufficient alignment data'}</h2><p>{analysis.message}</p>{analysis.result && <small>{analysis.result.diagnostics.expectedGroupCount} expected groups · {analysis.result.diagnostics.performedGroupCount} performed groups</small>}</div><Button variant="secondary" icon={RefreshCw} onClick={onAnalyze}>Try again</Button></section>
  }

  const result = analysis.result
  const correspondences = result.groupAlignments.filter((step) => step.kind === 'correspondence')
  const selected = correspondences.find((step) => step.id === selectedId) ?? correspondences[0] ?? null
  return (
    <section className="panel alignment-results">
      <div className="alignment-results-header"><div><StatusPill tone="violet"><GitCompareArrows /> {result.status === 'ambiguous' ? 'Review alignment' : 'Alignment ready'}</StatusPill><h2>Score ↔ performance correspondence</h2><p>Neutral structural mapping. No correctness or timing grade has been calculated.</p></div><Button variant="ghost" icon={RefreshCw} onClick={onAnalyze}>Re-analyze</Button></div>
      <div className="alignment-metrics"><div><span>Expected groups</span><strong>{result.diagnostics.expectedGroupCount}</strong></div><div><span>Performed groups</span><strong>{result.diagnostics.performedGroupCount}</strong></div><div><span>Correspondences</span><strong>{result.diagnostics.groupCorrespondenceCount}</strong></div><div><span>Exact pitch pairs</span><strong>{result.diagnostics.exactPitchPairCount}</strong></div><div><span>Start offset</span><strong>{(result.timeTransform.offsetMs / 1_000).toFixed(2)} s</strong></div><div><span>Timeline scale</span><strong>{result.timeTransform.scale.toFixed(3)}×</strong></div></div>
      <div className="alignment-content"><div className="alignment-path"><div className="alignment-path-heading"><Waypoints /><span>Monotonic correspondence path</span><small>{result.groupAlignments.length} steps</small></div><div className="alignment-rows">{result.groupAlignments.slice(0, 80).map((step) => <AlignmentRow key={step.id} step={step} selected={step.id === selected?.id} onSelect={() => step.kind === 'correspondence' && setSelectedId(step.id)} />)}</div>{result.groupAlignments.length > 80 && <div className="alignment-truncated">Showing the first 80 path steps in this session view.</div>}</div>{selected && <CorrespondenceDetail correspondence={selected} />}</div>
      {result.warnings.length > 0 && <div className="alignment-warnings"><AlertCircle /><div><strong>Alignment notes</strong>{result.warnings.map((warning, index) => <span key={`${warning.code}:${index}`}>{warning.code.replaceAll('_', ' ')} · {warning.message}</span>)}</div></div>}
      <details className="alignment-diagnostics"><summary><Activity /> Engine diagnostics</summary><div><span>Version <strong>{result.diagnostics.alignmentEngineVersion}</strong></span><span>Coarse path cost <strong>{result.diagnostics.coarseAlignmentCost.toFixed(3)}</strong></span><span>Final path cost <strong>{result.diagnostics.finalAlignmentCost.toFixed(3)}</strong></span><span>Time anchors <strong>{result.diagnostics.retainedFitAnchorCount}/{result.diagnostics.fitAnchorCount}</strong></span><span>Median |residual| <strong>{result.diagnostics.medianAbsoluteTimingResidualMs?.toFixed(1) ?? '—'} ms</strong></span><span>Matrix cells <strong>{result.diagnostics.matrixCellCount.toLocaleString()}</strong></span></div></details>
    </section>
  )
}
