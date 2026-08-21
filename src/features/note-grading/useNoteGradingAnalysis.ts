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

  const analyze = useCallback(async (scope: GradingScopeType = current.scope) => {
    if (!plan || !recording || !alignment) return null
    const currentGeneration = ++generation.current
    setStored({ key: analysisKey, scope, state: { status: 'grading' } })
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
    try {
      const { gradeNotes } = await import('./gradeNotes')
      const result = gradeNotes({ expectedPlan: plan, recording, alignment, options: { gradingScope: scope } })
      if (currentGeneration !== generation.current) return null
      if (result.status === 'unavailable') setStored({ key: analysisKey, scope, state: { status: 'unavailable', result, message: result.unavailableReason ?? 'Note grading is unavailable.' } })
      else setStored({ key: analysisKey, scope, state: { status: 'ready', result } })
      return result
    } catch (cause) {
      if (currentGeneration !== generation.current) return null
      setStored({ key: analysisKey, scope, state: { status: 'unavailable', message: cause instanceof Error ? cause.message : 'Note grading could not be prepared.' } })
      return null
    }
  }, [alignment, analysisKey, current.scope, plan, recording])

  return { state: current.state, scope: current.scope, analyze }
}
