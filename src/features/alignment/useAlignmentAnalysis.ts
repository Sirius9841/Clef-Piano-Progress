import { useCallback, useRef, useState } from 'react'
import type { ExpectedPerformancePlan } from '../expected-performance/types'
import type { PerformanceRecording } from '../performance/types'
import type { AlignmentResult } from './types'

export type AlignmentAnalysisState =
  | { status: 'idle' }
  | { status: 'aligning' }
  | { status: 'ready'; result: AlignmentResult }
  | { status: 'unavailable'; result?: AlignmentResult; message: string }

interface StoredAnalysisState {
  key: string
  state: AlignmentAnalysisState
}

export function useAlignmentAnalysis(
  plan: ExpectedPerformancePlan | null,
  recording: PerformanceRecording | null,
  practiceSpeedMultiplier: number,
) {
  const analysisKey = `${plan?.id ?? 'none'}:${recording?.id ?? 'none'}:${practiceSpeedMultiplier}`
  const [stored, setStored] = useState<StoredAnalysisState>({ key: analysisKey, state: { status: 'idle' } })
  const generation = useRef(0)
  const state = stored.key === analysisKey ? stored.state : { status: 'idle' as const }

  const analyze = useCallback(async () => {
    if (!plan || !recording) return
    const currentGeneration = ++generation.current
    setStored({ key: analysisKey, state: { status: 'aligning' } })
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
    try {
      const { alignPerformance } = await import('./alignPerformance')
      const result = alignPerformance(plan, recording, { practiceSpeedMultiplier })
      if (currentGeneration !== generation.current) return
      if (result.status === 'failed' || result.status === 'insufficient-data') {
        const message = result.status === 'failed' ? 'This take exceeds current alignment guardrails.' : 'More fixed score and performed attacks are needed for alignment.'
        setStored({ key: analysisKey, state: { status: 'unavailable', result, message } })
      } else {
        setStored({ key: analysisKey, state: { status: 'ready', result } })
      }
    } catch (cause) {
      if (currentGeneration !== generation.current) return
      setStored({ key: analysisKey, state: { status: 'unavailable', message: cause instanceof Error ? cause.message : 'Alignment could not be prepared.' } })
    }
  }, [analysisKey, plan, practiceSpeedMultiplier, recording])

  return { state, analyze }
}
