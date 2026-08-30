import { useCallback, useEffect, useRef, useState } from 'react'
import { scoreRegionLocalizationHintKey } from '../alignment/options'
import type { AlignmentResult, ScoreRegionLocalizationHint } from '../alignment/types'
import { useAlignmentAnalysis } from '../alignment/useAlignmentAnalysis'
import type { ExpectedPerformancePlan } from '../expected-performance/types'
import type { NormalizedScore } from '../musicxml/types'
import { useNoteGradingAnalysis } from '../note-grading/useNoteGradingAnalysis'
import type { NoteGradingResult } from '../note-grading/types'
import type { PerformanceRecording } from '../performance/types'
import { useTimingAnalysis } from '../timing-analysis/useTimingAnalysis'
import type { TimingAnalysisResult } from '../timing-analysis/types'
import type { PerformanceResults } from './types'
import { usePerformanceResults } from './usePerformanceResults'

export type TakeAnalysisStage = 'localization' | 'notes' | 'timing' | 'results'

export type TakeAnalysisPipelineState =
  | Readonly<{ status: 'idle' }>
  | Readonly<{ status: 'processing'; stage: TakeAnalysisStage }>
  | Readonly<{ status: 'needs-confirmation'; alignment: AlignmentResult }>
  | Readonly<{ status: 'ready'; alignment: AlignmentResult; noteGrading: NoteGradingResult; timing: TimingAnalysisResult; results: PerformanceResults }>
  | Readonly<{ status: 'unavailable'; stage: TakeAnalysisStage; alignment: AlignmentResult | null; message: string }>

interface StoredPipelineState {
  readonly key: string
  readonly state: TakeAnalysisPipelineState
}

export function takeAnalysisPipelineKey(
  score: NormalizedScore | null,
  plan: ExpectedPerformancePlan | null,
  recording: PerformanceRecording | null,
  practiceSpeedMultiplier: number,
  hint: ScoreRegionLocalizationHint,
): string {
  return JSON.stringify([score?.id ?? null, plan?.id ?? null, recording?.id ?? null, practiceSpeedMultiplier, scoreRegionLocalizationHintKey(hint)])
}

export function useTakeAnalysisPipeline(
  score: NormalizedScore | null,
  plan: ExpectedPerformancePlan | null,
  recording: PerformanceRecording | null,
  practiceSpeedMultiplier: number,
  localizationHint: ScoreRegionLocalizationHint,
) {
  const key = takeAnalysisPipelineKey(score, plan, recording, practiceSpeedMultiplier, localizationHint)
  const alignment = useAlignmentAnalysis(plan, recording, practiceSpeedMultiplier, localizationHint)
  const alignmentSnapshot = alignment.state.status === 'ready' || alignment.state.status === 'unavailable' ? alignment.state.result ?? null : null
  const noteGrading = useNoteGradingAnalysis(plan, recording, alignmentSnapshot)
  const noteSnapshot = noteGrading.state.status === 'ready' || noteGrading.state.status === 'unavailable' ? noteGrading.state.result ?? null : null
  const timing = useTimingAnalysis(plan, recording, alignmentSnapshot, noteSnapshot)
  const timingSnapshot = timing.state.status === 'ready' || timing.state.status === 'unavailable' ? timing.state.result ?? null : null
  const performanceResults = usePerformanceResults(score, plan, alignmentSnapshot, noteSnapshot, timingSnapshot)
  const [stored, setStored] = useState<StoredPipelineState>({ key, state: { status: 'idle' } })
  const generation = useRef(0)
  const autoStartedKey = useRef<string | null>(null)
  const state = stored.key === key ? stored.state : { status: 'idle' as const }

  const run = useCallback(async () => {
    if (!score || !plan || !recording) return
    const runGeneration = ++generation.current
    const update = (next: TakeAnalysisPipelineState) => {
      if (runGeneration === generation.current) setStored({ key, state: next })
    }

    update({ status: 'processing', stage: 'localization' })
    const aligned = await alignment.analyze()
    if (runGeneration !== generation.current || !aligned) {
      if (runGeneration === generation.current) update({ status: 'unavailable', stage: 'localization', alignment: null, message: 'Score-region localization could not be prepared.' })
      return
    }
    const localization = aligned.localization
    if (localization?.status === 'ambiguous') {
      update({ status: 'needs-confirmation', alignment: aligned })
      return
    }
    if (!localization?.takeRegion || aligned.status === 'failed' || aligned.status === 'insufficient-data' || localization.status === 'divergent' || localization.status === 'insufficient-data') {
      update({ status: 'unavailable', stage: 'localization', alignment: aligned, message: localization?.explanation ?? 'This take cannot be localized safely.' })
      return
    }

    update({ status: 'processing', stage: 'notes' })
    const notes = await noteGrading.analyze('aligned-span', aligned)
    if (runGeneration !== generation.current) return
    if (!notes || notes.status === 'unavailable') {
      update({ status: 'unavailable', stage: 'notes', alignment: aligned, message: notes?.unavailableReason ?? 'Bounded note evidence could not be prepared.' })
      return
    }

    update({ status: 'processing', stage: 'timing' })
    const timingResult = await timing.analyze(notes, aligned)
    if (runGeneration !== generation.current) return
    if (!timingResult || timingResult.status === 'unavailable') {
      update({ status: 'unavailable', stage: 'timing', alignment: aligned, message: timingResult?.unavailableReason ?? 'Bounded timing evidence could not be prepared.' })
      return
    }

    update({ status: 'processing', stage: 'results' })
    const results = await performanceResults.analyze(notes, timingResult, aligned)
    if (runGeneration !== generation.current) return
    if (!results || results.status === 'unavailable') {
      update({ status: 'unavailable', stage: 'results', alignment: aligned, message: results?.unavailableReason ?? 'Take Review could not be prepared.' })
      return
    }
    update({ status: 'ready', alignment: aligned, noteGrading: notes, timing: timingResult, results })
  }, [alignment, key, noteGrading, performanceResults, plan, recording, score, timing])

  useEffect(() => {
    if (!score || !plan || !recording || autoStartedKey.current === key) return
    autoStartedKey.current = key
    void run()
  }, [key, plan, recording, run, score])

  useEffect(() => () => {
    generation.current += 1
    autoStartedKey.current = null
  }, [key])

  const retry = useCallback(() => {
    autoStartedKey.current = key
    void run()
  }, [key, run])

  return { state, retry, alignment, noteGrading, timing, performanceResults, analysisKey: key }
}
