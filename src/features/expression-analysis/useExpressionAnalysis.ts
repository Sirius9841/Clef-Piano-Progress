import { useCallback, useRef, useState } from 'react'
import type { AlignmentResult } from '../alignment/types'
import type { ExpectedPerformancePlan } from '../expected-performance/types'
import type { NormalizedScore } from '../musicxml/types'
import type { NoteGradingResult } from '../note-grading/types'
import type { PerformanceRecording } from '../performance/types'
import type { ExpressionAnalysisResult } from './types'

export type ExpressionAnalysisState =
  | { status: 'idle' }
  | { status: 'analyzing' }
  | { status: 'ready'; result: ExpressionAnalysisResult }
  | { status: 'error'; message: string }

interface StoredExpressionAnalysis { readonly key: string; readonly state: ExpressionAnalysisState }

export function expressionAnalysisKey(score: NormalizedScore | null, plan: ExpectedPerformancePlan | null, recording: PerformanceRecording | null, alignment: AlignmentResult | null, note: NoteGradingResult | null): string {
  return `${score?.id ?? 'none'}:${plan?.id ?? 'none'}:${recording?.id ?? 'none'}:${alignment?.id ?? 'none'}:${note?.id ?? 'none'}`
}

export function useExpressionAnalysis(
  score: NormalizedScore | null,
  plan: ExpectedPerformancePlan | null,
  recording: PerformanceRecording | null,
  alignment: AlignmentResult | null,
  noteGrading: NoteGradingResult | null,
) {
  const key = expressionAnalysisKey(score, plan, recording, alignment, noteGrading)
  const [stored, setStored] = useState<StoredExpressionAnalysis>({ key, state: { status: 'idle' } })
  const generation = useRef(0)
  const state = stored.key === key ? stored.state : { status: 'idle' as const }
  const analyze = useCallback(async (noteOverride?: NoteGradingResult | null) => {
    const note = noteOverride ?? noteGrading
    if (!score || !plan || !recording || !alignment || !note) return null
    const analysisKey = expressionAnalysisKey(score, plan, recording, alignment, note)
    const currentGeneration = ++generation.current
    setStored({ key: analysisKey, state: { status: 'analyzing' } })
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
    try {
      const { analyzeExpression } = await import('./analyzeExpression')
      const result = analyzeExpression({ normalizedScore: score, expectedPlan: plan, recording, alignment, noteGrading: note })
      if (currentGeneration !== generation.current) return null
      setStored({ key: analysisKey, state: { status: 'ready', result } })
      return result
    } catch (cause) {
      if (currentGeneration !== generation.current) return null
      setStored({ key: analysisKey, state: { status: 'error', message: cause instanceof Error ? cause.message : 'Expression analysis could not be prepared.' } })
      return null
    }
  }, [alignment, noteGrading, plan, recording, score])
  return { state, analyze }
}
