import { describe, expect, it } from 'vitest'
import type { ExpressionAnalysisResult } from '../../expression-analysis/types'
import type { NormalizedScore } from '../../musicxml/types'
import type { NoteGradingResult } from '../../note-grading/types'
import type { PerformanceRecording } from '../../performance/types'
import { voicingAnalysisKey } from '../../voicing-analysis/useVoicingAnalysis'
import type { VoicingIntentProfile } from '../../voicing-analysis/types'
import type { InterpretationProfile } from '../types'
import { referenceComparisonKey } from '../useReferenceComparison'

describe('Phase 11 workspace identity', () => {
  it('invalidates Voicing after recording, scope, expression, intent, or ScoreVersion changes', () => {
    const score = { id: 'score' } as NormalizedScore
    const recording = { id: 'recording-a' } as PerformanceRecording
    const note = { id: 'note-a' } as NoteGradingResult
    const expression = { id: 'expression-a' } as ExpressionAnalysisResult
    const intent = { id: 'intent', scoreVersionId: 'version-a', updatedAt: '2026-08-25T10:00:00.000Z', regions: [] } as VoicingIntentProfile
    const initial = voicingAnalysisKey(score, 'version-a', recording, note, expression, intent)
    expect(voicingAnalysisKey(score, 'version-a', { id: 'recording-b' } as PerformanceRecording, note, expression, intent)).not.toBe(initial)
    expect(voicingAnalysisKey(score, 'version-a', recording, { id: 'note-b' } as NoteGradingResult, expression, intent)).not.toBe(initial)
    expect(voicingAnalysisKey(score, 'version-a', recording, note, { id: 'expression-b' } as ExpressionAnalysisResult, intent)).not.toBe(initial)
    expect(voicingAnalysisKey(score, 'version-a', recording, note, expression, { ...intent, updatedAt: '2026-08-25T11:00:00.000Z' })).not.toBe(initial)
    expect(voicingAnalysisKey(score, 'version-b', recording, note, expression, intent)).not.toBe(initial)
    expect(voicingAnalysisKey(null, null, null, null, null, null)).not.toBe(initial)
  })

  it('invalidates reference comparison after take reset, reference selection, or Voicing changes', () => {
    const current = { attemptId: 'current' } as InterpretationProfile
    const reference = { attemptId: 'reference-a' } as InterpretationProfile
    const initial = referenceComparisonKey(current, reference, 'voicing-a')
    expect(referenceComparisonKey(current, { attemptId: 'reference-b' } as InterpretationProfile, 'voicing-a')).not.toBe(initial)
    expect(referenceComparisonKey(current, null, 'voicing-a')).not.toBe(initial)
    expect(referenceComparisonKey(current, reference, 'voicing-b')).not.toBe(initial)
    expect(referenceComparisonKey(null, reference, null)).not.toBe(initial)
  })
})
