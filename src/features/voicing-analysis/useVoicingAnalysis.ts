import { useCallback, useRef, useState } from 'react'
import type { AlignmentResult } from '../alignment/types'
import type { ExpectedPerformancePlan } from '../expected-performance/types'
import type { ExpressionAnalysisResult } from '../expression-analysis/types'
import type { NormalizedScore } from '../musicxml/types'
import type { NoteGradingResult } from '../note-grading/types'
import type { PerformanceRecording } from '../performance/types'
import type { VoicingAnalysisResult, VoicingIntentProfile } from './types'

export type VoicingAnalysisState = { status: 'idle' } | { status: 'analyzing' } | { status: 'ready'; result: VoicingAnalysisResult } | { status: 'error'; message: string }
interface Stored { readonly key: string; readonly state: VoicingAnalysisState }
export function voicingAnalysisKey(score: NormalizedScore | null, scoreVersionId: string | null, recording: PerformanceRecording | null, note: NoteGradingResult | null, expression: ExpressionAnalysisResult | null, intent: VoicingIntentProfile | null): string { return `${score?.id ?? 'none'}:${scoreVersionId ?? 'none'}:${recording?.id ?? 'none'}:${note?.id ?? 'none'}:${expression?.id ?? 'none'}:${intent?.id ?? 'none'}:${intent?.updatedAt ?? 'none'}` }

export function useVoicingAnalysis(score: NormalizedScore | null, scoreVersionId: string | null, plan: ExpectedPerformancePlan | null, recording: PerformanceRecording | null, alignment: AlignmentResult | null, note: NoteGradingResult | null, expression: ExpressionAnalysisResult | null, intent: VoicingIntentProfile | null) {
  const key = voicingAnalysisKey(score, scoreVersionId, recording, note, expression, intent)
  const [stored, setStored] = useState<Stored>({ key, state: { status: 'idle' } }); const generation = useRef(0)
  const state = stored.key === key ? stored.state : { status: 'idle' as const }
  const analyze = useCallback(async (expressionOverride?: ExpressionAnalysisResult | null, noteOverride?: NoteGradingResult | null, intentOverride?: VoicingIntentProfile | null) => {
    const nextExpression = expressionOverride ?? expression; const nextNote = noteOverride ?? note; const nextIntent = intentOverride === undefined ? intent : intentOverride
    if (!score || !scoreVersionId || !plan || !recording || !alignment || !nextNote || !nextExpression) return null
    const analysisKey = voicingAnalysisKey(score, scoreVersionId, recording, nextNote, nextExpression, nextIntent); const current = ++generation.current
    setStored({ key: analysisKey, state: { status: 'analyzing' } }); await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
    try { const { analyzeVoicing } = await import('./analyzeVoicing'); const result = analyzeVoicing({ normalizedScore: score, scoreVersionId, expectedPlan: plan, recording, alignment, noteGrading: nextNote, expressionAnalysis: nextExpression, intentProfile: nextIntent }); if (current !== generation.current) return null; setStored({ key: analysisKey, state: { status: 'ready', result } }); return result } catch (cause) { if (current !== generation.current) return null; setStored({ key: analysisKey, state: { status: 'error', message: cause instanceof Error ? cause.message : 'Voicing analysis could not be prepared.' } }); return null }
  }, [alignment, expression, intent, note, plan, recording, score, scoreVersionId])
  return { state, analyze }
}
