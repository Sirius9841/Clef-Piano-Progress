import { AlertCircle, Crosshair, Music2 } from 'lucide-react'
import type { ScoreHighlightModel } from '../performance-results/highlightModel'

function issueCount(model: ScoreHighlightModel): number {
  return new Set(model.measures.flatMap((measure) => measure.mistakeIds)).size
}

function kindLabel(kind: ScoreHighlightModel['measures'][number]['kinds'][number]): string {
  const labels = { 'wrong-pitch': 'Wrong', missed: 'Missed', 'rhythm-issue': 'Rhythm', 'tempo-region': 'Tempo', 'additional-marker': 'Extra' }
  return labels[kind]
}

export function ScoreResultOverlay({ model }: { model: ScoreHighlightModel }) {
  const selected = model.measures.filter((measure) => measure.selected)
  if (selected.length === 0 && model.measures.length === 0) return null
  return <div className="score-result-overlay" aria-label="Score result focus"><div className="score-focus-copy"><Crosshair /><span><strong>{selected.length ? `Focused ${selected.length === 1 ? 'measure' : 'section'}` : 'Issue markers'}</strong><small>{selected.length ? selected.map((measure) => measure.displayMeasureNumber).join('–') : `${issueCount(model)} mapped score issue${issueCount(model) === 1 ? '' : 's'}`}</small></span></div><div className="score-focus-markers">{model.measures.slice(0, 12).map((measure) => <span className={measure.selected ? 'selected' : ''} key={measure.measureResultId} title={`${measure.mistakeIds.length} issue(s)`}>{measure.selected ? <Music2 /> : <AlertCircle />}M{measure.displayMeasureNumber}<em>{measure.mistakeIds.length}</em>{measure.kinds.map((kind) => <i className={kind} key={kind}>{kindLabel(kind)}</i>)}</span>)}</div>{model.sourceNotes.length > 0 && <small className="score-mapping-note">{model.sourceNotes.filter((note) => note.kind === 'wrong-pitch').length} wrong-pitch and {model.sourceNotes.filter((note) => note.kind === 'missed').length} missed source notes mapped deterministically. Exact glyph coloring remains isolated from grading truth.</small>}</div>
}
