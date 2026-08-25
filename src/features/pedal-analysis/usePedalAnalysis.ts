import { useCallback, useRef, useState } from 'react'
import type { AlignmentResult } from '../alignment/types'
import type { ExpectedPerformancePlan } from '../expected-performance/types'
import type { ExpressionAnalysisResult } from '../expression-analysis/types'
import type { NormalizedScore } from '../musicxml/types'
import type { NoteGradingResult } from '../note-grading/types'
import type { PerformanceRecording } from '../performance/types'
import type { PedalAnalysisResult } from './types'

export type PedalAnalysisState = { status: 'idle' } | { status: 'analyzing' } | { status: 'ready'; result: PedalAnalysisResult } | { status: 'error'; message: string }
interface StoredPedalAnalysis { readonly key: string; readonly state: PedalAnalysisState }

export function pedalAnalysisKey(score: NormalizedScore | null, plan: ExpectedPerformancePlan | null, recording: PerformanceRecording | null, alignment: AlignmentResult | null, note: NoteGradingResult | null, expression: ExpressionAnalysisResult | null): string {
  return `${score?.id ?? 'none'}:${plan?.id ?? 'none'}:${recording?.id ?? 'none'}:${alignment?.id ?? 'none'}:${note?.id ?? 'none'}:${expression?.id ?? 'none'}`
}

export function usePedalAnalysis(score: NormalizedScore | null, plan: ExpectedPerformancePlan | null, recording: PerformanceRecording | null, alignment: AlignmentResult | null, note: NoteGradingResult | null, expression: ExpressionAnalysisResult | null) {
  const key = pedalAnalysisKey(score, plan, recording, alignment, note, expression)
  const [stored, setStored] = useState<StoredPedalAnalysis>({ key, state: { status: 'idle' } })
  const generation = useRef(0)
  const state = stored.key === key ? stored.state : { status: 'idle' as const }
  const analyze = useCallback(async (expressionOverride?: ExpressionAnalysisResult | null, noteOverride?: NoteGradingResult | null) => {
    const nextExpression = expressionOverride ?? expression
    const nextNote = noteOverride ?? note
    if (!score || !plan || !recording || !alignment || !nextNote || !nextExpression) return null
    const analysisKey = pedalAnalysisKey(score, plan, recording, alignment, nextNote, nextExpression)
    const currentGeneration = ++generation.current
    setStored({ key: analysisKey, state: { status: 'analyzing' } })
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
    try {
      const { analyzePedal } = await import('./analyzePedal')
      const result = analyzePedal({ normalizedScore: score, expectedPlan: plan, recording, alignment, noteGrading: nextNote, expressionAnalysis: nextExpression })
      if (currentGeneration !== generation.current) return null
      setStored({ key: analysisKey, state: { status: 'ready', result } })
      return result
    } catch (cause) {
      if (currentGeneration !== generation.current) return null
      setStored({ key: analysisKey, state: { status: 'error', message: cause instanceof Error ? cause.message : 'Pedal analysis could not be prepared.' } })
      return null
    }
  }, [alignment, expression, note, plan, recording, score])
  return { state, analyze }
}
