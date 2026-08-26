import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { alignPerformance } from '../../alignment/alignPerformance'
import { makeRecording } from '../../alignment/__tests__/fixtures'
import { gradeNotes } from '../../note-grading/gradeNotes'
import { analyzeTiming } from '../../timing-analysis/analyzeTiming'
import { analyzeTechnique } from '../../technique/analyzeTechnique'
import { defaultTechniqueSpec } from '../../technique/catalog'
import { compileTechniqueExercise } from '../../technique/exerciseCompiler'
import { TECHNIQUE_ANALYSIS_ENGINE_VERSION, TECHNIQUE_ANALYSIS_ENGINE_VERSION_V1, TECHNIQUE_ANALYSIS_ENGINE_VERSION_V2_1_1_0, TECHNIQUE_ANALYSIS_ENGINE_VERSION_V2_1_1_1, TECHNIQUE_EXERCISE_ENGINE_VERSION, TECHNIQUE_EXERCISE_ENGINE_VERSION_V1, TECHNIQUE_EXERCISE_ENGINE_VERSION_V2_1_1_0 } from '../../technique/types'
import { IndexedDbPianoProgressRepository } from '../indexedDbRepository'
import { createTechniqueAttemptSummary, PERSISTENCE_SCHEMA_VERSION, type TechniqueAttemptRecordV1, type TechniqueAttemptRecordV2 } from '../types'

function attempt(id = 'technique-attempt:test', seed = 'persistence'): TechniqueAttemptRecordV2 {
  const compiled = compileTechniqueExercise({ ...defaultTechniqueSpec('scales', seed), eventCount: 8 })
  const attacks = compiled.expectedPerformancePlan.onsetGroups.flatMap((group, index) => group.midiNotes.map((midi) => ({ midi, ms: index * 750 })))
  const baseRecording = makeRecording(attacks, { id: `recording:${id}`, planId: compiled.expectedPerformancePlan.id })
  const recording = { ...baseRecording, practiceContext: { ...baseRecording.practiceContext, scoreId: compiled.expectedPerformancePlan.scoreId } }
  const alignment = alignPerformance(compiled.expectedPerformancePlan, recording)
  const noteGrading = gradeNotes({ expectedPlan: compiled.expectedPerformancePlan, recording, alignment, options: { gradingScope: 'full-plan' } })
  const timingAnalysis = analyzeTiming({ expectedPlan: compiled.expectedPerformancePlan, recording, alignment, noteGrading })
  const novelty = { exerciseInstanceId: compiled.snapshot.id, priorSavedAttemptCount: 0, firstSavedAttempt: true }
  const techniqueAnalysis = analyzeTechnique({ exercise: compiled.snapshot, recording, alignment, noteGrading, timingAnalysis, novelty })
  return {
    schemaVersion: 2, id, moduleId: 'scales', templateId: compiled.snapshot.spec.templateId, exerciseInstanceId: compiled.snapshot.id,
    performedAt: recording.startedAt, exercise: compiled.snapshot, expectedPerformancePlan: compiled.expectedPerformancePlan, recording, alignment, noteGrading, timingAnalysis, techniqueAnalysis, novelty,
    engineVersions: { exercise: TECHNIQUE_EXERCISE_ENGINE_VERSION, parser: compiled.snapshot.parserVersion, alignment: alignment.diagnostics.alignmentEngineVersion, noteGrading: noteGrading.diagnostics.noteGradingEngineVersion, timingAnalysis: timingAnalysis.diagnostics.timingAnalysisEngineVersion, techniqueAnalysis: TECHNIQUE_ANALYSIS_ENGINE_VERSION },
  }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') throw new TypeError('Expected a mutable record.')
  return value as Record<string, unknown>
}

function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new TypeError('Expected a mutable array.')
  return value
}

