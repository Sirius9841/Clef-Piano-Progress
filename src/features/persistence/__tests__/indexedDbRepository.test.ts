import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { makeResultPlan, recordingForPlan, analyzeResult } from '../../performance-results/__tests__/fixtures'
import { analyzeExpression } from '../../expression-analysis/analyzeExpression'
import { analyzePedal } from '../../pedal-analysis/analyzePedal'
import { analyzeVoicing } from '../../voicing-analysis/analyzeVoicing'
import { buildInterpretationProfile } from '../../reference-comparison/interpretationProfile'
import { compareInterpretations } from '../../reference-comparison/compareInterpretations'
import { ZERO_TIME } from '../../musicxml/musicalTime'
import type { PedalAnalysisResult } from '../../pedal-analysis/types'
import { clearCurrentTake } from '../../practice/takeWorkspace'
import { PERSISTENCE_SCHEMA_VERSION, type PerformanceAttemptRecord, type PerformanceAttemptRecordV2, type PerformanceAttemptRecordV3, type PerformanceAttemptRecordV4, type PracticeSessionRecord } from '../types'
import { IndexedDbPianoProgressRepository } from '../indexedDbRepository'

function ids() {
  let value = 0
  return () => `id-${++value}`
}

function importInput(xml = '<score-partwise version="4.0"><part-list /></score-partwise>') {
  return {
    relationship: 'new-work' as const,
    work: { title: 'Test Work', composer: 'Test Composer' },
    arrangement: { name: 'Piano solo', difficulty: 'Intermediate' as const, includedPartIds: ['P1'] },
    loaded: { fileName: 'test.musicxml', sourceFormat: 'musicxml' as const, musicXmlText: xml, sourceBytes: xml.length, uncompressedBytes: xml.length },
    normalizedScoreId: 'score:test',
    parserVersion: 'test-parser-1',
    status: 'Learning' as const,
  }
}

function attemptFixture(arrangementId: string, scoreVersionId: string, sessionId = 'practice-1', suffix = '1') {
  const plan = makeResultPlan(2, 2)
  const recording = recordingForPlan(plan)
  const analysis = analyzeResult(plan, recording)
  const startedAt = `2026-08-0${suffix}T10:00:00.000Z`
  const attempt: PerformanceAttemptRecord = {
    id: `attempt-${suffix}`,
    schemaVersion: 1,
    arrangementId,
    scoreVersionId,
    practiceSessionId: sessionId,
    performedAt: startedAt,
    practiceSpeedMultiplier: 1,
    gradingScope: 'full-plan',
    includedPartIds: plan.includedPartIds,
    engineVersions: {
      alignment: analysis.alignment.diagnostics.alignmentEngineVersion,
      noteGrading: analysis.noteGrading.diagnostics.noteGradingEngineVersion,
      timingAnalysis: analysis.timingAnalysis.diagnostics.timingAnalysisEngineVersion,
      resultAggregation: analysis.results.diagnostics.resultAggregationVersion,
    },
    expectedPerformancePlan: plan,
    recording,
    alignment: analysis.alignment,
    noteGrading: analysis.noteGrading,
    timingAnalysis: analysis.timingAnalysis,
    performanceResults: analysis.results,
  }
  const session: PracticeSessionRecord = {
    id: sessionId,
    arrangementId,
    scoreVersionId,
    startedAt,
    endedAt: new Date(new Date(startedAt).getTime() + 60_000).toISOString(),
    durationMs: 60_000,
    attemptIds: [attempt.id],
  }
  return { attempt, session, score: analysis.score }
}

function v2AttemptFixture(arrangementId: string, scoreVersionId: string, sessionId = 'practice-v2') {
  const fixture = attemptFixture(arrangementId, scoreVersionId, sessionId, '2')
  const expressionAnalysis = analyzeExpression({
    normalizedScore: fixture.score,
    expectedPlan: fixture.attempt.expectedPerformancePlan,
    recording: fixture.attempt.recording,
    alignment: fixture.attempt.alignment,
    noteGrading: fixture.attempt.noteGrading,
  })
  const attempt: PerformanceAttemptRecordV2 = {
    ...fixture.attempt,
    schemaVersion: 2,
    engineVersions: { ...fixture.attempt.engineVersions, expressionAnalysis: expressionAnalysis.diagnostics.expressionAnalysisEngineVersion },
    expressionAnalysis,
  }
  return { ...fixture, attempt }
}

function v3AttemptFixture(arrangementId: string, scoreVersionId: string, sessionId = 'practice-v3') {
  const fixture = v2AttemptFixture(arrangementId, scoreVersionId, sessionId)
  const recording = { ...fixture.attempt.recording, initialSustain: { observed: false, down: null, value: null } as const }
  const expressionAnalysis = { ...fixture.attempt.expressionAnalysis, recordingId: recording.id }
  const pedalAnalysis = analyzePedal({ normalizedScore: fixture.score, expectedPlan: fixture.attempt.expectedPerformancePlan, recording, alignment: fixture.attempt.alignment, noteGrading: fixture.attempt.noteGrading, expressionAnalysis })
  const attempt: PerformanceAttemptRecordV3 = {
    ...fixture.attempt,
    recording,
    expressionAnalysis,
    schemaVersion: 3,
    engineVersions: { ...fixture.attempt.engineVersions, pedalAnalysis: pedalAnalysis.diagnostics.pedalAnalysisEngineVersion },
    pedalAnalysis,
  }
  return { ...fixture, attempt }
}

function legacyV3AttemptFixture(arrangementId: string, scoreVersionId: string) {
  const fixture = v3AttemptFixture(arrangementId, scoreVersionId, 'practice-v3-legacy')
  const pedal = structuredClone(fixture.attempt.pedalAnalysis) as unknown as Record<string, unknown>
  const remove = (value: unknown, keys: readonly string[]) => {
    if (typeof value !== 'object' || value === null) return
    const record = value as Record<string, unknown>
    keys.forEach((key) => { delete record[key] })
  }
  const diagnostics = pedal.diagnostics as Record<string, unknown>
  diagnostics.pedalAnalysisEngineVersion = 'pedal-analysis-1.0.0'
  remove(diagnostics, ['localTimingAnchorCount', 'globalTimingFallbackCount', 'meanTimingAnchorConfidence'])
  remove(pedal.coverage, ['fullyAnalyzedPhraseCount', 'partiallyAnalyzedPhraseCount', 'unanalyzedPhraseCount', 'authoredEventCount', 'analyzedEventCount', 'truncatedEventCount', 'unavailableEventCount', 'eventCoverageRatio'])
  remove(pedal.controllerEvidence, ['channelMode', 'channels', 'authoritativeChannel'])
  const timeline = pedal.timeline as Record<string, unknown>
  remove(timeline.controllerEvidence, ['channelMode', 'channels', 'authoritativeChannel'])
  const transitions = timeline.transitions as unknown[]
  const targets = pedal.targets as Array<Record<string, unknown>>
  const observations = pedal.observations as unknown[]
  const phraseResults = pedal.phraseResults as unknown[]
  transitions.forEach((transition) => remove(transition, ['channel']))
  targets.forEach((target) => (target.events as unknown[]).forEach((event) => remove(event, ['timingAnchor'])))
  observations.forEach((observation) => remove(observation, ['timingAnchorSource', 'globalExpectedMs', 'anchoredExpectedMs', 'anchorOffsetFromGlobalMs', 'beforeExpectedGroupId', 'afterExpectedGroupId', 'anchorPerformedGroupIds']))
  phraseResults.forEach((phrase) => remove(phrase, ['authoredEventCount', 'analyzedEventCount', 'truncatedEventCount', 'unavailableEventCount', 'coverageRatio', 'completeness']))
  const attempt: PerformanceAttemptRecordV3 = {
    ...fixture.attempt,
    engineVersions: { ...fixture.attempt.engineVersions, pedalAnalysis: 'pedal-analysis-1.0.0' },
    pedalAnalysis: pedal as unknown as PedalAnalysisResult,
  }
  return { ...fixture, attempt }
}

