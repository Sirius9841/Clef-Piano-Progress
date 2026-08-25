import { useCallback, useRef, useState } from 'react'
import type { InterpretationProfile, ReferenceComparisonResult } from './types'

export type ReferenceComparisonState = { status: 'idle' } | { status: 'analyzing' } | { status: 'ready'; result: ReferenceComparisonResult } | { status: 'error'; message: string }
interface Stored { readonly key: string; readonly state: ReferenceComparisonState }
export function referenceComparisonKey(current: InterpretationProfile | null, reference: InterpretationProfile | null, voicingId: string | null): string { return `${current?.attemptId ?? 'none'}:${reference?.attemptId ?? 'none'}:${voicingId ?? 'none'}` }
export function useReferenceComparison(current: InterpretationProfile | null, reference: InterpretationProfile | null, voicingId: string | null) {
  const key = referenceComparisonKey(current, reference, voicingId); const [stored, setStored] = useState<Stored>({ key, state: { status: 'idle' } }); const generation = useRef(0)
  const state = stored.key === key ? stored.state : { status: 'idle' as const }
  const analyze = useCallback(async (currentOverride?: InterpretationProfile | null, referenceOverride?: InterpretationProfile | null, voicingOverride?: string | null) => {
    const nextCurrent = currentOverride ?? current; const nextReference = referenceOverride === undefined ? reference : referenceOverride; const nextVoicing = voicingOverride ?? voicingId
    if (!nextCurrent || !nextVoicing) return null
    const analysisKey = referenceComparisonKey(nextCurrent, nextReference, nextVoicing); const currentGeneration = ++generation.current; setStored({ key: analysisKey, state: { status: 'analyzing' } }); await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
    try { const { compareInterpretations } = await import('./compareInterpretations'); const result = compareInterpretations({ current: nextCurrent, reference: nextReference, currentVoicingAnalysisId: nextVoicing }); if (currentGeneration !== generation.current) return null; setStored({ key: analysisKey, state: { status: 'ready', result } }); return result } catch (cause) { if (currentGeneration !== generation.current) return null; setStored({ key: analysisKey, state: { status: 'error', message: cause instanceof Error ? cause.message : 'Interpretation comparison could not be prepared.' } }); return null }
  }, [current, reference, voicingId])
  return { state, analyze }
}
