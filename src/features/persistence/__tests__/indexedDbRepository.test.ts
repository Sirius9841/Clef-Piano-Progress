import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { makeResultPlan, recordingForPlan, analyzeResult } from '../../performance-results/__tests__/fixtures'
import type { PerformanceAttemptRecord, PracticeSessionRecord } from '../types'
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
    normalizedScoreId: 'normalized-score-1',
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
  return { attempt, session }
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

describe('IndexedDbPianoProgressRepository', () => {
  it('initializes a fresh versioned database and starts empty', async () => {
    const repo = repository('fresh-db')
    await repo.initialize()
    await expect(repo.getCounts()).resolves.toEqual({ works: 0, arrangements: 0, scoreVersions: 0, repertoireEntries: 0, practiceSessions: 0, performanceAttempts: 0 })
    const database = await openDatabase('fresh-db')
    expect(database.version).toBe(3)
    expect([...database.objectStoreNames]).toEqual(['arrangements', 'attemptSummaries', 'performanceAttempts', 'practiceSessions', 'repertoire', 'scoreVersions', 'works'])
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

  it('saves raw MIDI and every analysis snapshot transactionally and idempotently', async () => {
    const repo = repository('attempt-db')
    const imported = await repo.importScore(importInput())
    const fixture = attemptFixture(imported.arrangement.id, imported.scoreVersion.id)
    await expect(repo.saveAttempt(fixture)).resolves.toMatchObject({ created: true })
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
    await expect(repo.getCounts()).resolves.toEqual({ works: 0, arrangements: 0, scoreVersions: 0, repertoireEntries: 0, practiceSessions: 0, performanceAttempts: 0 })
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
})