function legacyAttempt(source: TechniqueAttemptRecordV2): TechniqueAttemptRecordV1 {
  const legacy = structuredClone(source) as unknown as Record<string, unknown>
  legacy.schemaVersion = 1
  const exercise = record(legacy.exercise), spec = record(exercise.spec), challenge = record(exercise.challenge)
  spec.exerciseEngineVersion = TECHNIQUE_EXERCISE_ENGINE_VERSION_V1
  if (spec.mode === 'natural-minor') spec.mode = 'minor'
  delete spec.declaredHandContext
  for (const key of ['tonic', 'mode', 'declaredHandContext', 'direction', 'subdivision', 'chordInversion', 'jumpSemitones', 'tempoShape']) delete challenge[key]
  array(exercise.events).forEach((event) => delete record(event).transitionKind)
  const analysis = record(legacy.techniqueAnalysis)
  analysis.analysisEngineVersion = TECHNIQUE_ANALYSIS_ENGINE_VERSION_V1
  const completion = record(analysis.completion)
  analysis.completion = { reachedEventCount: completion.completeCorrectOrIncorrectEventCount, expectedEventCount: completion.expectedEventCount, ratio: completion.eventCoverageRatio }
  delete analysis.findings
  analysis.challenge = structuredClone(challenge)
  array(analysis.facets).forEach((facetValue) => {
    const facet = record(facetValue)
    for (const key of ['evidenceFamily', 'evidenceContext', 'observationIds', 'minimumEvidence']) delete facet[key]
    facet.challengeEvidence = structuredClone(challenge)
  })
  array(analysis.observations).forEach((observationValue) => {
    const observation = record(observationValue)
    for (const key of ['expectedEventIds', 'performedGroupIds', 'sourceTimingObservationIds', 'sourceNoteResultIds', 'method']) delete observation[key]
    if (observation.unit === 'percent' || observation.unit === 'log-ratio') observation.unit = 'ratio'
  })
  legacy.engineVersions = { ...record(legacy.engineVersions), exercise: TECHNIQUE_EXERCISE_ENGINE_VERSION_V1, techniqueAnalysis: TECHNIQUE_ANALYSIS_ENGINE_VERSION_V1 }
  return legacy as unknown as TechniqueAttemptRecordV1
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error) })
}

