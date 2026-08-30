import { useCallback, useRef, useState } from 'react'
import type { AlignmentResult } from '../alignment/types'
import type { ExpectedPerformancePlan } from '../expected-performance/types'
import type { NormalizedScore } from '../musicxml/types'
import type { NoteGradingResult } from '../note-grading/types'
import type { TimingAnalysisResult } from '../timing-analysis/types'
import type { PerformanceResults } from './types'

export type PerformanceResultsAnalysisState =
  | { status: 'idle' }
  | { status: 'building' }
  | { status: 'ready'; result: PerformanceResults }
  | { status: 'unavailable'; result?: PerformanceResults; message: string }

interface StoredResultsAnalysis {
  readonly key: string
  readonly state: PerformanceResultsAnalysisState
}

function resultKey(score: NormalizedScore | null, plan: ExpectedPerformancePlan | null, alignment: AlignmentResult | null, note: NoteGradingResult | null, timing: TimingAnalysisResult | null): string {
  return `${score?.id ?? 'none'}:${plan?.id ?? 'none'}:${alignment?.id ?? 'none'}:${note?.id ?? 'none'}:${timing?.id ?? 'none'}`
}

export function usePerformanceResults(
  score: NormalizedScore | null,
  plan: ExpectedPerformancePlan | null,
  alignment: AlignmentResult | null,
  noteGrading: NoteGradingResult | null,
  timingAnalysis: TimingAnalysisResult | null,
) {
  const analysisKey = resultKey(score, plan, alignment, noteGrading, timingAnalysis)
  const [stored, setStored] = useState<StoredResultsAnalysis>({ key: analysisKey, state: { status: 'idle' } })
  const generation = useRef(0)
  const current = stored.key === analysisKey ? stored.state : { status: 'idle' as const }

  const analyze = useCallback(async (noteOverride?: NoteGradingResult | null, timingOverride?: TimingAnalysisResult | null, alignmentOverride?: AlignmentResult | null) => {
    const note = noteOverride ?? noteGrading
    const timing = timingOverride ?? timingAnalysis
    const activeAlignment = alignmentOverride ?? alignment
    if (!score || !plan || !activeAlignment || !note || !timing) return null
    const key = resultKey(score, plan, activeAlignment, note, timing)
    const currentGeneration = ++generation.current
    setStored({ key, state: { status: 'building' } })
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
    try {
      const { buildPerformanceResults } = await import('./buildPerformanceResults')
      const result = buildPerformanceResults({ normalizedScore: score, expectedPlan: plan, alignment: activeAlignment, noteGrading: note, timingAnalysis: timing })
      if (currentGeneration !== generation.current) return null
      if (result.status === 'unavailable') setStored({ key, state: { status: 'unavailable', result, message: result.unavailableReason ?? 'Performance results are unavailable.' } })
      else setStored({ key, state: { status: 'ready', result } })
      return result
    } catch (cause) {
      if (currentGeneration !== generation.current) return null
      setStored({ key, state: { status: 'unavailable', message: cause instanceof Error ? cause.message : 'Performance results could not be prepared.' } })
      return null
    }
  }, [alignment, noteGrading, plan, score, timingAnalysis])

  return { state: current, analyze }
}
