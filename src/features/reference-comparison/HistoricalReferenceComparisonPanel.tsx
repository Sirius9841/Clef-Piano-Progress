import type { ReferenceComparisonResult } from './types'
import { ReferenceComparisonPanel } from './ReferenceComparisonPanel'

export function HistoricalReferenceComparisonPanel({ result }: { result: ReferenceComparisonResult | null }) {
  if (!result) return <section className="panel reference-comparison"><h2>Interpretation reference</h2><div className="voicing-empty"><strong>No saved Phase 11 comparison for this attempt.</strong></div></section>
  return <ReferenceComparisonPanel analysis={{ status: 'ready', result }} readOnly />
}
