import { AlertCircle, LoaderCircle, RotateCcw } from 'lucide-react'
import { Button, StatusPill } from '../../components/ui'
import type { TakeAnalysisPipelineState } from './useTakeAnalysisPipeline'

const stageCopy = {
  localization: 'Locating this take in the score…',
  notes: 'Preparing bounded note evidence…',
  timing: 'Preparing Rhythm and Tempo evidence…',
  results: 'Building Take Review…',
} as const

export function TakeAnalysisStatus({ state, onRetry }: { readonly state: Extract<TakeAnalysisPipelineState, { status: 'idle' | 'processing' | 'unavailable' }>; readonly onRetry: () => void }) {
  if (state.status === 'unavailable') {
    return <section className="panel take-analysis-status unavailable" aria-label="Take analysis unavailable"><StatusPill tone="warning"><AlertCircle /> Analysis unavailable</StatusPill><div><h2>This take could not be reviewed safely</h2><p>{state.message}</p></div><Button variant="secondary" icon={RotateCcw} onClick={onRetry}>Retry analysis</Button></section>
  }
  return <section className="panel take-analysis-status processing" aria-label="Preparing Take Review" aria-live="polite"><LoaderCircle className="take-analysis-spinner" /><div><span className="step-label">Preparing Take Review</span><h2>{state.status === 'processing' ? stageCopy[state.stage] : 'Starting bounded analysis…'}</h2><p>Clef keeps Notes, Rhythm, and Tempo independent and will stop if the played region cannot be identified safely.</p></div></section>
}