function historicalV11AttemptFixture(arrangementId: string, scoreVersionId: string) {
  const fixture = v3AttemptFixture(arrangementId, scoreVersionId, 'practice-v3-historical-1-1')
  const pedalAnalysis = {
    ...fixture.attempt.pedalAnalysis,
    diagnostics: { ...fixture.attempt.pedalAnalysis.diagnostics, pedalAnalysisEngineVersion: 'pedal-analysis-1.1.0' },
  }
  const attempt: PerformanceAttemptRecordV3 = {
    ...fixture.attempt,
    engineVersions: { ...fixture.attempt.engineVersions, pedalAnalysis: 'pedal-analysis-1.1.0' },
    pedalAnalysis,
  }
  return { ...fixture, attempt }
}

function v4AttemptFixture(arrangementId: string, scoreVersionId: string, sessionId = 'practice-v4') {
  const fixture = v3AttemptFixture(arrangementId, scoreVersionId, sessionId)
  const voicingAnalysis = analyzeVoicing({ normalizedScore: fixture.score, scoreVersionId, expectedPlan: fixture.attempt.expectedPerformancePlan, recording: fixture.attempt.recording, alignment: fixture.attempt.alignment, noteGrading: fixture.attempt.noteGrading, expressionAnalysis: fixture.attempt.expressionAnalysis, intentProfile: null })
  const current = buildInterpretationProfile({ attemptId: fixture.attempt.id, arrangementId, scoreVersionId, includedPartIds: fixture.attempt.includedPartIds, performedAt: fixture.attempt.performedAt, practiceSpeed: fixture.attempt.practiceSpeedMultiplier, schemaVersion: 4, recordingId: fixture.attempt.recording.id, fullPlanStart: ZERO_TIME, fullPlanEnd: fixture.attempt.expectedPerformancePlan.statistics.totalScoreDuration, expectedGroupPositions: fixture.attempt.expectedPerformancePlan.onsetGroups.map((group) => ({ id: group.id, position: group.position })), timingAnalysis: fixture.attempt.timingAnalysis, expressionAnalysis: fixture.attempt.expressionAnalysis, pedalAnalysis: fixture.attempt.pedalAnalysis, voicingAnalysis, engineVersions: { ...fixture.attempt.engineVersions, voicingAnalysis: voicingAnalysis.diagnostics.voicingAnalysisEngineVersion } })
  const referenceComparison = compareInterpretations({ current, reference: null, currentVoicingAnalysisId: voicingAnalysis.id })
  const attempt: PerformanceAttemptRecordV4 = { ...fixture.attempt, schemaVersion: 4, engineVersions: { ...fixture.attempt.engineVersions, voicingAnalysis: voicingAnalysis.diagnostics.voicingAnalysisEngineVersion, referenceComparison: referenceComparison.diagnostics.referenceComparisonEngineVersion }, voicingAnalysis, referenceComparison }
  return { ...fixture, attempt }
}

function v4AttemptWithNestedEvidence(arrangementId: string, scoreVersionId: string) {
  const fixture = v4AttemptFixture(arrangementId, scoreVersionId)
  const target = { id: 'voicing-target', regionId: 'region', position: ZERO_TIME, measureIndex: 0, measureNumber: '1', foregroundLaneIds: ['lane:upper'], supportLaneIds: ['lane:lower'], foregroundExpectedTargetIds: ['expected:upper'], supportExpectedTargetIds: ['expected:lower'], sourceNoteIds: ['note:upper', 'note:lower'] }
  const observation = { id: 'voicing-observation', targetId: target.id, regionId: target.regionId, position: ZERO_TIME, measureIndex: 0, measureNumber: '1', foregroundObservationIds: ['observed:upper'], supportObservationIds: ['observed:lower'], foregroundIntensity: 0.8, supportIntensity: 0.4, focusAdvantage: 0.4, score: 0.9, summary: 'Configured foreground is more projected.' }
  const voicingAnalysis = { ...fixture.attempt.voicingAnalysis, mode: 'configured' as const, intentProfileSnapshot: { id: 'intent', scoreVersionId, updatedAt: '2026-08-25T12:00:00.000Z', regions: [{ id: 'region', startMeasureIndex: 0, endMeasureIndex: 0, foregroundLaneIds: ['lane:upper'], supportLaneIds: ['lane:lower'] }] }, targets: [target], observations: [observation], regionResults: [{ regionId: 'region', targetCount: 1, analyzedTargetCount: 1, score: 0.9 }], lanes: [{ id: 'lane:upper', partId: 'P1', partName: 'Piano', staff: 1, voice: '1', measureCoverage: [0], noteCount: 1, ambiguous: false, label: 'Upper' }, { id: 'lane:lower', partId: 'P1', partName: 'Piano', staff: 2, voice: '2', measureCoverage: [0], noteCount: 1, ambiguous: false, label: 'Lower' }], laneStatistics: [{ laneId: 'lane:upper', sampleCount: 1, medianNormalizedIntensity: 0.8 }], coverage: { configuredTargetCount: 1, analyzedTargetCount: 1, ratio: 1 }, diagnostics: { ...fixture.attempt.voicingAnalysis.diagnostics, configuredRegionCount: 1, targetCount: 1, analyzedTargetCount: 1 } }
  const difference = { id: 'reference-tempo:one', key: 'tempo:one', position: ZERO_TIME, measureNumbers: ['1'], currentValue: 0.1, referenceValue: 0.05, signedDifference: 0.05, magnitude: 0.05, similarity: 'similar' as const, description: 'The tempo shapes are similar.' }
  const tempo = { status: 'ready' as const, reliability: 'limited' as const, unavailableReason: null, coverage: { currentCount: 1, referenceCount: 1, sharedCount: 1, ratio: 1 }, observations: [difference], summary: 'Tempo shape is similar across the shared evidence.' }
  const referenceComparison = { ...fixture.attempt.referenceComparison, status: 'ready' as const, reliability: 'limited' as const, unavailableReason: null, referenceAttemptId: 'attempt:reference', referencePerformedAt: '2026-08-20T12:00:00.000Z', referencePracticeSpeed: 1, referenceSchemaVersion: 4 as const, referenceEngineVersions: {}, overlapScope: { start: ZERO_TIME, end: fixture.attempt.expectedPerformancePlan.statistics.totalScoreDuration }, tempo, currentVoicingAnalysisId: voicingAnalysis.id, diagnostics: { ...fixture.attempt.referenceComparison.diagnostics, referenceEngineVersions: {} } }
  const attempt: PerformanceAttemptRecordV4 = { ...fixture.attempt, voicingAnalysis, referenceComparison }
  return { ...fixture, attempt }
}

function withPartSelections(
  fixture: ReturnType<typeof attemptFixture>,
  attemptPartIds: readonly string[],
  planPartIds: readonly string[],
) {
  return {
    ...fixture,
    attempt: {
      ...fixture.attempt,
      includedPartIds: attemptPartIds,
      expectedPerformancePlan: { ...fixture.attempt.expectedPerformancePlan, includedPartIds: [...planPartIds] },
    },
  }
}

function repository(name: string, faultInjector?: () => void) {
  return new IndexedDbPianoProgressRepository({ databaseName: name, createId: ids(), now: () => new Date('2026-08-21T12:00:00.000Z'), ...(faultInjector ? { faultInjector } : {}) })
}

