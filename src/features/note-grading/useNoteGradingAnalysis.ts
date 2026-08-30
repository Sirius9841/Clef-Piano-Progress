import { useCallback, useRef, useState } from 'react'
import type { AlignmentResult } from '../alignment/types'
import type { ExpectedPerformancePlan } from '../expected-performance/types'
import type { PerformanceRecording } from '../performance/types'
import type { GradingScopeType, NoteGradingResult } from './types'

export type NoteGradingAnalysisState =
  | { status: 'idle' }
  | { status: 'grading' }
  | { status: 'ready'; result: NoteGradingResult }
  | { status: 'unavailable'; result?: NoteGradingResult; message: string }

interface StoredNoteAnalysis {
  key: string
  scope: GradingScopeType
  state: NoteGradingAnalysisState
}

export function useNoteGradingAnalysis(
  plan: ExpectedPerformancePlan | null,
  recording: PerformanceRecording | null,
  alignment: AlignmentResult | null,
) {
  const analysisKey = `${plan?.id ?? 'none'}:${recording?.id ?? 'none'}:${alignment?.id ?? 'none'}`
  const [stored, setStored] = useState<StoredNoteAnalysis>({ key: analysisKey, scope: 'aligned-span', state: { status: 'idle' } })
  const generation = useRef(0)
  const current = stored.key === analysisKey ? stored : { key: analysisKey, scope: 'aligned-span' as const, state: { status: 'idle' as const } }

  const analyze = useCallback(async (scope: GradingScopeType = 'aligned-span', alignmentOverride?: AlignmentResult | null) => {
    const activeAlignment = alignmentOverride ?? alignment
    if (!plan || !recording || !activeAlignment) return null
    const key = `${plan.id}:${recording.id}:${activeAlignment.id}`
    const currentGeneration = ++generation.current
    setStored({ key, scope, state: { status: 'grading' } })
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
    try {
      const { gradeNotes } = await import('./gradeNotes')
      const result = gradeNotes({ expectedPlan: plan, recording, alignment: activeAlignment, options: { gradingScope: scope } })
      if (currentGeneration !== generation.current) return null
      if (result.status === 'unavailable') setStored({ key, scope, state: { status: 'unavailable', result, message: result.unavailableReason ?? 'Note grading is unavailable.' } })
      else setStored({ key, scope, state: { status: 'ready', result } })
      return result
    } catch (cause) {
      if (currentGeneration !== generation.current) return null
      setStored({ key, scope, state: { status: 'unavailable', message: cause instanceof Error ? cause.message : 'Note grading could not be prepared.' } })
      return null
    }
  }, [alignment, plan, recording])

  return { state: current.state, scope: current.scope, analyze }
}
