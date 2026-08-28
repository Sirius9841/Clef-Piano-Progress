import type { PerformanceAttemptRecord } from '../features/persistence/types'
import type { MeasureResult, PerformanceResults, ResultDimension } from '../features/performance-results/types'

export type HistoricalDimensionId = 'notes' | 'rhythm' | 'tempo' | 'dynamics' | 'articulation' | 'pedal' | 'voicing'

export interface HistoricalDimensionPresentation {
  readonly id: HistoricalDimensionId
  readonly label: string
  readonly group: 'core' | 'expression'
  readonly score: number | null
  readonly status: 'ready' | 'unavailable' | 'not-configured'
  readonly reliability: string
  readonly detail: string
}

const labels: Readonly<Record<HistoricalDimensionId, string>> = {
  notes: 'Notes', rhythm: 'Rhythm', tempo: 'Tempo', dynamics: 'Dynamics', articulation: 'Articulation', pedal: 'Pedal', voicing: 'Voicing',
}

export function historicalDimensions(attempt: PerformanceAttemptRecord): readonly HistoricalDimensionPresentation[] {
  const expression = attempt.schemaVersion !== 1 ? attempt.expressionAnalysis : null
  const pedal = attempt.schemaVersion === 3 || attempt.schemaVersion === 4 ? attempt.pedalAnalysis : null
  const voicing = attempt.schemaVersion === 4 ? attempt.voicingAnalysis : null
  const sustainCount = attempt.recording.statistics.sustainChangeCount
  return [
    ...(['notes', 'rhythm', 'tempo'] as const).map((id) => ({ id, label: labels[id], group: 'core' as const, score: attempt.performanceResults.summary[id], status: attempt.performanceResults.summary[id] === null ? 'unavailable' as const : 'ready' as const, reliability: attempt.performanceResults.reliability, detail: 'Saved Phase 7 measure and section evidence.' })),
    { id: 'dynamics' as const, label: labels.dynamics, group: 'expression' as const, score: expression?.dynamics.score ?? null, status: expression?.dynamics.status === 'ready' ? 'ready' as const : 'unavailable' as const, reliability: expression?.dynamics.reliability ?? 'unavailable', detail: expression ? 'Saved authored relative-dynamics snapshot.' : 'This attempt predates expression analysis.' },
    { id: 'articulation' as const, label: labels.articulation, group: 'expression' as const, score: expression?.articulation.score ?? null, status: expression?.articulation.status === 'ready' ? 'ready' as const : 'unavailable' as const, reliability: expression?.articulation.reliability ?? 'unavailable', detail: expression ? 'Saved physical key-articulation snapshot.' : 'This attempt predates expression analysis.' },
    { id: 'pedal' as const, label: labels.pedal, group: 'expression' as const, score: pedal?.score ?? null, status: pedal?.status === 'ready' ? 'ready' as const : 'unavailable' as const, reliability: pedal?.reliability ?? 'unavailable', detail: `${pedal ? 'Saved authored pedal snapshot.' : 'Authored pedal analysis is unavailable for this attempt.'} ${sustainCount} physical CC64 change${sustainCount === 1 ? '' : 's'} captured.` },
    { id: 'voicing' as const, label: labels.voicing, group: 'expression' as const, score: voicing?.mode === 'configured' ? voicing.score : null, status: !voicing || voicing.mode !== 'configured' ? 'not-configured' as const : voicing.status === 'ready' ? 'ready' as const : 'unavailable' as const, reliability: voicing?.reliability ?? 'unavailable', detail: voicing?.mode === 'configured' ? 'Saved explicit-intent Voicing snapshot.' : 'Not configured for this historical attempt; current preferences do not rewrite it.' },
  ]
}

export function historicalDimension(attempt: PerformanceAttemptRecord, dimensionId: HistoricalDimensionId): HistoricalDimensionPresentation {
  const dimension = historicalDimensions(attempt).find((candidate) => candidate.id === dimensionId)
  if (!dimension) throw new Error(`Unknown historical dimension: ${dimensionId}`)
  return dimension
}

export interface LowestCoreResult {
  readonly dimensions: readonly ResultDimension[]
  readonly score: number
}

export function deriveLowestCoreDimension(results: PerformanceResults): LowestCoreResult | null {
  const available = (['notes', 'rhythm', 'tempo'] as const).flatMap((dimension) => {
    const score = results.summary[dimension]
    return score === null ? [] : [{ dimension, score }]
  })
  if (!available.length) return null
  const minimum = Math.min(...available.map((item) => item.score))
  return { dimensions: available.filter((item) => Math.abs(item.score - minimum) < 1e-9).map((item) => item.dimension), score: minimum }
}

function measureScore(measure: MeasureResult, dimension: ResultDimension): number | null {
  return dimension === 'notes' ? measure.note.noteScore : dimension === 'rhythm' ? measure.rhythm.rhythmScore : measure.tempo.tempoScore
}

export interface HistoricalCoreMeasureEvidence {
  readonly measureResultId: string
  readonly displayMeasureNumber: string
  readonly score: number
  readonly confidence: MeasureResult['confidence']['category']
  readonly evidenceCount: number
}

export function coreMeasureEvidence(results: PerformanceResults, dimension: ResultDimension): readonly HistoricalCoreMeasureEvidence[] {
  return results.measures.flatMap((measure): HistoricalCoreMeasureEvidence[] => {
    const score = measureScore(measure, dimension)
    if (score === null) return []
    const evidenceCount = dimension === 'notes' ? measure.evidence.gradedNoteTargets : dimension === 'rhythm' ? measure.rhythm.scoredIntervalCount : measure.tempo.sampleCount
    return [{ measureResultId: measure.id, displayMeasureNumber: measure.displayMeasureNumber, score, confidence: measure.confidence.category, evidenceCount }]
  }).sort((left, right) => left.score - right.score || left.displayMeasureNumber.localeCompare(right.displayMeasureNumber) || left.measureResultId.localeCompare(right.measureResultId))
}