function openDatabase(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function putRawAttempt(name: string, value: unknown): Promise<void> {
  const database = await openDatabase(name)
  const transaction = database.transaction('performanceAttempts', 'readwrite')
  transaction.objectStore('performanceAttempts').add(value)
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
  database.close()
}

function nestedRecord(root: Record<string, unknown>, ...path: readonly (string | number)[]): Record<string, unknown> {
  let value: unknown = root
  for (const segment of path) value = typeof segment === 'number' ? (value as unknown[])[segment] : (value as Record<string, unknown>)[segment]
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Expected nested test record at ${path.join('.')}.`)
  return value as Record<string, unknown>
}

function createLegacyV1Database(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1)
    request.onupgradeneeded = () => {
      for (const storeName of ['works', 'arrangements', 'scoreVersions', 'repertoire', 'practiceSessions', 'performanceAttempts', 'attemptSummaries']) {
        request.result.createObjectStore(storeName, { keyPath: 'id' })
      }
      request.transaction?.objectStore('arrangements').add({
        id: 'legacy-arrangement', workId: 'legacy-work', name: 'Legacy', difficulty: 'Intermediate', source: 'user-imported',
        includedPartIds: ['P1'], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
      })
      request.transaction?.objectStore('scoreVersions').add({
        id: 'legacy-score', arrangementId: 'legacy-arrangement', version: 1, format: 'musicxml', createdAt: '2026-01-01T00:00:00.000Z',
        sourceFileName: 'legacy.musicxml', sourceBytes: 10, uncompressedBytes: 10, contentHash: 'legacy-hash', canonicalMusicXml: '<score-partwise/>',
        normalizedScoreId: 'legacy-model', parserVersion: 'legacy-parser',
      })
    }
    request.onsuccess = () => { request.result.close(); resolve() }
    request.onerror = () => reject(request.error)
  })
}

function createLegacyV3Database(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 3)
    request.onupgradeneeded = () => {
      for (const storeName of ['works', 'arrangements', 'scoreVersions', 'repertoire', 'practiceSessions', 'performanceAttempts', 'attemptSummaries']) request.result.createObjectStore(storeName, { keyPath: 'id' })
      request.transaction?.objectStore('works').add({ id: 'preserved-work', title: 'Preserved', composer: 'Test', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' })
    }
    request.onsuccess = () => { request.result.close(); resolve() }
    request.onerror = () => reject(request.error)
  })
}

describe('IndexedDbPianoProgressRepository', () => {
  it('initializes a fresh versioned database and starts empty', async () => {
    const repo = repository('fresh-db')
    await repo.initialize()
    await expect(repo.getCounts()).resolves.toEqual({ works: 0, arrangements: 0, scoreVersions: 0, repertoireEntries: 0, practiceSessions: 0, performanceAttempts: 0, techniqueAttempts: 0 })
    const database = await openDatabase('fresh-db')
    expect(database.version).toBe(4)
    expect([...database.objectStoreNames]).toEqual(['arrangements', 'attemptSummaries', 'performanceAttempts', 'practiceSessions', 'repertoire', 'scoreVersions', 'techniqueAttemptSummaries', 'techniqueAttempts', 'works'])
    database.close()
  })

  it('upgrades V3 additively and preserves existing data', async () => {
    await createLegacyV3Database('legacy-v3-db')
    const repo = repository('legacy-v3-db')
    await repo.initialize()
    await expect(repo.listWorks()).resolves.toMatchObject([{ id: 'preserved-work' }])
    const database = await openDatabase('legacy-v3-db')
    expect(database.version).toBe(4)
    expect(database.objectStoreNames.contains('techniqueAttempts')).toBe(true)
    expect(database.objectStoreNames.contains('techniqueAttemptSummaries')).toBe(true)
    database.close()
  })

  it('clears a rejected open promise so Retry can reopen, then caches the successful connection', async () => {
    let openCount = 0
    const repo = new IndexedDbPianoProgressRepository({
      databaseName: 'open-retry-db',
      openDatabaseRequest: (name, version) => {
        openCount += 1
        if (openCount === 1) throw new Error('simulated transient open failure')
        return indexedDB.open(name, version)
      },
    })
    await expect(repo.initialize()).rejects.toMatchObject({ code: 'DATABASE_OPEN_FAILED' })
    await expect(repo.initialize()).resolves.toBeUndefined()
    await expect(repo.initialize()).resolves.toBeUndefined()
    expect(openCount).toBe(2)
  })

  it('reopens after a successful database connection is closed', async () => {
    let openCount = 0
    const repo = new IndexedDbPianoProgressRepository({
      databaseName: 'closed-reopen-db',
      openDatabaseRequest: (name, version) => {
        openCount += 1
        return indexedDB.open(name, version)
      },
    })
    await repo.initialize()
    repo.close()
    await repo.initialize()
    expect(openCount).toBe(2)
  })

  it('migrates v1 ScoreVersions to preserve their arrangement part selection', async () => {
    const name = 'migration-v1-db'
    await createLegacyV1Database(name)
    const repo = repository(name)
    await repo.initialize()
    await expect(repo.getScoreVersion('legacy-score')).resolves.toMatchObject({ version: 1, includedPartIds: ['P1'] })
  })

  it('round-trips Work, Arrangement, immutable canonical XML, and repertoire after reopening', async () => {
    const name = 'import-reload-db'
    const first = repository(name)
    const imported = await first.importScore(importInput())
    expect(imported.scoreVersion.contentHash).toMatch(/^[a-f0-9]{64}$/)
    const reopened = repository(name)
    await reopened.initialize()
    const items = await reopened.listRepertoire()
    expect(items).toHaveLength(1)
    expect(items[0]?.work.title).toBe('Test Work')
    expect(items[0]?.arrangement.includedPartIds).toEqual(['P1'])
    expect(items[0]?.scoreVersion.canonicalMusicXml).toBe(importInput().loaded.musicXmlText)
  })

  it('uses the content fingerprint to return an existing import without duplication', async () => {
    const repo = repository('duplicate-db')
    const first = await repo.importScore(importInput())
    const second = await repo.importScore(importInput())
    expect(second.duplicate).toBe(true)
    expect(second.scoreVersion.id).toBe(first.scoreVersion.id)
    await expect(repo.getCounts()).resolves.toMatchObject({ works: 1, arrangements: 1, scoreVersions: 1, repertoireEntries: 1 })
  })

  it('canonicalizes reordered and duplicate selected part IDs for exact import identity', async () => {
    const repo = repository('canonical-parts-db')
    const first = await repo.importScore({ ...importInput(), arrangement: { ...importInput().arrangement, includedPartIds: ['P2', 'P1', 'P2'] } })
    const second = await repo.importScore({ ...importInput(), arrangement: { ...importInput().arrangement, includedPartIds: ['P1', 'P2'] } })
    expect(first.scoreVersion.includedPartIds).toEqual(['P1', 'P2'])
    expect(first.arrangement.includedPartIds).toEqual(['P1', 'P2'])
    expect(second).toMatchObject({ duplicate: true, scoreVersion: { id: first.scoreVersion.id } })
    await expect(repo.getCounts()).resolves.toMatchObject({ arrangements: 1, scoreVersions: 1 })
  })

  it('creates a new version for the same score content with a different part set and preserves history', async () => {
    const repo = repository('changed-parts-db')
    const first = await repo.importScore(importInput())
    const oldAttempt = attemptFixture(first.arrangement.id, first.scoreVersion.id)
    await repo.saveAttempt(oldAttempt)
    const second = await repo.importScore({ ...importInput(), arrangement: { ...importInput().arrangement, includedPartIds: ['P2', 'P1', 'P2'] } })
    expect(second).toMatchObject({ duplicate: false, arrangement: { id: first.arrangement.id, includedPartIds: ['P1', 'P2'] }, scoreVersion: { version: 2, includedPartIds: ['P1', 'P2'] } })
    expect(second.scoreVersion.id).not.toBe(first.scoreVersion.id)
    expect((await repo.getScoreVersion(first.scoreVersion.id))?.includedPartIds).toEqual(['P1'])
    expect((await repo.getAttempt(oldAttempt.attempt.id))?.scoreVersionId).toBe(first.scoreVersion.id)
    expect((await repo.listRepertoire())[0]?.scoreVersion.id).toBe(second.scoreVersion.id)
  })

  it('does not merge exact score files that are explicitly named as different arrangements', async () => {
    const repo = repository('distinct-arrangements-db')
    const source = await repo.importScore(importInput())
    const alternate = await repo.importScore({
      ...importInput(),
      relationship: 'existing-work-arrangement',
      existingWorkId: source.work.id,
      arrangement: { ...importInput().arrangement, name: 'Concert arrangement' },
    })
    expect(alternate.duplicate).toBe(false)
    expect(alternate.arrangement.id).not.toBe(source.arrangement.id)
    await expect(repo.getCounts()).resolves.toMatchObject({ works: 1, arrangements: 2, scoreVersions: 2, repertoireEntries: 2 })
  })

  it('re-adds removed exact imports without recreating preserved entities in every relationship context', async () => {
    for (const relationship of ['new-work', 'existing-work-arrangement', 'derived-work'] as const) {
      const repo = repository(`readd-${relationship}-db`)
      const source = relationship === 'new-work' ? null : await repo.importScore(importInput('<score-partwise version="4.0"><part-list/><credit/></score-partwise>'))
      const targetInput = relationship === 'new-work'
        ? importInput()
        : relationship === 'existing-work-arrangement'
          ? { ...importInput(), relationship, existingWorkId: source!.work.id, arrangement: { ...importInput().arrangement, name: 'Existing Work arrangement' } }
          : { ...importInput(), relationship, sourceWorkId: source!.work.id, work: { title: 'Derived Test', composer: 'Test Composer' }, arrangement: { ...importInput().arrangement, name: 'Derived arrangement' } }
      const imported = await repo.importScore(targetInput)
      const fixture = attemptFixture(imported.arrangement.id, imported.scoreVersion.id)
      await repo.saveAttempt(fixture)
      const before = await repo.getCounts()
      await repo.removeFromRepertoire(imported.arrangement.id)
      const restored = await repo.importScore(targetInput)
      expect(restored).toMatchObject({ duplicate: true, work: { id: imported.work.id }, arrangement: { id: imported.arrangement.id }, scoreVersion: { id: imported.scoreVersion.id } })
      expect(restored.repertoire.id).not.toBe(imported.repertoire.id)
      expect(await repo.getCounts()).toEqual(before)
      expect(await repo.getAttempt(fixture.attempt.id)).not.toBeNull()
      expect(await repo.listSessions(imported.arrangement.id)).toHaveLength(1)
    }
  })

  it('persists the user-selected arrangement difficulty', async () => {
    const repo = repository('difficulty-db')
    const imported = await repo.importScore({ ...importInput(), arrangement: { ...importInput().arrangement, difficulty: 'Advanced' } })
    expect(imported.arrangement.difficulty).toBe('Advanced')
    expect((await repo.listRepertoire())[0]?.arrangement.difficulty).toBe('Advanced')
  })

  it('updates only Repertoire status and preserves the changed filter state after reopening', async () => {
    const name = 'status-update-db'
    const repo = repository(name)
    const imported = await repo.importScore(importInput())
    const fixture = attemptFixture(imported.arrangement.id, imported.scoreVersion.id)
    await repo.saveAttempt(fixture)
    const beforeCounts = await repo.getCounts()
    expect((await repo.listRepertoire())[0]?.repertoire.status).toBe('Learning')

    let notifications = 0
    const unsubscribe = repo.subscribe(() => { notifications += 1 })
    await expect(repo.updateRepertoireStatus(imported.arrangement.id, 'Practicing')).resolves.toMatchObject({
      id: imported.repertoire.id,
      arrangementId: imported.arrangement.id,
      status: 'Practicing',
      updatedAt: '2026-08-21T12:00:00.000Z',
    })
    unsubscribe()
    expect(notifications).toBe(1)
    const reopened = repository(name)
    const items = await reopened.listRepertoire()
    expect(items.filter((item) => item.repertoire.status === 'Practicing')).toHaveLength(1)
    expect(items[0]).toMatchObject({
      work: { id: imported.work.id },
      arrangement: { id: imported.arrangement.id },
      scoreVersion: { id: imported.scoreVersion.id },
      repertoire: { id: imported.repertoire.id, status: 'Practicing' },
    })
    expect(await reopened.getCounts()).toEqual(beforeCounts)
    expect(await reopened.getAttempt(fixture.attempt.id)).not.toBeNull()
  })

  it('rejects an invalid Repertoire status without changing the entry', async () => {
    const repo = repository('invalid-status-db')
    const imported = await repo.importScore(importInput())
    await expect(repo.updateRepertoireStatus(imported.arrangement.id, 'Archived' as never)).rejects.toMatchObject({ code: 'REFERENTIAL_INTEGRITY' })
    expect((await repo.listRepertoire())[0]?.repertoire.status).toBe('Learning')
  })

  it('supports arrangements of existing Works and separate derived Works', async () => {
    const repo = repository('relationships-db')
    const source = await repo.importScore(importInput())
    await repo.importScore({ ...importInput('<score-partwise version="4.0"><part-list/><part id="P1"/></score-partwise>'), relationship: 'existing-work-arrangement', existingWorkId: source.work.id })
    const derived = await repo.importScore({ ...importInput('<score-partwise version="4.0"><part-list/><credit/></score-partwise>'), relationship: 'derived-work', sourceWorkId: source.work.id, work: { title: 'Derived Test', composer: 'Test Composer' } })
    expect((await repo.listWorks())).toHaveLength(2)
    expect(derived.work.derivedFromWorkId).toBe(source.work.id)
    expect((await repo.listRepertoire())).toHaveLength(3)
  })

  it('creates monotonic immutable ScoreVersions while keeping historical attempts on the exact old version', async () => {
    const repo = repository('score-version-db')
    const imported = await repo.importScore(importInput())
    const oldAttempt = attemptFixture(imported.arrangement.id, imported.scoreVersion.id)
    await repo.saveAttempt(oldAttempt)
    const changed = importInput('<score-partwise version="4.0"><part-list/><part id="P1"/></score-partwise>')
    const second = await repo.createScoreVersion({
      arrangementId: imported.arrangement.id,
      loaded: changed.loaded,
      normalizedScoreId: 'normalized-score-2',
      parserVersion: 'test-parser-2',
      includedPartIds: ['P1'],
    })
    expect(second).toMatchObject({ duplicate: false, scoreVersion: { version: 2 } })
    const duplicate = await repo.createScoreVersion({
      arrangementId: imported.arrangement.id,
      loaded: changed.loaded,
      normalizedScoreId: 'ignored-duplicate-model',
      parserVersion: 'test-parser-3',
      includedPartIds: ['P1'],
    })
    expect(duplicate).toMatchObject({ duplicate: true, scoreVersion: { id: second.scoreVersion.id, version: 2 } })
    expect((await repo.listRepertoire())[0]?.scoreVersion.id).toBe(second.scoreVersion.id)
    expect((await repo.getAttempt(oldAttempt.attempt.id))?.scoreVersionId).toBe(imported.scoreVersion.id)
    expect((await repo.getScoreVersion(imported.scoreVersion.id))?.canonicalMusicXml).toBe(imported.scoreVersion.canonicalMusicXml)
    expect((await repo.listScoreVersions(imported.arrangement.id)).map((version) => version.version)).toEqual([1, 2])
  })

  it('includes the canonical part set in createScoreVersion duplicate identity', async () => {
    const repo = repository('score-version-parts-db')
    const imported = await repo.importScore(importInput())
    const changedParts = await repo.createScoreVersion({
      arrangementId: imported.arrangement.id,
      loaded: importInput().loaded,
      normalizedScoreId: imported.scoreVersion.normalizedScoreId,
      parserVersion: imported.scoreVersion.parserVersion,
      includedPartIds: ['P2', 'P1', 'P2'],
    })
    expect(changedParts).toMatchObject({ duplicate: false, scoreVersion: { version: 2, includedPartIds: ['P1', 'P2'] } })
    const duplicate = await repo.createScoreVersion({
      arrangementId: imported.arrangement.id,
      loaded: importInput().loaded,
      normalizedScoreId: 'ignored', parserVersion: 'ignored', includedPartIds: ['P2', 'P1'],
    })
    expect(duplicate).toMatchObject({ duplicate: true, scoreVersion: { id: changedParts.scoreVersion.id } })
    expect((await repo.listRepertoire())[0]?.arrangement.includedPartIds).toEqual(['P1', 'P2'])
  })

  it('saves raw MIDI and every analysis snapshot transactionally and idempotently', async () => {
    const repo = repository('attempt-db')
    const imported = await repo.importScore(importInput())
    const fixture = attemptFixture(imported.arrangement.id, imported.scoreVersion.id)
    const saved = await repo.saveAttempt(fixture)
    expect(saved).toMatchObject({ created: true })
    expect(saved.summary).not.toHaveProperty('dynamics')
    expect(saved.summary).not.toHaveProperty('articulation')
    await expect(repo.saveAttempt(fixture)).resolves.toMatchObject({ created: false })
    const loaded = await repo.getAttempt(fixture.attempt.id)
    expect(loaded?.recording.events).toEqual(fixture.attempt.recording.events)
    expect(loaded?.recording.keyPresses).toEqual(fixture.attempt.recording.keyPresses)
    expect(loaded?.alignment).toEqual(fixture.attempt.alignment)
    expect(loaded?.noteGrading).toEqual(fixture.attempt.noteGrading)
    expect(loaded?.timingAnalysis).toEqual(fixture.attempt.timingAnalysis)
    expect(loaded?.performanceResults).toEqual(fixture.attempt.performanceResults)
    expect((await repo.listSessions())[0]?.attemptIds).toEqual([fixture.attempt.id])
    const extendedRetry = { ...fixture, session: { ...fixture.session, endedAt: '2026-08-01T12:00:00.000Z', durationMs: 7_200_000 } }
    await expect(repo.saveAttempt(extendedRetry)).resolves.toMatchObject({ created: false })
    expect((await repo.listSessions())[0]).toMatchObject({ endedAt: fixture.session.endedAt, durationMs: 60_000 })
    await expect(repo.getCounts()).resolves.toMatchObject({ practiceSessions: 1, performanceAttempts: 1 })
  })

  it('round-trips a V2 expression snapshot without changing the IndexedDB schema', async () => {
    expect(PERSISTENCE_SCHEMA_VERSION).toBe(4)
    const repo = repository('attempt-v2-db')
    const imported = await repo.importScore(importInput())
    const fixture = v2AttemptFixture(imported.arrangement.id, imported.scoreVersion.id)
    const saved = await repo.saveAttempt(fixture)
    expect(saved).toMatchObject({ created: true })
    expect(saved.summary).not.toHaveProperty('dynamics')
    expect(saved.summary).not.toHaveProperty('articulation')
    await expect(repo.saveAttempt(fixture)).resolves.toMatchObject({ created: false })
    const loaded = await repo.getAttempt(fixture.attempt.id)
    expect(loaded).toEqual(fixture.attempt)
    expect(loaded).toMatchObject({ schemaVersion: 2, engineVersions: { expressionAnalysis: fixture.attempt.expressionAnalysis.diagnostics.expressionAnalysisEngineVersion } })
    if (loaded?.schemaVersion === 2) expect(loaded.expressionAnalysis).toEqual(fixture.attempt.expressionAnalysis)
  })

  it('transactionally round-trips a V3 pedal snapshot while summaries stay Notes/Rhythm/Tempo-only', async () => {
    const repo = repository('attempt-v3-db')
    const imported = await repo.importScore(importInput())
    const fixture = v3AttemptFixture(imported.arrangement.id, imported.scoreVersion.id)
    const saved = await repo.saveAttempt(fixture)
    expect(saved.summary).not.toHaveProperty('pedal')
    expect(saved.summary).not.toHaveProperty('dynamics')
    expect(saved.summary).not.toHaveProperty('articulation')
    await expect(repo.saveAttempt(fixture)).resolves.toMatchObject({ created: false })
    const loaded = await repo.getAttempt(fixture.attempt.id)
    expect(loaded).toEqual(fixture.attempt)
    if (loaded?.schemaVersion === 3) expect(loaded.pedalAnalysis).toEqual(fixture.attempt.pedalAnalysis)
  })

  it('transactionally round-trips exact V4 Voicing and Reference snapshots without an IndexedDB migration', async () => {
    const repo = repository('attempt-v4-db')
    const imported = await repo.importScore(importInput())
    const fixture = v4AttemptFixture(imported.arrangement.id, imported.scoreVersion.id)
    const saved = await repo.saveAttempt(fixture)
    expect(saved.summary).not.toHaveProperty('voicing')
    expect(saved.summary).not.toHaveProperty('referenceComparison')
    const loaded = await repo.getAttempt(fixture.attempt.id)
    expect(loaded).toEqual(fixture.attempt)
    expect(loaded).toMatchObject({ schemaVersion: 4, engineVersions: { voicingAnalysis: 'voicing-analysis-1.0.0', referenceComparison: 'reference-comparison-1.1.0' } })
    expect(PERSISTENCE_SCHEMA_VERSION).toBe(4)
  })

  it.each([
    ['missing Voicing snapshot', (attempt: PerformanceAttemptRecordV4) => { const copy: Record<string, unknown> = { ...attempt }; delete copy.voicingAnalysis; return copy }],
    ['missing Reference snapshot', (attempt: PerformanceAttemptRecordV4) => { const copy: Record<string, unknown> = { ...attempt }; delete copy.referenceComparison; return copy }],
    ['wrong Voicing recording', (attempt: PerformanceAttemptRecordV4) => ({ ...attempt, voicingAnalysis: { ...attempt.voicingAnalysis, recordingId: 'wrong' } })],
    ['wrong Voicing scope', (attempt: PerformanceAttemptRecordV4) => ({ ...attempt, voicingAnalysis: { ...attempt.voicingAnalysis, scope: { ...attempt.voicingAnalysis.scope, expectedEndGroupId: 'wrong' } } })],
    ['wrong Reference ScoreVersion', (attempt: PerformanceAttemptRecordV4) => ({ ...attempt, referenceComparison: { ...attempt.referenceComparison, scoreVersionId: 'wrong' } })],
    ['wrong Reference engine version', (attempt: PerformanceAttemptRecordV4) => ({ ...attempt, engineVersions: { ...attempt.engineVersions, referenceComparison: 'wrong' } })],
  ])('returns typed corruption for V4 %s', async (label, corrupt) => {
    const name = `corrupt-v4-${label}`; const repo = repository(name); await repo.initialize(); const fixture = v4AttemptFixture('arrangement', 'score'); await putRawAttempt(name, corrupt(fixture.attempt)); await expect(repo.getAttempt(fixture.attempt.id)).rejects.toMatchObject({ code: 'CORRUPT_RECORD' })
  })

  it.each([
    ['null nested dimension', (attempt: Record<string, unknown>) => { nestedRecord(attempt, 'referenceComparison').tempo = null }],
    ['missing nested observation field', (attempt: Record<string, unknown>) => { delete nestedRecord(attempt, 'referenceComparison', 'tempo', 'observations', 0).currentValue }],
    ['malformed coverage ratio', (attempt: Record<string, unknown>) => { nestedRecord(attempt, 'referenceComparison', 'tempo', 'coverage').ratio = 0.25 }],
    ['negative coverage count', (attempt: Record<string, unknown>) => { nestedRecord(attempt, 'referenceComparison', 'tempo', 'coverage').currentCount = -1 }],
    ['invalid similarity descriptor', (attempt: Record<string, unknown>) => { nestedRecord(attempt, 'referenceComparison', 'tempo', 'observations', 0).similarity = 'identical-ish' }],
    ['NaN observation number', (attempt: Record<string, unknown>) => { nestedRecord(attempt, 'referenceComparison', 'tempo', 'observations', 0).magnitude = Number.NaN }],
    ['infinite observation number', (attempt: Record<string, unknown>) => { nestedRecord(attempt, 'referenceComparison', 'tempo', 'observations', 0).currentValue = Number.POSITIVE_INFINITY }],
    ['inconsistent signed difference', (attempt: Record<string, unknown>) => { nestedRecord(attempt, 'referenceComparison', 'tempo', 'observations', 0).signedDifference = 0.4 }],
    ['malformed overlap bounds', (attempt: Record<string, unknown>) => { nestedRecord(attempt, 'referenceComparison').overlapScope = { start: { numerator: 2, denominator: 1 }, end: { numerator: 1, denominator: 1 } } }],
    ['malformed Voicing target', (attempt: Record<string, unknown>) => { nestedRecord(attempt, 'voicingAnalysis', 'targets', 0).position = { numerator: 1, denominator: 0 } }],
    ['Voicing observation missing target', (attempt: Record<string, unknown>) => { nestedRecord(attempt, 'voicingAnalysis', 'observations', 0).targetId = 'missing' }],
    ['malformed Voicing lane', (attempt: Record<string, unknown>) => { nestedRecord(attempt, 'voicingAnalysis', 'lanes', 0).measureCoverage = [-1] }],
    ['invalid Voicing coverage consistency', (attempt: Record<string, unknown>) => { nestedRecord(attempt, 'voicingAnalysis', 'coverage').ratio = 0.5 }],
  ])('rejects deeply corrupt V4 %s', async (label, corrupt) => {
    const name = `deep-corrupt-v4-${label}`
    const repo = repository(name)
    await repo.initialize()
    const fixture = v4AttemptWithNestedEvidence('arrangement', 'score')
    const copy = structuredClone(fixture.attempt) as unknown as Record<string, unknown>
    corrupt(copy)
    await putRawAttempt(name, copy)
    await expect(repo.getAttempt(fixture.attempt.id)).rejects.toMatchObject({ code: 'CORRUPT_RECORD' })
  })

  it('keeps frozen V4 reference-comparison 1.0.0 snapshots readable', async () => {
    const name = 'historical-v4-reference-1-0'
    const repo = repository(name)
    await repo.initialize()
    const fixture = v4AttemptFixture('arrangement', 'score')
    const historical = { ...fixture.attempt, engineVersions: { ...fixture.attempt.engineVersions, referenceComparison: 'reference-comparison-1.0.0' }, referenceComparison: { ...fixture.attempt.referenceComparison, diagnostics: { ...fixture.attempt.referenceComparison.diagnostics, referenceComparisonEngineVersion: 'reference-comparison-1.0.0' } } }
    await putRawAttempt(name, historical)
    await expect(repo.getAttempt(fixture.attempt.id)).resolves.toEqual(historical)
  })

  it('persists score-version-specific Voicing and reference preferences and validates reference integrity', async () => {
    const repo = repository('phase11-preferences')
    const imported = await repo.importScore(importInput())
    const lanes = [{ id: 'lane:a', ambiguous: false }, { id: 'lane:b', ambiguous: false }]
    const profile = { id: 'intent', scoreVersionId: imported.scoreVersion.id, updatedAt: '2026-08-25T12:00:00.000Z', regions: [{ id: 'region', startMeasureIndex: 0, endMeasureIndex: 2, foregroundLaneIds: ['lane:a'], supportLaneIds: ['lane:b'] }] }
    await repo.setVoicingIntentProfile(imported.arrangement.id, imported.scoreVersion.id, profile, lanes)
    expect((await repo.getArrangement(imported.arrangement.id))?.analysisPreferences?.voicingByScoreVersion[imported.scoreVersion.id]).toEqual(profile)
    await expect(repo.setVoicingIntentProfile(imported.arrangement.id, imported.scoreVersion.id, { ...profile, regions: [{ ...profile.regions[0]!, supportLaneIds: ['missing'] }] }, lanes)).rejects.toMatchObject({ code: 'REFERENTIAL_INTEGRITY' })
    const reference = v3AttemptFixture(imported.arrangement.id, imported.scoreVersion.id, 'reference-session')
    await repo.saveAttempt(reference)
    await repo.setInterpretationReference(imported.arrangement.id, imported.scoreVersion.id, reference.attempt.id)
    expect((await repo.getArrangement(imported.arrangement.id))?.analysisPreferences?.referenceByScoreVersion[imported.scoreVersion.id]).toBe(reference.attempt.id)
    await expect(repo.setInterpretationReference(imported.arrangement.id, imported.scoreVersion.id, 'missing')).rejects.toMatchObject({ code: 'REFERENTIAL_INTEGRITY' })
    await repo.setInterpretationReference(imported.arrangement.id, imported.scoreVersion.id, null)
    await repo.setVoicingIntentProfile(imported.arrangement.id, imported.scoreVersion.id, null, lanes)
    expect((await repo.getArrangement(imported.arrangement.id))?.analysisPreferences).toEqual({ voicingByScoreVersion: {}, referenceByScoreVersion: {} })
  })

  it('accepts canonically equivalent reordered attempt and plan part selections', async () => {
    const repo = repository('attempt-reordered-parts-db')
    const imported = await repo.importScore({ ...importInput(), arrangement: { ...importInput().arrangement, includedPartIds: ['P1', 'P2'] } })
    const fixture = withPartSelections(attemptFixture(imported.arrangement.id, imported.scoreVersion.id), ['P2', 'P1'], ['P1', 'P2'])
    await expect(repo.saveAttempt(fixture)).resolves.toMatchObject({ created: true })
    expect(await repo.getAttempt(fixture.attempt.id)).toMatchObject({ includedPartIds: ['P2', 'P1'], expectedPerformancePlan: { includedPartIds: ['P1', 'P2'] } })
  })

  it('accepts duplicate IDs when all part selections are canonically equivalent', async () => {
    const repo = repository('attempt-duplicate-parts-db')
    const imported = await repo.importScore({ ...importInput(), arrangement: { ...importInput().arrangement, includedPartIds: ['P1', 'P2'] } })
    const fixture = withPartSelections(attemptFixture(imported.arrangement.id, imported.scoreVersion.id), ['P1', 'P2', 'P1'], ['P2', 'P2', 'P1'])
    await expect(repo.saveAttempt(fixture)).resolves.toMatchObject({ created: true })
  })

  it('rejects an attempt part mismatch before writing attempt, summary, or session records', async () => {
    const repo = repository('attempt-part-mismatch-db')
    const imported = await repo.importScore({ ...importInput(), arrangement: { ...importInput().arrangement, includedPartIds: ['P1', 'P2'] } })
    const fixture = withPartSelections(attemptFixture(imported.arrangement.id, imported.scoreVersion.id), ['P1'], ['P1', 'P2'])
    await expect(repo.saveAttempt(fixture)).rejects.toMatchObject({ code: 'REFERENTIAL_INTEGRITY', message: 'The attempt part selection does not match its persisted ScoreVersion.' })
    expect(await repo.getAttempt(fixture.attempt.id)).toBeNull()
    expect(await repo.listAttemptSummaries(imported.arrangement.id)).toEqual([])
    expect(await repo.listSessions(imported.arrangement.id)).toEqual([])
  })

  it('rejects a plan part mismatch before writing attempt, summary, or session records', async () => {
    const repo = repository('plan-part-mismatch-db')
    const imported = await repo.importScore({ ...importInput(), arrangement: { ...importInput().arrangement, includedPartIds: ['P1', 'P2'] } })
    const fixture = withPartSelections(attemptFixture(imported.arrangement.id, imported.scoreVersion.id), ['P1', 'P2'], ['P1'])
    await expect(repo.saveAttempt(fixture)).rejects.toMatchObject({ code: 'REFERENTIAL_INTEGRITY', message: 'The attempt part selection does not match its persisted ScoreVersion.' })
    expect(await repo.getAttempt(fixture.attempt.id)).toBeNull()
    expect(await repo.listAttemptSummaries(imported.arrangement.id)).toEqual([])
    expect(await repo.listSessions(imported.arrangement.id)).toEqual([])
  })

  it('rejects a plan from a different normalized score before writing attempt, summary, or session records', async () => {
    const repo = repository('attempt-normalized-score-mismatch-db')
    const imported = await repo.importScore({ ...importInput(), normalizedScoreId: 'different-normalized-score' })
    const fixture = attemptFixture(imported.arrangement.id, imported.scoreVersion.id)
    await expect(repo.saveAttempt(fixture)).rejects.toMatchObject({ code: 'REFERENTIAL_INTEGRITY', message: 'The attempt normalized score does not match its persisted ScoreVersion.' })
    expect(await repo.getAttempt(fixture.attempt.id)).toBeNull()
    expect(await repo.listAttemptSummaries(imported.arrangement.id)).toEqual([])
    expect(await repo.listSessions(imported.arrangement.id)).toEqual([])
  })

  it('keeps a saved attempt queryable when the current Practice take is cleared', async () => {
    const repo = repository('saved-take-clear-db')
    const imported = await repo.importScore(importInput())
    const fixture = attemptFixture(imported.arrangement.id, imported.scoreVersion.id)
    await repo.saveAttempt(fixture)
    let currentTakeId: string | null = fixture.attempt.recording.id
    clearCurrentTake(() => { currentTakeId = null })
    expect(currentTakeId).toBeNull()
    expect(await repo.getAttempt(fixture.attempt.id)).toMatchObject({ id: fixture.attempt.id, recording: { id: fixture.attempt.recording.id } })
  })

  it('links multiple attempts to one session and counts practice time once', async () => {
    const repo = repository('multi-attempt-db')
    const imported = await repo.importScore(importInput())
    const first = attemptFixture(imported.arrangement.id, imported.scoreVersion.id, 'shared-session', '1')
    const second = attemptFixture(imported.arrangement.id, imported.scoreVersion.id, 'shared-session', '2')
    await repo.saveAttempt(first)
    await repo.saveAttempt(second)
    const sessions = await repo.listSessions()
    expect(sessions).toHaveLength(1)
    expect(sessions[0]?.attemptIds).toEqual(['attempt-1', 'attempt-2'])
    const progress = await repo.getProgress('all')
    expect(progress.attemptCount).toBe(2)
    expect(progress.sessionCount).toBe(1)
    expect(progress.practiceTimeMs).toBe(new Date(second.session.endedAt).getTime() - new Date(first.session.startedAt).getTime())
  })

  it('counts active days in the requested local calendar and uses indexed date-range boundaries', async () => {
    const repo = repository('local-progress-db')
    const imported = await repo.importScore(importInput())
    const first = attemptFixture(imported.arrangement.id, imported.scoreVersion.id, 'session-local-1', '1')
    const second = attemptFixture(imported.arrangement.id, imported.scoreVersion.id, 'session-local-2', '2')
    const at = (fixture: ReturnType<typeof attemptFixture>, startedAt: string) => ({
      attempt: { ...fixture.attempt, performedAt: startedAt },
      session: { ...fixture.session, startedAt, endedAt: new Date(new Date(startedAt).getTime() + 60_000).toISOString() },
    })
    await repo.saveAttempt(at(first, '2026-01-01T00:30:00.000Z'))
    await repo.saveAttempt(at(second, '2026-01-01T23:30:00.000Z'))
    expect((await repo.getProgress('all', new Date('2026-01-02T00:00:00.000Z'), 'UTC')).activeDays).toBe(1)
    expect((await repo.getProgress('all', new Date('2026-01-02T00:00:00.000Z'), 'America/Los_Angeles')).activeDays).toBe(2)
    expect((await repo.getProgress('7d', new Date('2026-01-02T00:00:00.000Z'), 'UTC')).attemptCount).toBe(2)
    const database = await openDatabase('local-progress-db')
    const transaction = database.transaction('practiceSessions', 'readonly')
    expect(transaction.objectStore('practiceSessions').indexNames.contains('endedAt')).toBe(true)
    database.close()
  })

  it('rejects invalid session spans before writing any attempt data', async () => {
    const repo = repository('invalid-session-db')
    const imported = await repo.importScore(importInput())
    const fixture = attemptFixture(imported.arrangement.id, imported.scoreVersion.id)
    await expect(repo.saveAttempt({ ...fixture, session: { ...fixture.session, endedAt: '2026-07-31T10:00:00.000Z', durationMs: -1 } })).rejects.toMatchObject({ code: 'REFERENTIAL_INTEGRITY' })
    expect(await repo.getAttempt(fixture.attempt.id)).toBeNull()
  })

  it('aborts all attempt writes when a transaction fails, then allows a safe retry', async () => {
    const name = 'transaction-failure-db'
    const setup = repository(name)
    const imported = await setup.importScore(importInput())
    const fixture = attemptFixture(imported.arrangement.id, imported.scoreVersion.id)
    const broken = repository(name, () => { throw new Error('injected failure') })
    await expect(broken.saveAttempt(fixture)).rejects.toThrow('injected failure')
    const recovered = repository(name)
    expect(await recovered.getAttempt(fixture.attempt.id)).toBeNull()
    expect(await recovered.listAttemptSummaries()).toEqual([])
    expect(await recovered.listSessions()).toEqual([])
    await expect(recovered.saveAttempt(fixture)).resolves.toMatchObject({ created: true })
  })

  it('removes repertoire membership without deleting history and can explicitly clear everything', async () => {
    const repo = repository('deletion-db')
    const imported = await repo.importScore(importInput())
    const fixture = attemptFixture(imported.arrangement.id, imported.scoreVersion.id)
    await repo.saveAttempt(fixture)
    await repo.removeFromRepertoire(imported.arrangement.id)
    expect(await repo.listRepertoire()).toEqual([])
    expect(await repo.getAttempt(fixture.attempt.id)).not.toBeNull()
    await repo.clearAll()
    await expect(repo.getCounts()).resolves.toEqual({ works: 0, arrangements: 0, scoreVersions: 0, repertoireEntries: 0, practiceSessions: 0, performanceAttempts: 0, techniqueAttempts: 0 })
  })

  it('surfaces malformed persisted data as a typed corruption error', async () => {
    const name = 'corrupt-db'
    const repo = repository(name)
    await repo.initialize()
    const database = await openDatabase(name)
    const transaction = database.transaction('works', 'readwrite')
    transaction.objectStore('works').add({ id: 'broken-work', createdAt: '2026-08-21T00:00:00.000Z' })
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
    database.close()
    await expect(repo.listWorks()).rejects.toMatchObject({ code: 'CORRUPT_RECORD' })
  })

  it('rejects historical attempts whose snapshot provenance does not match', async () => {
    const name = 'corrupt-attempt-db'
    const repo = repository(name)
    await repo.initialize()
    const fixture = attemptFixture('arrangement', 'score')
    const database = await openDatabase(name)
    const transaction = database.transaction('performanceAttempts', 'readwrite')
    transaction.objectStore('performanceAttempts').add({
      ...fixture.attempt,
      performanceResults: { ...fixture.attempt.performanceResults, timingAnalysisId: 'wrong-timing-snapshot' },
    })
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
    database.close()
    await expect(repo.getAttempt(fixture.attempt.id)).rejects.toMatchObject({ code: 'CORRUPT_RECORD' })
  })

  it.each([
    ['missing alignment diagnostics', (attempt: PerformanceAttemptRecord) => ({ ...attempt, alignment: { ...attempt.alignment, diagnostics: undefined } })],
    ['malformed note-grading scope', (attempt: PerformanceAttemptRecord) => ({ ...attempt, noteGrading: { ...attempt.noteGrading, scope: null } })],
    ['malformed timing diagnostics', (attempt: PerformanceAttemptRecord) => ({ ...attempt, timingAnalysis: { ...attempt.timingAnalysis, diagnostics: 'invalid' } })],
    ['malformed result diagnostics', (attempt: PerformanceAttemptRecord) => ({ ...attempt, performanceResults: { ...attempt.performanceResults, diagnostics: 42 } })],
  ])('returns a typed corruption error for %s', async (_label, corrupt) => {
    const name = `malformed-nested-${_label}`
    const repo = repository(name)
    await repo.initialize()
    const fixture = attemptFixture('arrangement', 'score')
    await putRawAttempt(name, corrupt(fixture.attempt))
    await expect(repo.getAttempt(fixture.attempt.id)).rejects.toMatchObject({ code: 'CORRUPT_RECORD' })
  })

  it.each([
    ['missing expression snapshot', (attempt: PerformanceAttemptRecordV2) => { const copy: Record<string, unknown> = { ...attempt }; delete copy.expressionAnalysis; return copy }],
    ['wrong expression plan identity', (attempt: PerformanceAttemptRecordV2) => ({ ...attempt, expressionAnalysis: { ...attempt.expressionAnalysis, expectedPlanId: 'wrong-plan' } })],
    ['wrong expression engine version', (attempt: PerformanceAttemptRecordV2) => ({ ...attempt, engineVersions: { ...attempt.engineVersions, expressionAnalysis: 'wrong-engine' } })],
    ['malformed expression diagnostics', (attempt: PerformanceAttemptRecordV2) => ({ ...attempt, expressionAnalysis: { ...attempt.expressionAnalysis, diagnostics: null } })],
  ])('returns a typed corruption error for V2 %s', async (_label, corrupt) => {
    const name = `corrupt-v2-${_label}`
    const repo = repository(name)
    await repo.initialize()
    const fixture = v2AttemptFixture('arrangement', 'score')
    await putRawAttempt(name, corrupt(fixture.attempt))
    await expect(repo.getAttempt(fixture.attempt.id)).rejects.toMatchObject({ code: 'CORRUPT_RECORD' })
  })

  it.each([
    ['expectedStartIndex', 999],
    ['expectedEndIndex', 999],
    ['expectedStartGroupId', 'wrong-start-group'],
    ['expectedEndGroupId', 'wrong-end-group'],
  ] as const)('rejects a historical V2 expression snapshot with a different %s', async (field, value) => {
    const name = `corrupt-v2-scope-${field}`
    const repo = repository(name)
    await repo.initialize()
    const fixture = v2AttemptFixture('arrangement', 'score')
    await putRawAttempt(name, {
      ...fixture.attempt,
      expressionAnalysis: {
        ...fixture.attempt.expressionAnalysis,
        scope: { ...fixture.attempt.expressionAnalysis.scope, [field]: value },
      },
    })
    await expect(repo.getAttempt(fixture.attempt.id)).rejects.toMatchObject({ code: 'CORRUPT_RECORD' })
  })

  it('reads a new pedal-analysis-1.1.1 V3 snapshot without changing the IndexedDB schema', async () => {
    const name = 'valid-v3-pedal'
    const repo = repository(name)
    await repo.initialize()
    const fixture = v3AttemptFixture('arrangement', 'score')
    await putRawAttempt(name, fixture.attempt)
    await expect(repo.getAttempt(fixture.attempt.id)).resolves.toMatchObject({
      schemaVersion: 3,
      engineVersions: { pedalAnalysis: 'pedal-analysis-1.1.1' },
      pedalAnalysis: { status: 'unavailable', score: null, diagnostics: { pedalAnalysisEngineVersion: 'pedal-analysis-1.1.1' } },
    })
    expect(PERSISTENCE_SCHEMA_VERSION).toBe(4)
  })

  it('keeps frozen pedal-analysis-1.0.0 V3 snapshots readable without 1.1 diagnostics', async () => {
    const name = 'valid-v3-pedal-legacy-1-0'
    const repo = repository(name)
    await repo.initialize()
    const fixture = legacyV3AttemptFixture('arrangement', 'score')
    await putRawAttempt(name, fixture.attempt)
    await expect(repo.getAttempt(fixture.attempt.id)).resolves.toEqual(fixture.attempt)
    expect(PERSISTENCE_SCHEMA_VERSION).toBe(4)
  })

  it('keeps frozen pedal-analysis-1.1.0 V3 snapshots readable with the modern shape', async () => {
    const name = 'valid-v3-pedal-historical-1-1'
    const repo = repository(name)
    await repo.initialize()
    const fixture = historicalV11AttemptFixture('arrangement', 'score')
    await putRawAttempt(name, fixture.attempt)
    await expect(repo.getAttempt(fixture.attempt.id)).resolves.toEqual(fixture.attempt)
    expect(PERSISTENCE_SCHEMA_VERSION).toBe(4)
  })

  it.each([
    ['missing pedal snapshot', (attempt: PerformanceAttemptRecordV3) => { const copy: Record<string, unknown> = { ...attempt }; delete copy.pedalAnalysis; return copy }],
    ['wrong pedal expression identity', (attempt: PerformanceAttemptRecordV3) => ({ ...attempt, pedalAnalysis: { ...attempt.pedalAnalysis, expressionAnalysisId: 'wrong-expression' } })],
    ['wrong pedal scope boundary', (attempt: PerformanceAttemptRecordV3) => ({ ...attempt, pedalAnalysis: { ...attempt.pedalAnalysis, scope: { ...attempt.pedalAnalysis.scope, expectedEndGroupId: 'wrong-group' } } })],
    ['wrong pedal engine version', (attempt: PerformanceAttemptRecordV3) => ({ ...attempt, engineVersions: { ...attempt.engineVersions, pedalAnalysis: 'wrong-engine' } })],
    ['malformed pedal timeline', (attempt: PerformanceAttemptRecordV3) => ({ ...attempt, pedalAnalysis: { ...attempt.pedalAnalysis, timeline: null } })],
    ['missing 1.1 event coverage', (attempt: PerformanceAttemptRecordV3) => ({ ...attempt, pedalAnalysis: { ...attempt.pedalAnalysis, coverage: { authoredPhraseCount: attempt.pedalAnalysis.coverage.authoredPhraseCount, analyzedPhraseCount: attempt.pedalAnalysis.coverage.analyzedPhraseCount, ratio: attempt.pedalAnalysis.coverage.ratio } } })],
  ])('returns a typed corruption error for V3 %s', async (_label, corrupt) => {
    const name = `corrupt-v3-${_label}`
    const repo = repository(name)
    await repo.initialize()
    const fixture = v3AttemptFixture('arrangement', 'score')
    await putRawAttempt(name, corrupt(fixture.attempt))
    await expect(repo.getAttempt(fixture.attempt.id)).rejects.toMatchObject({ code: 'CORRUPT_RECORD' })
  })
})
