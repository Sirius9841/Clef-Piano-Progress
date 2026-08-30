import { useCallback, useEffect, useRef } from 'react'
import type { AlignmentResult } from '../alignment/types'
import type { ExpectedPerformancePlan } from '../expected-performance/types'
import { useExpressionAnalysis } from '../expression-analysis/useExpressionAnalysis'
import type { NormalizedScore } from '../musicxml/types'
import type { NoteGradingResult } from '../note-grading/types'
import type { PerformanceRecording } from '../performance/types'
import { usePedalAnalysis } from '../pedal-analysis/usePedalAnalysis'
import type { VoicingIntentProfile } from '../voicing-analysis/types'
import { useVoicingAnalysis } from '../voicing-analysis/useVoicingAnalysis'

export function interpretationAnalysisPipelineKey(
  score: NormalizedScore | null,
  scoreVersionId: string | null,
  plan: ExpectedPerformancePlan | null,
  recording: PerformanceRecording | null,
  alignment: AlignmentResult | null,
  note: NoteGradingResult | null,
  intent: VoicingIntentProfile | null,
): string {
  return JSON.stringify([
    score?.id ?? null,
    scoreVersionId,
    plan?.id ?? null,
    recording?.id ?? null,
    alignment?.id ?? null,
    note?.id ?? null,
    intent?.id ?? null,
    intent?.updatedAt ?? null,
  ])
}

export function useInterpretationAnalysisPipeline(
  score: NormalizedScore | null,
  scoreVersionId: string | null,
  plan: ExpectedPerformancePlan | null,
  recording: PerformanceRecording | null,
  alignment: AlignmentResult | null,
  note: NoteGradingResult | null,
  intent: VoicingIntentProfile | null,
) {
  const key = interpretationAnalysisPipelineKey(score, scoreVersionId, plan, recording, alignment, note, intent)
  const expression = useExpressionAnalysis(score, plan, recording, alignment, note)
  const expressionResult = expression.state.status === 'ready' ? expression.state.result : null
  const pedal = usePedalAnalysis(score, plan, recording, alignment, note, expressionResult)
  const voicing = useVoicingAnalysis(score, scoreVersionId, plan, recording, alignment, note, expressionResult, intent)
  const analyzeExpression = expression.analyze
  const analyzePedal = pedal.analyze
  const analyzeVoicing = voicing.analyze
  const generation = useRef(0)
  const autoStartedKey = useRef<string | null>(null)

  const run = useCallback(async () => {
    if (!score || !scoreVersionId || !plan || !recording || !alignment || !note) return
    const runGeneration = ++generation.current
    const nextExpression = await analyzeExpression(note)
    if (runGeneration !== generation.current || !nextExpression) return
    await analyzePedal(nextExpression, note)
    if (runGeneration !== generation.current) return
    await analyzeVoicing(nextExpression, note, intent)
  }, [alignment, analyzeExpression, analyzePedal, analyzeVoicing, intent, note, plan, recording, score, scoreVersionId])

  useEffect(() => {
    if (!score || !scoreVersionId || !plan || !recording || !alignment || !note || autoStartedKey.current === key) return
    autoStartedKey.current = key
    void run()
  }, [alignment, key, note, plan, recording, run, score, scoreVersionId])

  useEffect(() => () => {
    generation.current += 1
    autoStartedKey.current = null
  }, [key])

  const retry = useCallback(() => {
    autoStartedKey.current = key
    void run()
  }, [key, run])

  return { expression, pedal, voicing, retry, analysisKey: key }
}
