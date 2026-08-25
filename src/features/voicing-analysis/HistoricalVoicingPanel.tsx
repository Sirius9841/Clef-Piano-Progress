import type { VoicingAnalysisResult } from './types'
import { VoicingAnalysisPanel } from './VoicingAnalysisPanel'

export function HistoricalVoicingPanel({ result }: { result: VoicingAnalysisResult | null }) {
  if (!result) return <section className="panel voicing-analysis"><h2>Voicing</h2><div className="voicing-empty"><strong>Not analyzed for this historical attempt.</strong></div></section>
  return <VoicingAnalysisPanel analysis={{ status: 'ready', result }} lanes={result.lanes} profile={result.intentProfileSnapshot} scoreVersionId={result.scoreVersionId} maxMeasureIndex={Math.max(0, ...result.lanes.flatMap((lane) => lane.measureCoverage))} readOnly />
}
