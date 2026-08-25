import { describe, expect, it } from 'vitest'
import { makePlan, makeRecording } from '../../alignment/__tests__/fixtures'
import { alignPerformance } from '../../alignment/alignPerformance'
import { gradeNotes } from '../../note-grading/gradeNotes'
import { analyzeTiming } from '../../timing-analysis/analyzeTiming'
import { musicalTime } from '../../musicxml/musicalTime'
import type { ExpressionAnalysisResult } from '../../expression-analysis/types'
import type { PedalAnalysisResult } from '../../pedal-analysis/types'
import type { VoicingAnalysisResult } from '../../voicing-analysis/types'
import { buildInterpretationProfile } from '../interpretationProfile'

describe('InterpretationProfile', () => {
  it('extracts centered tempo shape and does not fabricate absent historical dimensions', () => {
    const plan = makePlan(Array.from({ length: 8 }, (_, index) => [60 + index]))
    const recording = makeRecording(plan.attacks.map((attack, index) => ({ midi: attack.midi, ms: 1_000 + index * (index > 4 ? 600 : 500) })), { planId: plan.id })
    const alignment = alignPerformance(plan, recording)
    const note = gradeNotes({ expectedPlan: plan, recording, alignment, options: { gradingScope: 'full-plan' } })
    const timing = analyzeTiming({ expectedPlan: plan, recording, alignment, noteGrading: note })
    const v1 = buildInterpretationProfile({ attemptId: 'v1', arrangementId: 'a', scoreVersionId: 's', includedPartIds: ['P1'], performedAt: recording.startedAt, practiceSpeed: 1, schemaVersion: 1, recordingId: recording.id, expectedGroupPositions: plan.onsetGroups.map((group) => ({ id: group.id, position: group.position })), timingAnalysis: timing, engineVersions: { timingAnalysis: timing.diagnostics.timingAnalysisEngineVersion } })
    expect(v1.dynamicsGestures).toBeNull()
    expect(v1.articulationGestures).toBeNull()
    expect(v1.pedalGestures).toBeNull()
    expect(v1.voicingGestures).toBeNull()
    expect(Object.isFrozen(v1) && Object.isFrozen(v1.tempoShape)).toBe(true)
    const centered = v1.tempoShape.map((item) => item.centeredLogShape).sort((a, b) => a - b)
    expect(Math.abs(centered[Math.floor(centered.length / 2)] ?? 0)).toBeLessThan(0.2)
  })

  it('extracts only the frozen dimensions available in V2, V3, and V4 profiles', () => {
    const plan = makePlan(Array.from({ length: 8 }, (_, index) => [60 + index]))
    const recording = makeRecording(plan.attacks.map((attack, index) => ({ midi: attack.midi, ms: 1_000 + index * 500 })), { planId: plan.id })
    const alignment = alignPerformance(plan, recording)
    const note = gradeNotes({ expectedPlan: plan, recording, alignment, options: { gradingScope: 'full-plan' } })
    const timing = analyzeTiming({ expectedPlan: plan, recording, alignment, noteGrading: note })
    const position = musicalTime(2)
    const expression = { dynamics: { reliability: 'reliable', targets: [{ id: 'dynamic', kind: 'wedge', sourceEventIds: ['wedge'], position, measureNumber: '2' }], observations: [{ targetId: 'dynamic', normalizedChange: 0.2, trend: 0.1 }] }, articulation: { reliability: 'limited', targets: [{ id: 'articulation', kind: 'staccato', sourceNoteIds: ['note'], position, measureNumber: '2' }], observations: [{ targetId: 'articulation', gateRatio: 0.55, transitionGapMs: null, transitionToleranceMs: null }] } } as unknown as ExpressionAnalysisResult
    const pedal = { reliability: 'limited', diagnostics: { pedalAnalysisEngineVersion: 'pedal-analysis-1.1.1' }, targets: [{ events: [{ id: 'pedal-event', kind: 'change', sourceEventId: 'pedal-source', position, measureNumber: '2' }] }], observations: [{ targetEventId: 'pedal-event', timingErrorMs: 45 }] } as unknown as PedalAnalysisResult
    const voicing = { reliability: 'limited', targets: [{ id: 'voicing-target', position, measureNumber: '2', foregroundLaneIds: ['lane-a'], supportLaneIds: ['lane-b'], sourceNoteIds: ['note-a', 'note-b'] }], observations: [{ targetId: 'voicing-target', focusAdvantage: 0.12 }] } as unknown as VoicingAnalysisResult
    const common = { arrangementId: 'a', scoreVersionId: 's', includedPartIds: ['P1'], performedAt: recording.startedAt, practiceSpeed: 1, recordingId: recording.id, expectedGroupPositions: plan.onsetGroups.map((group) => ({ id: group.id, position: group.position })), timingAnalysis: timing, engineVersions: { timingAnalysis: timing.diagnostics.timingAnalysisEngineVersion } }
    const v2 = buildInterpretationProfile({ ...common, attemptId: 'v2', schemaVersion: 2, expressionAnalysis: expression })
    const v3 = buildInterpretationProfile({ ...common, attemptId: 'v3', schemaVersion: 3, expressionAnalysis: expression, pedalAnalysis: pedal })
    const v4 = buildInterpretationProfile({ ...common, attemptId: 'v4', schemaVersion: 4, expressionAnalysis: expression, pedalAnalysis: pedal, voicingAnalysis: voicing })
    expect(v2).toMatchObject({ dynamicsGestures: [{ key: 'wedge:wedge', value: 0.2 }], articulationGestures: [{ key: 'staccato:note', value: 0.55 }], pedalGestures: null, voicingGestures: null })
    expect(v3).toMatchObject({ pedalGestures: [{ key: 'change:pedal-source', relativeTimingMs: 45 }], voicingGestures: null })
    expect(v4).toMatchObject({ voicingGestures: [{ focusAdvantage: 0.12 }] })
  })
})
