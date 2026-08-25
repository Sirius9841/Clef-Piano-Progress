import { Gauge } from 'lucide-react'
import type { PedalAnalysisResult } from './types'
import { PedalAnalysisPanel } from './PedalAnalysisPanel'

export function HistoricalPedalPanel({ result }: { result: PedalAnalysisResult | null }) {
  if (result) return <PedalAnalysisPanel analysis={{ status: 'ready', result }} onAnalyze={() => undefined} readOnly />
  return <section className="panel expression-state unavailable historical-pedal-unavailable"><div><Gauge /><span><small>Historical pedal</small><strong>Pedal not analyzed</strong><p>This Phase 1–9 snapshot predates pedal analysis. Clef will not silently reanalyze it with a newer engine.</p></span></div></section>
}
