import { useCallback, useRef, useState } from 'react'
import type { AlignmentResult } from '../alignment/types'
import type { ExpectedPerformancePlan } from '../expected-performance/types'
import type { NoteGradingResult } from '../note-grading/types'
import type { PerformanceRecording } from '../performance/types'
import type { TimingAnalysisResult } from './types'

export type TimingAnalysisState =
  | { status: 'idle' }
  | { status: 'analyzing' }
  | { status: 'ready'; result: TimingAnalysisResult }
  | { status: 'unavailable'; result?: TimingAnalysisResult; message: string }

interface StoredTimingAnalysis {
  key: string
  state: TimingAnalysisState
}

function resultKey(plan: ExpectedPerformancePlan | null, recording: PerformanceRecording | null, alignment: AlignmentResult | null, noteGrading: NoteGradingResult | null): string {
  return `${plan?.id ?? 'none'}:${recording?.id ?? 'none'}:${alignment?.id ?? 'none'}:${noteGrading?.id ?? 'none'}`
}

export function useTimingAnalysis(
  plan: ExpectedPerformancePlan | null,
  recording: PerformanceRecording | null,
  alignment: AlignmentResult | null,
  noteGrading: NoteGradingResult | null,
) {
  const analysisKey = resultKey(plan, recording, alignment, noteGrading)
  const [stored, setStored] = useState<StoredTimingAnalysis>({ key: analysisKey, state: { status: 'idle' } })
  const generation = useRef(0)
  const current = stored.key === analysisKey ? stored.state : { status: 'idle' as const }

  const analyze = useCallback(async (noteOverride?: NoteGradingResult | null, alignmentOverride?: AlignmentResult | null) => {
    const grading = noteOverride ?? noteGrading
    const activeAlignment = alignmentOverride ?? alignment
    if (!plan || !recording || !activeAlignment || !grading) return null
    const key = resultKey(plan, recording, activeAlignment, grading)
    const currentGeneration = ++generation.current
    setStored({ key, state: { status: 'analyzing' } })
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
    try {
      const { analyzeTiming } = await import('./analyzeTiming')
      const result = analyzeTiming({ expectedPlan: plan, recording, alignment: activeAlignment, noteGrading: grading })
      if (currentGeneration !== generation.current) return null
      if (result.status === 'unavailable') setStored({ key, state: { status: 'unavailable', result, message: result.unavailableReason ?? 'Timing analysis is unavailable.' } })
      else setStored({ key, state: { status: 'ready', result } })
      return result
    } catch (cause) {
      if (currentGeneration !== generation.current) return null
      setStored({ key, state: { status: 'unavailable', message: cause instanceof Error ? cause.message : 'Timing analysis could not be prepared.' } })
      return null
    }
  }, [alignment, noteGrading, plan, recording])

  return { state: current, analyze }
}