async function putRaw(databaseName: string, storeName: 'techniqueAttempts' | 'techniqueAttemptSummaries', value: unknown): Promise<void> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open(databaseName); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
  const transaction = database.transaction(storeName, 'readwrite')
  transaction.objectStore(storeName).put(value)
  await transactionDone(transaction)
  database.close()
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

  it('keeps schema 4 and reads frozen V1 and V2 records side by side without rewriting V1', async () => {
    expect(PERSISTENCE_SCHEMA_VERSION).toBe(4)
    const repository = new IndexedDbPianoProgressRepository({ databaseName: 'technique-version-compatibility-test' })
    const v2 = attempt('technique-attempt:v2', 'v2')
    const v1 = legacyAttempt(attempt('technique-attempt:v1', 'v1'))
    await repository.saveTechniqueAttempt(v1)
    await repository.saveTechniqueAttempt(v2)
    await expect(repository.getTechniqueAttempt(v1.id)).resolves.toEqual(v1)
    await expect(repository.getTechniqueAttempt(v2.id)).resolves.toEqual(v2)
    const summaries = await repository.listTechniqueAttemptSummaries()
    expect(summaries).toHaveLength(2)
    expect(summaries.find((summary) => summary.id === v1.id)).not.toHaveProperty('schemaVersion')
    expect(summaries.find((summary) => summary.id === v2.id)).toMatchObject({ schemaVersion: 2, exerciseEngineVersion: TECHNIQUE_EXERCISE_ENGINE_VERSION, techniqueAnalysisEngineVersion: TECHNIQUE_ANALYSIS_ENGINE_VERSION })
  })

  it('reads every explicit historical/current V2 engine pair without a schema bump', async () => {
    const repository = new IndexedDbPianoProgressRepository({ databaseName: 'technique-v2-engine-compatibility-test' })
    const current = attempt('technique-attempt:v2-current', 'v2-current')
    const historical111Mutable = structuredClone(attempt('technique-attempt:v2-historical-111', 'v2-historical-111')) as unknown as Record<string, unknown>
    record(historical111Mutable.techniqueAnalysis).analysisEngineVersion = TECHNIQUE_ANALYSIS_ENGINE_VERSION_V2_1_1_1
    record(historical111Mutable.engineVersions).techniqueAnalysis = TECHNIQUE_ANALYSIS_ENGINE_VERSION_V2_1_1_1
    const historical111 = historical111Mutable as unknown as TechniqueAttemptRecordV2
    const historicalMutable = structuredClone(attempt('technique-attempt:v2-historical', 'v2-historical')) as unknown as Record<string, unknown>
    record(record(historicalMutable.exercise).spec).exerciseEngineVersion = TECHNIQUE_EXERCISE_ENGINE_VERSION_V2_1_1_0
    record(historicalMutable.techniqueAnalysis).analysisEngineVersion = TECHNIQUE_ANALYSIS_ENGINE_VERSION_V2_1_1_0
    record(historicalMutable.engineVersions).exercise = TECHNIQUE_EXERCISE_ENGINE_VERSION_V2_1_1_0
    record(historicalMutable.engineVersions).techniqueAnalysis = TECHNIQUE_ANALYSIS_ENGINE_VERSION_V2_1_1_0
    const historical = historicalMutable as unknown as TechniqueAttemptRecordV2
    await expect(repository.saveTechniqueAttempt(historical)).resolves.toMatchObject({ created: true })
    await expect(repository.saveTechniqueAttempt(historical111)).resolves.toMatchObject({ created: true })
    await expect(repository.saveTechniqueAttempt(current)).resolves.toMatchObject({ created: true })
    await expect(repository.getTechniqueAttempt(historical.id)).resolves.toEqual(historical)
    await expect(repository.listTechniqueAttemptSummaries()).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: historical.id, exerciseEngineVersion: 'technique-exercise-1.1.0', techniqueAnalysisEngineVersion: 'technique-analysis-1.1.0' }),
      expect.objectContaining({ id: historical111.id, exerciseEngineVersion: 'technique-exercise-1.1.1', techniqueAnalysisEngineVersion: 'technique-analysis-1.1.1' }),
      expect.objectContaining({ id: current.id, exerciseEngineVersion: 'technique-exercise-1.1.1', techniqueAnalysisEngineVersion: 'technique-analysis-1.1.2' }),
    ]))
    expect(PERSISTENCE_SCHEMA_VERSION).toBe(4)
  })

  it('rejects unsupported and mixed V2 engine identities explicitly', async () => {
    const repository = new IndexedDbPianoProgressRepository({ databaseName: 'technique-v2-engine-rejection-test' })
    const unsupported = structuredClone(attempt('technique-attempt:unsupported')) as unknown as Record<string, unknown>
    record(record(unsupported.exercise).spec).exerciseEngineVersion = 'technique-exercise-1.1.9'
    record(unsupported.engineVersions).exercise = 'technique-exercise-1.1.9'
    await expect(repository.saveTechniqueAttempt(unsupported as unknown as TechniqueAttemptRecordV2)).rejects.toMatchObject({ code: 'REFERENTIAL_INTEGRITY' })
    const mixed = structuredClone(attempt('technique-attempt:mixed')) as unknown as Record<string, unknown>
    record(record(mixed.exercise).spec).exerciseEngineVersion = TECHNIQUE_EXERCISE_ENGINE_VERSION_V2_1_1_0
    record(mixed.engineVersions).exercise = TECHNIQUE_EXERCISE_ENGINE_VERSION_V2_1_1_0
    await expect(repository.saveTechniqueAttempt(mixed as unknown as TechniqueAttemptRecordV2)).rejects.toMatchObject({ code: 'REFERENTIAL_INTEGRITY' })
    const unsupportedAnalysis = structuredClone(attempt('technique-attempt:unsupported-analysis')) as unknown as Record<string, unknown>
    record(unsupportedAnalysis.techniqueAnalysis).analysisEngineVersion = 'technique-analysis-1.1.9'
    record(unsupportedAnalysis.engineVersions).techniqueAnalysis = 'technique-analysis-1.1.9'
    await expect(repository.saveTechniqueAttempt(unsupportedAnalysis as unknown as TechniqueAttemptRecordV2)).rejects.toMatchObject({ code: 'REFERENTIAL_INTEGRITY' })
    const oldExerciseWithCurrentAnalysis = structuredClone(attempt('technique-attempt:old-current')) as unknown as Record<string, unknown>
    record(record(oldExerciseWithCurrentAnalysis.exercise).spec).exerciseEngineVersion = TECHNIQUE_EXERCISE_ENGINE_VERSION_V2_1_1_0
    record(oldExerciseWithCurrentAnalysis.engineVersions).exercise = TECHNIQUE_EXERCISE_ENGINE_VERSION_V2_1_1_0
    await expect(repository.saveTechniqueAttempt(oldExerciseWithCurrentAnalysis as unknown as TechniqueAttemptRecordV2)).rejects.toMatchObject({ code: 'REFERENTIAL_INTEGRITY' })
  })

  it('enforces frozen exercise-to-plan semantics and P1 score identity before saving', async () => {
    const corruptions: readonly [string, (value: Record<string, unknown>) => void][] = [
      ['event count', (value) => { array(record(value.expectedPerformancePlan).onsetGroups).pop() }],
      ['event position', (value) => { record(array(record(value.expectedPerformancePlan).onsetGroups)[0]).position = { numerator: 1, denominator: 8 } }],
      ['MIDI cardinality', (value) => { record(array(record(value.expectedPerformancePlan).onsetGroups)[0]).midiNotes = [] }],
      ['MIDI value', (value) => { const group = record(array(record(value.expectedPerformancePlan).onsetGroups)[0]); group.midiNotes = [99] }],
      ['part selection', (value) => { record(value.expectedPerformancePlan).includedPartIds = ['P2'] }],
      ['recording score', (value) => { record(record(value.recording).practiceContext).scoreId = 'different-score' }],
    ]
    for (const [label, corrupt] of corruptions) {
      const repository = new IndexedDbPianoProgressRepository({ databaseName: `technique-plan-guard-${label}` })
      const malformed = structuredClone(attempt(`technique-attempt:plan:${label}`)) as unknown as Record<string, unknown>
      corrupt(malformed)
      await expect(repository.saveTechniqueAttempt(malformed as unknown as TechniqueAttemptRecordV2), label).rejects.toMatchObject({ code: 'REFERENTIAL_INTEGRITY' })
      await expect(repository.getCounts()).resolves.toMatchObject({ techniqueAttempts: 0 })
    }
  })

  it('preserves aggregation-ready V2 challenge provenance without loading the full attempt', () => {
    const source = attempt()
    const variants = [
      { ...source.exercise.challenge, tonic: 6 }, { ...source.exercise.challenge, targetTempoBpm: 140 },
      { ...source.exercise.challenge, octaveSpan: 2 }, { ...source.exercise.challenge, declaredHandContext: 'left' as const },
    ]
    const summary = createTechniqueAttemptSummary(source)
    expect(summary).toMatchObject({ schemaVersion: 2, challenge: { tonic: 0, targetTempoBpm: 80, octaveSpan: 1, declaredHandContext: 'right' } })
    expect(variants.every((challenge) => JSON.stringify(challenge) !== JSON.stringify(summary.challenge))).toBe(true)
  })

  it('rejects a same-ID collision unless the entire frozen payload is identical', async () => {
    const repository = new IndexedDbPianoProgressRepository({ databaseName: 'technique-collision-test' })
    const original = attempt('technique-attempt:collision')
    await repository.saveTechniqueAttempt(original)
    await expect(repository.saveTechniqueAttempt(original)).resolves.toMatchObject({ created: false })
    const changed = structuredClone(original)
    const collision = { ...changed, recording: { ...changed.recording, durationMs: changed.recording.durationMs + 1 } }
    await expect(repository.saveTechniqueAttempt(collision)).rejects.toMatchObject({ code: 'IMMUTABLE_RECORD' })
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

  it('turns malformed stored V2 snapshots into CORRUPT_RECORD at the repository boundary', async () => {
    const corruptions: readonly [string, (value: Record<string, unknown>) => void][] = [
      ['exercise engine', (value) => { record(record(record(value.exercise).spec)).exerciseEngineVersion = 'bad' }],
      ['analysis engine', (value) => { record(value.techniqueAnalysis).analysisEngineVersion = 'bad' }],
      ['tonic', (value) => { record(record(value.exercise).spec).tonic = 12 }],
      ['MIDI', (value) => { record(array(record(value.exercise).events)[0]).midiNotes = [128] }],
      ['MusicalTime', (value) => { record(array(record(value.exercise).events)[0]).duration = { numerator: 0, denominator: 1 } }],
      ['NaN challenge', (value) => { record(record(value.exercise).challenge).expectedDurationMs = Number.NaN }],
      ['Infinity challenge', (value) => { record(record(value.exercise).challenge).rhythmicDensity = Number.POSITIVE_INFINITY }],
      ['completion ratio', (value) => { record(record(value.techniqueAnalysis).completion).eventCoverageRatio = .123 }],
      ['negative count', (value) => { record(record(value.techniqueAnalysis).completion).attemptedEventCount = -1 }],
      ['facet ID', (value) => { record(array(record(value.techniqueAnalysis).facets)[0]).id = 'invented' }],
      ['reliability', (value) => { record(array(record(value.techniqueAnalysis).facets)[0]).reliability = 'certain' }],
      ['facet score', (value) => { record(array(record(value.techniqueAnalysis).facets)[0]).score = 101 }],
      ['ready null facet', (value) => { const facet = record(array(record(value.techniqueAnalysis).facets)[0]); facet.status = 'ready'; facet.score = null }],
      ['missing observation facet', (value) => { record(array(record(value.techniqueAnalysis).observations)[0]).facetId = 'tempo-stability' }],
      ['observation score', (value) => { record(array(record(value.techniqueAnalysis).observations)[0]).score = -1 }],
      ['observation source', (value) => { record(array(record(value.techniqueAnalysis).observations)[0]).expectedEventIds = ['missing-event'] }],
      ['plan mismatch', (value) => { record(record(value.recording).practiceContext).expectedPerformancePlanId = 'wrong' }],
      ['alignment mismatch', (value) => { record(value.alignment).recordingId = 'wrong' }],
      ['note mismatch', (value) => { record(value.noteGrading).expectedPlanId = 'wrong' }],
      ['timing mismatch', (value) => { record(value.timingAnalysis).noteGradingId = 'wrong' }],
      ['technique mismatch', (value) => { record(value.techniqueAnalysis).recordingId = 'wrong' }],
      ['engine diagnostics', (value) => { record(record(value.alignment).diagnostics).alignmentEngineVersion = 'wrong' }],
    ]
    for (const [label, corrupt] of corruptions) {
      const databaseName = `technique-corruption-${label}`
      const repository = new IndexedDbPianoProgressRepository({ databaseName })
      const valid = attempt(`technique-attempt:${label}`)
      await repository.saveTechniqueAttempt(valid)
      const malformed = structuredClone(valid) as unknown as Record<string, unknown>
      corrupt(malformed)
      await putRaw(databaseName, 'techniqueAttempts', malformed)
      await expect(repository.getTechniqueAttempt(valid.id), label).rejects.toMatchObject({ code: 'CORRUPT_RECORD' })
    }
  })

  it('deeply rejects malformed V2 summaries and engine provenance', async () => {
    const corruptions: readonly ((value: Record<string, unknown>) => void)[] = [
      (value) => { record(value.challenge).tonic = 99 },
      (value) => { record(array(value.facets)[0]).score = 999 },
      (value) => { value.techniqueAnalysisEngineVersion = 'wrong' },
    ]
    for (const [index, corrupt] of corruptions.entries()) {
      const databaseName = `technique-summary-corruption-${index}`
      const repository = new IndexedDbPianoProgressRepository({ databaseName })
      const valid = attempt(`technique-attempt:summary:${index}`)
      await repository.saveTechniqueAttempt(valid)
      const summary = structuredClone(createTechniqueAttemptSummary(valid)) as unknown as Record<string, unknown>
      corrupt(summary)
      await putRaw(databaseName, 'techniqueAttemptSummaries', summary)
      await expect(repository.listTechniqueAttemptSummaries()).rejects.toMatchObject({ code: 'CORRUPT_RECORD' })
    }
  })
})
