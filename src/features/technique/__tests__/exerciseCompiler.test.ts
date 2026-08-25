import { describe, expect, it } from 'vitest'
import { alignPerformance } from '../../alignment/alignPerformance'
import { makeRecording } from '../../alignment/__tests__/fixtures'
import { gradeNotes } from '../../note-grading/gradeNotes'
import { analyzeTiming } from '../../timing-analysis/analyzeTiming'
import { analyzeTechnique } from '../analyzeTechnique'
import { defaultTechniqueSpec } from '../catalog'
import { compileTechniqueExercise } from '../exerciseCompiler'
import { TECHNIQUE_MODULE_IDS } from '../types'

describe('Technique exercise compiler', () => {
  it.each(TECHNIQUE_MODULE_IDS)('deterministically compiles the %s module through the canonical score pipeline', (moduleId) => {
    const spec = defaultTechniqueSpec(moduleId, 'fixed-seed')
    const first = compileTechniqueExercise(spec)
    const second = compileTechniqueExercise(spec)
    expect(first.snapshot).toEqual(second.snapshot)
    expect(first.expectedPerformancePlan).toEqual(second.expectedPerformancePlan)
    expect(first.snapshot.events).toHaveLength(spec.eventCount)
    expect(first.expectedPerformancePlan.onsetGroups).toHaveLength(spec.eventCount)
    expect(first.snapshot.challenge).toMatchObject({ targetTempoBpm: spec.targetTempoBpm, eventCount: spec.eventCount })
    expect(first.snapshot.generatedMusicXml).toContain('<score-partwise')
  })

  it('changes instance identity when its explicit seed or challenge changes', () => {
    const baseline = defaultTechniqueSpec('sight-reading', 'one')
    expect(compileTechniqueExercise(baseline).snapshot.id).not.toBe(compileTechniqueExercise({ ...baseline, seed: 'two' }).snapshot.id)
    expect(compileTechniqueExercise(baseline).snapshot.id).not.toBe(compileTechniqueExercise({ ...baseline, targetTempoBpm: 96 }).snapshot.id)
  })

  it('keeps Technique facets independent and suppresses novelty evidence on an exact repeat', () => {
    const compiled = compileTechniqueExercise({ ...defaultTechniqueSpec('sight-reading'), eventCount: 8 })
    const attacks = compiled.expectedPerformancePlan.onsetGroups.flatMap((group, index) => group.midiNotes.map((midi) => ({ midi, ms: index * 750 })))
    const recording = makeRecording(attacks, { planId: compiled.expectedPerformancePlan.id })
    const alignment = alignPerformance(compiled.expectedPerformancePlan, recording)
    const noteGrading = gradeNotes({ expectedPlan: compiled.expectedPerformancePlan, recording, alignment, options: { gradingScope: 'full-plan' } })
    const timingAnalysis = analyzeTiming({ expectedPlan: compiled.expectedPerformancePlan, recording, alignment, noteGrading })
    const first = analyzeTechnique({ exercise: compiled.snapshot, recording, alignment, noteGrading, timingAnalysis, novelty: { exerciseInstanceId: compiled.snapshot.id, priorSavedAttemptCount: 0, firstSavedAttempt: true } })
    const repeat = analyzeTechnique({ exercise: compiled.snapshot, recording, alignment, noteGrading, timingAnalysis, novelty: { exerciseInstanceId: compiled.snapshot.id, priorSavedAttemptCount: 1, firstSavedAttempt: false } })
    expect(first.facets.find((facet) => facet.id === 'sight-reading-first-pass')?.status).toBe('ready')
    expect(repeat.facets.find((facet) => facet.id === 'sight-reading-first-pass')).toMatchObject({ status: 'unavailable', score: null })
    expect(repeat.facets.find((facet) => facet.id === 'note-accuracy')?.status).toBe('ready')
    expect(first.facets.every((facet) => facet.challengeEvidence === first.challenge)).toBe(true)
    expect(first).not.toHaveProperty('overallScore')
    expect(first).not.toHaveProperty('skillRating')
  })

  it('does not turn missing correct-note timing evidence into a zero', () => {
    const compiled = compileTechniqueExercise({ ...defaultTechniqueSpec('rhythm'), eventCount: 8 })
    const recording = makeRecording([{ midi: compiled.expectedPerformancePlan.onsetGroups[0]!.midiNotes[0]!, ms: 0 }], { planId: compiled.expectedPerformancePlan.id })
    const alignment = alignPerformance(compiled.expectedPerformancePlan, recording)
    const noteGrading = gradeNotes({ expectedPlan: compiled.expectedPerformancePlan, recording, alignment, options: { gradingScope: 'full-plan' } })
    const timingAnalysis = analyzeTiming({ expectedPlan: compiled.expectedPerformancePlan, recording, alignment, noteGrading })
    const result = analyzeTechnique({ exercise: compiled.snapshot, recording, alignment, noteGrading, timingAnalysis, novelty: { exerciseInstanceId: compiled.snapshot.id, priorSavedAttemptCount: 0, firstSavedAttempt: true } })
    expect(result.facets.every((facet) => facet.score === null)).toBe(true)
    expect(result.status).toBe('unavailable')
  })
})
