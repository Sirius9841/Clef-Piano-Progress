import { Gauge } from 'lucide-react'
import type { PedalAnalysisResult } from './types'
import { PedalAnalysisPanel } from './PedalAnalysisPanel'
import type { PerformanceRecording } from '../performance/types'

export function HistoricalPedalPanel({ result, recording }: { result: PedalAnalysisResult | null; recording?: PerformanceRecording }) {
  if (result) return <PedalAnalysisPanel analysis={{ status: 'ready', result }} onAnalyze={() => undefined} readOnly />
  const sustainChanges = recording?.statistics.sustainChangeCount ?? 0
  return <section className="panel expression-state unavailable historical-pedal-unavailable"><div><Gauge /><span><small>Historical pedal</small><strong>Pedal not analyzed</strong><p>Authored pedal analysis is unavailable for this snapshot. Clef will not silently reanalyze it with a newer engine.</p><p>{sustainChanges} physical CC64 change{sustainChanges === 1 ? '' : 's'} remain factually preserved in the recording; capture is not an authored-target score.</p></span></div></section>
}
