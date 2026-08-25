import { describe, expect, it } from 'vitest'
import { alignPerformance } from '../../alignment/alignPerformance'
import { makePlan, makeRecording } from '../../alignment/__tests__/fixtures'
import { analyzeExpression } from '../../expression-analysis/analyzeExpression'
import { analyzeTiming } from '../../timing-analysis/analyzeTiming'
import { gradeNotes } from '../../note-grading/gradeNotes'
import { makeScore } from '../../performance-results/__tests__/fixtures'
import type { PerformanceAttemptRecord, PerformanceAttemptRecordV2, PerformanceAttemptRecordV3, PerformanceAttemptRecordV4 } from '../../persistence/types'
import { analyzeVoicing } from '../../voicing-analysis/analyzeVoicing'
import type { VoicingIntentProfile } from '../../voicing-analysis/types'
import { buildVoiceLanes } from '../../voicing-analysis/voiceLanes'
import { prepareReferenceInterpretationProfile } from '../prepareReferenceInterpretationProfile'

function setup() {
  const plan = makePlan(Array.from({ length: 4 }, (_, index) => [60 + index, 48 + index]), { measureIndices: [0, 0, 1, 1] })
  const base = makeRecording(plan.attacks.map((attack, index) => ({ midi: attack.midi, ms: 1_000 + Math.floor(index / 2) * 500, velocity: index % 2 ? 30 : 95 })), { planId: plan.id })
  const recording = { ...base, keyPresses: base.keyPresses.map((press, index) => ({ ...press, releaseMs: press.attackMs + 250, releaseSequence: 100 + index })), statistics: { ...base.statistics, noteReleaseCount: base.keyPresses.length, openNoteCount: 0 } }
  const score = makeScore(plan, 2, 2)
  const alignment = alignPerformance(plan, recording)
  const noteGrading = gradeNotes({ expectedPlan: plan, recording, alignment, options: { gradingScope: 'full-plan' } })
  const timingAnalysis = analyzeTiming({ expectedPlan: plan, recording, alignment, noteGrading })
  const expressionAnalysis = analyzeExpression({ normalizedScore: score, expectedPlan: plan, recording, alignment, noteGrading })
  const lanes = buildVoiceLanes(score, plan.includedPartIds)
  const upper = lanes.find((lane) => lane.staff === 1)!
  const lower = lanes.find((lane) => lane.staff === 2)!
  const intent = (foreground = upper.id, support = lower.id, identity = 'intent:old'): VoicingIntentProfile => ({ id: identity, scoreVersionId: 'score-version', updatedAt: '2026-08-25T12:00:00.000Z', regions: [{ id: `region:${identity}`, startMeasureIndex: 0, endMeasureIndex: 1, foregroundLaneIds: [foreground], supportLaneIds: [support] }] })
  const oldIntent = intent()
  const voicingAnalysis = analyzeVoicing({ normalizedScore: score, scoreVersionId: 'score-version', expectedPlan: plan, recording, alignment, noteGrading, expressionAnalysis, intentProfile: oldIntent })
  const baseAttempt = { id: 'attempt:reference', arrangementId: 'arrangement', scoreVersionId: 'score-version', includedPartIds: plan.includedPartIds, performedAt: recording.startedAt, practiceSpeedMultiplier: 1, expectedPerformancePlan: plan, recording, alignment, noteGrading, timingAnalysis, expressionAnalysis }
  const v4 = { ...baseAttempt, schemaVersion: 4, engineVersions: { voicingAnalysis: 'frozen-voicing-version' }, voicingAnalysis } as unknown as PerformanceAttemptRecordV4
  const v3 = { ...baseAttempt, schemaVersion: 3, engineVersions: {} } as unknown as PerformanceAttemptRecordV3
  const v2 = { ...baseAttempt, schemaVersion: 2, engineVersions: {} } as unknown as PerformanceAttemptRecordV2
  return { score, plan, oldIntent, reversedIntent: intent(lower.id, upper.id, 'intent:new'), equivalentIntent: { ...oldIntent, id: 'different-id', updatedAt: '2027-01-01T00:00:00.000Z', regions: [{ ...oldIntent.regions[0]!, id: 'different-region' }] }, v4, v3, v2 }
}

describe('prepareReferenceInterpretationProfile', () => {
  it('reuses frozen V4 Voicing only when current intent is semantically equivalent', () => {
    const data = setup()
    const prepared = prepareReferenceInterpretationProfile(data.v4, data.score, data.equivalentIntent)
    expect(prepared.voicingPreparation).toBe('frozen')
    expect(prepared.voicingAnalysis).toBe(data.v4.voicingAnalysis)
    expect(prepared.profile.evidenceVersions.voicingAnalysis).toBe('frozen-voicing-version')
  })

  it('derives comparison-only Voicing under changed intent without mutating frozen history', () => {
    const data = setup()
    const before = structuredClone(data.v4) as PerformanceAttemptRecord
    const prepared = prepareReferenceInterpretationProfile(data.v4, data.score, data.reversedIntent)
    expect(prepared.voicingPreparation).toBe('derived-for-comparison')
    expect(prepared.voicingAnalysis?.id).not.toBe(data.v4.voicingAnalysis.id)
    expect(prepared.profile.evidenceVersions.voicingAnalysis).toBe(prepared.voicingAnalysis?.diagnostics.voicingAnalysisEngineVersion)
    expect(data.v4).toEqual(before)
    expect(Object.isFrozen(prepared) && Object.isFrozen(prepared.profile)).toBe(true)
  })

  it('suppresses Voicing when current intent is null and records derived V2/V3 provenance when configured', () => {
    const data = setup()
    const absent = prepareReferenceInterpretationProfile(data.v4, data.score, null)
    expect(absent).toMatchObject({ voicingPreparation: 'unavailable', voicingAnalysis: null, profile: { voicingGestures: null } })
    for (const attempt of [data.v2, data.v3]) {
      const derived = prepareReferenceInterpretationProfile(attempt, data.score, data.oldIntent)
      expect(derived.voicingPreparation).toBe('derived-for-comparison')
      expect(derived.voicingAnalysis?.intentProfileSnapshot).toEqual(data.oldIntent)
      expect(derived.profile.evidenceVersions.voicingAnalysis).toBe(derived.voicingAnalysis?.diagnostics.voicingAnalysisEngineVersion)
      expect(derived.profile.scope.end).toEqual(data.plan.statistics.totalScoreDuration)
    }
  })
})
