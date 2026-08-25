import type { NormalizedScore } from '../musicxml/types'
import { ZERO_TIME } from '../musicxml/musicalTime'
import type { PerformanceAttemptRecord } from '../persistence/types'
import { analyzeVoicing } from '../voicing-analysis/analyzeVoicing'
import { sameVoicingIntentMeaning } from '../voicing-analysis/voicingIntent'
import type { VoicingAnalysisResult, VoicingIntentProfile } from '../voicing-analysis/types'
import { buildInterpretationProfile } from './interpretationProfile'
import type { InterpretationProfile } from './types'

export type ReferenceVoicingPreparation = 'frozen' | 'derived-for-comparison' | 'unavailable'

export interface PreparedReferenceInterpretationProfile {
  readonly profile: InterpretationProfile
  readonly voicingAnalysis: VoicingAnalysisResult | null
  readonly voicingPreparation: ReferenceVoicingPreparation
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value
  seen.add(value)
  Object.values(value as Record<string, unknown>).forEach((child) => deepFreeze(child, seen))
  return Object.freeze(value)
}

export function prepareReferenceInterpretationProfile(attempt: PerformanceAttemptRecord, normalizedScore: NormalizedScore, currentIntent: VoicingIntentProfile | null): PreparedReferenceInterpretationProfile {
  const expressionAnalysis = attempt.schemaVersion === 1 ? undefined : attempt.expressionAnalysis
  const pedalAnalysis = attempt.schemaVersion === 3 || attempt.schemaVersion === 4 ? attempt.pedalAnalysis : undefined
  let voicingAnalysis: VoicingAnalysisResult | undefined
  let voicingPreparation: ReferenceVoicingPreparation = 'unavailable'

  if (currentIntent !== null && attempt.schemaVersion === 4 && sameVoicingIntentMeaning(attempt.voicingAnalysis.intentProfileSnapshot, currentIntent)) {
    voicingAnalysis = attempt.voicingAnalysis
    voicingPreparation = 'frozen'
  } else if (currentIntent !== null && expressionAnalysis) {
    voicingAnalysis = analyzeVoicing({
      normalizedScore,
      scoreVersionId: attempt.scoreVersionId,
      expectedPlan: attempt.expectedPerformancePlan,
      recording: attempt.recording,
      alignment: attempt.alignment,
      noteGrading: attempt.noteGrading,
      expressionAnalysis,
      intentProfile: currentIntent,
    })
    voicingPreparation = 'derived-for-comparison'
  }

  const engineVersions: Record<string, string> = { ...attempt.engineVersions }
  if (voicingPreparation === 'derived-for-comparison' && voicingAnalysis) engineVersions.voicingAnalysis = voicingAnalysis.diagnostics.voicingAnalysisEngineVersion
  const profile = buildInterpretationProfile({
    attemptId: attempt.id,
    arrangementId: attempt.arrangementId,
    scoreVersionId: attempt.scoreVersionId,
    includedPartIds: attempt.includedPartIds,
    performedAt: attempt.performedAt,
    practiceSpeed: attempt.practiceSpeedMultiplier,
    schemaVersion: attempt.schemaVersion,
    recordingId: attempt.recording.id,
    fullPlanStart: ZERO_TIME,
    fullPlanEnd: attempt.expectedPerformancePlan.statistics.totalScoreDuration,
    expectedGroupPositions: attempt.expectedPerformancePlan.onsetGroups.map((group) => ({ id: group.id, position: group.position })),
    timingAnalysis: attempt.timingAnalysis,
    expressionAnalysis,
    pedalAnalysis,
    voicingAnalysis,
    engineVersions,
  })
  return deepFreeze({ profile, voicingAnalysis: voicingAnalysis ?? null, voicingPreparation })
}
