import { Sparkles } from 'lucide-react'
import type { ExpressionAnalysisResult } from './types'
import { ExpressionAnalysisPanel } from './ExpressionAnalysisPanel'

export function HistoricalExpressionPanel({ result, dimension = 'both' }: { result: ExpressionAnalysisResult | null; dimension?: 'dynamics' | 'articulation' | 'both' }) {
  if (result) return <ExpressionAnalysisPanel analysis={{ status: 'ready', result }} onAnalyze={() => undefined} readOnly dimension={dimension} />
  const label = dimension === 'both' ? 'Dynamics and Articulation' : dimension === 'dynamics' ? 'Dynamics' : 'Articulation'
  return <section className="panel expression-state unavailable historical-expression-unavailable"><div><Sparkles /><span><small>Historical expression</small><strong>{label} not analyzed</strong><p>This Phase 1–8 snapshot predates expression analysis. Clef will not silently regrade it with a newer engine.</p></span></div></section>
}
