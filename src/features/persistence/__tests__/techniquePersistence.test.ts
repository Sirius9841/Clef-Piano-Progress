import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { alignPerformance } from '../../alignment/alignPerformance'
import { makeRecording } from '../../alignment/__tests__/fixtures'
import { gradeNotes } from '../../note-grading/gradeNotes'
import { analyzeTiming } from '../../timing-analysis/analyzeTiming'
import { analyzeTechnique } from '../../technique/analyzeTechnique'
import { defaultTechniqueSpec } from '../../technique/catalog'
import { compileTechniqueExercise } from '../../technique/exerciseCompiler'
import { TECHNIQUE_ANALYSIS_ENGINE_VERSION, TECHNIQUE_EXERCISE_ENGINE_VERSION } from '../../technique/types'
import { IndexedDbPianoProgressRepository } from '../indexedDbRepository'
import type { TechniqueAttemptRecord } from '../types'

function attempt(id = 'technique-attempt:test'): TechniqueAttemptRecord {
  const compiled = compileTechniqueExercise({ ...defaultTechniqueSpec('scales', 'persistence'), eventCount: 8 })
  const attacks = compiled.expectedPerformancePlan.onsetGroups.flatMap((group, index) => group.midiNotes.map((midi) => ({ midi, ms: index * 750 })))
  const recording = makeRecording(attacks, { id: `recording:${id}`, planId: compiled.expectedPerformancePlan.id })
  const alignment = alignPerformance(compiled.expectedPerformancePlan, recording)
  const noteGrading = gradeNotes({ expectedPlan: compiled.expectedPerformancePlan, recording, alignment, options: { gradingScope: 'full-plan' } })
  const timingAnalysis = analyzeTiming({ expectedPlan: compiled.expectedPerformancePlan, recording, alignment, noteGrading })
  const novelty = { exerciseInstanceId: compiled.snapshot.id, priorSavedAttemptCount: 0, firstSavedAttempt: true }
  const techniqueAnalysis = analyzeTechnique({ exercise: compiled.snapshot, recording, alignment, noteGrading, timingAnalysis, novelty })
  return {
    schemaVersion: 1, id, moduleId: 'scales', templateId: compiled.snapshot.spec.templateId, exerciseInstanceId: compiled.snapshot.id,
    performedAt: recording.startedAt, exercise: compiled.snapshot, expectedPerformancePlan: compiled.expectedPerformancePlan, recording, alignment, noteGrading, timingAnalysis, techniqueAnalysis, novelty,
    engineVersions: { exercise: TECHNIQUE_EXERCISE_ENGINE_VERSION, parser: compiled.snapshot.parserVersion, alignment: alignment.diagnostics.alignmentEngineVersion, noteGrading: noteGrading.diagnostics.noteGradingEngineVersion, timingAnalysis: timingAnalysis.diagnostics.timingAnalysisEngineVersion, techniqueAnalysis: TECHNIQUE_ANALYSIS_ENGINE_VERSION },
  }
}

describe('Technique persistence', () => {
  it('atomically stores a lossless attempt and lightweight summary, with idempotent retry and indexes', async () => {
    const repository = new IndexedDbPianoProgressRepository({ databaseName: 'technique-save-test' })
    const record = attempt()
    await expect(repository.saveTechniqueAttempt(record)).resolves.toMatchObject({ created: true, summary: { id: record.id, moduleId: 'scales' } })
    await expect(repository.saveTechniqueAttempt(record)).resolves.toMatchObject({ created: false })
    await expect(repository.getTechniqueAttempt(record.id)).resolves.toEqual(record)
    await expect(repository.listTechniqueAttemptSummaries('scales')).resolves.toHaveLength(1)
    await expect(repository.countTechniqueAttemptsForInstance(record.exerciseInstanceId)).resolves.toBe(1)
    await expect(repository.getCounts()).resolves.toMatchObject({ techniqueAttempts: 1 })
    await repository.clearAll()
    await expect(repository.getCounts()).resolves.toMatchObject({ techniqueAttempts: 0 })
  })

  it('rolls back both Technique stores when the transaction fails between writes', async () => {
    const repository = new IndexedDbPianoProgressRepository({ databaseName: 'technique-rollback-test', faultInjector: (stage) => { if (stage === 'after-technique-attempt-write') throw new Error('fault') } })
    await expect(repository.saveTechniqueAttempt(attempt())).rejects.toBeTruthy()
    await expect(repository.getCounts()).resolves.toMatchObject({ techniqueAttempts: 0 })
    await expect(repository.listTechniqueAttemptSummaries()).resolves.toHaveLength(0)
  })

  it('rejects inconsistent frozen provenance before writing', async () => {
    const repository = new IndexedDbPianoProgressRepository({ databaseName: 'technique-invalid-test' })
    const record = attempt()
    const invalid = { ...record, exerciseInstanceId: 'different-instance' }
    await expect(repository.saveTechniqueAttempt(invalid)).rejects.toMatchObject({ code: 'REFERENTIAL_INTEGRITY' })
    await expect(repository.getCounts()).resolves.toMatchObject({ techniqueAttempts: 0 })
  })
})
