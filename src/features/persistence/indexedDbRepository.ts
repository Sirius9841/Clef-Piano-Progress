import { PianoStorageError, asPianoStorageError } from './errors'
import { sha256Hex } from './hash'
import type { PianoProgressRepository } from './repository'
import {
  PERSISTENCE_SCHEMA_VERSION,
  PIANO_PROGRESS_DB_NAME,
  createAttemptSummary,
  type AttemptSaveInput,
  type AttemptSaveResult,
  type AttemptSummary,
  type CreateScoreVersionInput,
  type CreateScoreVersionResult,
  type ImportScoreInput,
  type ImportScoreResult,
  type PerformanceAttemptRecord,
  type PersistedArrangement,
  type PersistedScoreVersion,
  type PersistedWork,
  type PracticeSessionRecord,
  type ProgressRange,
  type ProgressSnapshot,
  type RepertoireEntry,
  type RepertoireListItem,
  type StorageCounts,
} from './types'

const STORE = {
  works: 'works',
  arrangements: 'arrangements',
  scoreVersions: 'scoreVersions',
  repertoire: 'repertoire',
  sessions: 'practiceSessions',
  attempts: 'performanceAttempts',
  summaries: 'attemptSummaries',
} as const

type StoreName = (typeof STORE)[keyof typeof STORE]

export type PersistenceFaultStage = 'after-attempt-write'

export interface IndexedDbRepositoryOptions {
  readonly databaseName?: string
  readonly indexedDb?: IDBFactory
  readonly now?: () => Date
  readonly createId?: () => string
  readonly faultInjector?: (stage: PersistenceFaultStage) => void
}

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'))
  })
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction was aborted.'))
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.'))
  })
}

function idbRangeFor(value: string): IDBKeyRange {
  return IDBKeyRange.only(value)
}

function assertRecord(value: unknown, label: string): asserts value is { id: string } {
  if (!value || typeof value !== 'object' || typeof (value as { id?: unknown }).id !== 'string') {
    throw new PianoStorageError('CORRUPT_RECORD', `A stored ${label} record is invalid.`)
  }
}

function assertWork(value: unknown): asserts value is PersistedWork {
  assertRecord(value, 'Work')
  const work = value as Partial<PersistedWork>
  if (typeof work.title !== 'string' || typeof work.composer !== 'string' || typeof work.createdAt !== 'string') {
    throw new PianoStorageError('CORRUPT_RECORD', `Stored Work ${work.id} is missing required fields.`)
  }
}

function assertScoreVersion(value: unknown): asserts value is PersistedScoreVersion {
  assertRecord(value, 'ScoreVersion')
  const version = value as Partial<PersistedScoreVersion>
  if (typeof version.arrangementId !== 'string' || typeof version.canonicalMusicXml !== 'string' || typeof version.contentHash !== 'string' || !Array.isArray(version.includedPartIds)) {
    throw new PianoStorageError('CORRUPT_RECORD', `Stored ScoreVersion ${version.id} is missing required fields.`)
  }
}

function assertAttempt(value: unknown): asserts value is PerformanceAttemptRecord {
  assertRecord(value, 'PerformanceAttempt')
  const attempt = value as Partial<PerformanceAttemptRecord>
  if (attempt.schemaVersion !== 1 || typeof attempt.arrangementId !== 'string' || typeof attempt.scoreVersionId !== 'string' || !attempt.recording || !attempt.performanceResults) {
    throw new PianoStorageError('CORRUPT_RECORD', `Stored PerformanceAttempt ${attempt.id} is missing required snapshots.`)
  }
}

function compareIsoDescending(left: { performedAt: string; id: string }, right: { performedAt: string; id: string }): number {
  return right.performedAt.localeCompare(left.performedAt) || left.id.localeCompare(right.id)
}

function minIso(left: string, right: string): string {
  return left <= right ? left : right
}

function maxIso(left: string, right: string): string {
  return left >= right ? left : right
}

function cutoffForRange(range: ProgressRange, now: Date): number | null {
  if (range === 'all') return null
  const days = range === '7d' ? 7 : 30
  return now.getTime() - days * 24 * 60 * 60 * 1_000
}

export class IndexedDbPianoProgressRepository implements PianoProgressRepository {
  private readonly databaseName: string
  private readonly indexedDb: IDBFactory
  private readonly now: () => Date
  private readonly createId: () => string
  private readonly faultInjector?: (stage: PersistenceFaultStage) => void
  private databasePromise: Promise<IDBDatabase> | null = null
  private readonly listeners = new Set<() => void>()

  constructor(options: IndexedDbRepositoryOptions = {}) {
    const factory = options.indexedDb ?? globalThis.indexedDB
    if (!factory) throw new PianoStorageError('DATABASE_UNAVAILABLE', 'IndexedDB is unavailable in this browser.')
    this.indexedDb = factory
    this.databaseName = options.databaseName ?? PIANO_PROGRESS_DB_NAME
    this.now = options.now ?? (() => new Date())
    this.createId = options.createId ?? (() => globalThis.crypto.randomUUID())
    this.faultInjector = options.faultInjector
  }

  async initialize(): Promise<void> {
    await this.openDatabase()
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener())
  }

  private openDatabase(): Promise<IDBDatabase> {
    if (this.databasePromise) return this.databasePromise
    this.databasePromise = new Promise((resolve, reject) => {
      let request: IDBOpenDBRequest
      try {
        request = this.indexedDb.open(this.databaseName, PERSISTENCE_SCHEMA_VERSION)
      } catch (cause) {
        reject(new PianoStorageError('DATABASE_OPEN_FAILED', 'The local piano database could not be opened.', cause))
        return
      }
      request.onupgradeneeded = (event) => this.migrate(request.result, request.transaction, event.oldVersion)
      request.onsuccess = () => {
        const database = request.result
        database.onversionchange = () => database.close()
        resolve(database)
      }
      request.onerror = () => reject(new PianoStorageError('DATABASE_OPEN_FAILED', 'The local piano database could not be opened.', request.error))
      request.onblocked = () => reject(new PianoStorageError('DATABASE_OPEN_FAILED', 'Close other Clef tabs so the local database can be upgraded.'))
    })
    return this.databasePromise
  }

  private migrate(database: IDBDatabase, transaction: IDBTransaction | null, oldVersion: number): void {
    if (!transaction) throw new PianoStorageError('DATABASE_OPEN_FAILED', 'The database upgrade transaction was unavailable.')
    if (oldVersion < 1) {
      const works = database.createObjectStore(STORE.works, { keyPath: 'id' })
      works.createIndex('updatedAt', 'updatedAt')
      const arrangements = database.createObjectStore(STORE.arrangements, { keyPath: 'id' })
      arrangements.createIndex('workId', 'workId')
      const scoreVersions = database.createObjectStore(STORE.scoreVersions, { keyPath: 'id' })
      scoreVersions.createIndex('arrangementId', 'arrangementId')
      scoreVersions.createIndex('contentHash', 'contentHash')
      const repertoire = database.createObjectStore(STORE.repertoire, { keyPath: 'id' })
      repertoire.createIndex('arrangementId', 'arrangementId', { unique: true })
      const sessions = database.createObjectStore(STORE.sessions, { keyPath: 'id' })
      sessions.createIndex('arrangementId', 'arrangementId')
      sessions.createIndex('startedAt', 'startedAt')
      const attempts = database.createObjectStore(STORE.attempts, { keyPath: 'id' })
      attempts.createIndex('arrangementId', 'arrangementId')
      attempts.createIndex('scoreVersionId', 'scoreVersionId')
      attempts.createIndex('practiceSessionId', 'practiceSessionId')
      attempts.createIndex('performedAt', 'performedAt')
      const summaries = database.createObjectStore(STORE.summaries, { keyPath: 'id' })
      summaries.createIndex('arrangementId', 'arrangementId')
      summaries.createIndex('scoreVersionId', 'scoreVersionId')
      summaries.createIndex('practiceSessionId', 'practiceSessionId')
      summaries.createIndex('performedAt', 'performedAt')
    }
    if (oldVersion < 2) {
      const versions = transaction.objectStore(STORE.scoreVersions)
      const arrangements = transaction.objectStore(STORE.arrangements)
      const cursorRequest = versions.openCursor()
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result
        if (!cursor) return
        const version = cursor.value as PersistedScoreVersion
        if (Array.isArray(version.includedPartIds)) {
          cursor.continue()
          return
        }
        const arrangementRequest = arrangements.get(version.arrangementId)
        arrangementRequest.onsuccess = () => {
          const arrangement = arrangementRequest.result as PersistedArrangement | undefined
          const updateRequest = cursor.update({ ...version, includedPartIds: [...(arrangement?.includedPartIds ?? [])] })
          updateRequest.onsuccess = () => cursor.continue()
        }
      }
    }
  }

  private async getAll<T>(storeName: StoreName): Promise<T[]> {
    const database = await this.openDatabase()
    const transaction = database.transaction(storeName, 'readonly')
    const values = await requestValue(transaction.objectStore(storeName).getAll()) as T[]
    await transactionComplete(transaction)
    return values
  }

  private async getById<T>(storeName: StoreName, id: string): Promise<T | null> {
    const database = await this.openDatabase()
    const transaction = database.transaction(storeName, 'readonly')
    const value = await requestValue(transaction.objectStore(storeName).get(id)) as T | undefined
    await transactionComplete(transaction)
    if (value === undefined) return null
    assertRecord(value, storeName)
    return value
  }

  private async getAllByIndex<T>(storeName: StoreName, indexName: string, value: string): Promise<T[]> {
    const database = await this.openDatabase()
    const transaction = database.transaction(storeName, 'readonly')
    const records = await requestValue(transaction.objectStore(storeName).index(indexName).getAll(idbRangeFor(value))) as T[]
    await transactionComplete(transaction)
    return records
  }

  async importScore(input: ImportScoreInput): Promise<ImportScoreResult> {
    const contentHash = await sha256Hex(input.loaded.musicXmlText)
    const database = await this.openDatabase()
    const transaction = database.transaction([STORE.works, STORE.arrangements, STORE.scoreVersions, STORE.repertoire], 'readwrite')
    const completion = transactionComplete(transaction)
    try {
      const workStore = transaction.objectStore(STORE.works)
      const arrangementStore = transaction.objectStore(STORE.arrangements)
      const versionStore = transaction.objectStore(STORE.scoreVersions)
      const repertoireStore = transaction.objectStore(STORE.repertoire)
      const existingWorks = await requestValue(workStore.getAll()) as PersistedWork[]
      const existingArrangements = await requestValue(arrangementStore.getAll()) as PersistedArrangement[]
      const matchingVersions = await requestValue(versionStore.index('contentHash').getAll(contentHash)) as PersistedScoreVersion[]

      const requestedWorkId = input.relationship === 'existing-work-arrangement' ? input.existingWorkId : undefined
      if (input.relationship === 'existing-work-arrangement' && !requestedWorkId) {
        throw new PianoStorageError('REFERENTIAL_INTEGRITY', 'Choose the existing Work for this arrangement.')
      }
      const requestedWork = requestedWorkId ? existingWorks.find((work) => work.id === requestedWorkId) : undefined
      if (requestedWorkId && !requestedWork) throw new PianoStorageError('NOT_FOUND', 'The selected Work no longer exists.')
      if (input.relationship === 'derived-work' && (!input.sourceWorkId || !existingWorks.some((work) => work.id === input.sourceWorkId))) {
        throw new PianoStorageError('REFERENTIAL_INTEGRITY', 'Choose the source Work for this derived Work.')
      }

      const duplicate = matchingVersions.find((version) => {
        const arrangement = existingArrangements.find((candidate) => candidate.id === version.arrangementId)
        if (!arrangement) return false
        if (requestedWorkId) return arrangement.workId === requestedWorkId
        const work = existingWorks.find((candidate) => candidate.id === arrangement.workId)
        if (input.relationship === 'derived-work') return work?.derivedFromWorkId === input.sourceWorkId && work?.title === input.work.title && work?.composer === input.work.composer
        return work?.title === input.work.title && work.composer === input.work.composer
      })
      if (duplicate) {
        const arrangement = existingArrangements.find((candidate) => candidate.id === duplicate.arrangementId)
        const work = arrangement ? existingWorks.find((candidate) => candidate.id === arrangement.workId) : undefined
        const repertoire = arrangement ? await requestValue(repertoireStore.index('arrangementId').get(arrangement.id)) as RepertoireEntry | undefined : undefined
        if (work && arrangement && repertoire) {
          transaction.abort()
          try { await completion } catch { /* expected duplicate short-circuit */ }
          return { work, arrangement, scoreVersion: duplicate, repertoire, duplicate: true }
        }
      }

      const timestamp = this.now().toISOString()
      const work: PersistedWork = requestedWork ?? {
        id: this.createId(),
        title: input.work.title.trim() || 'Untitled Work',
        composer: input.work.composer.trim() || 'Unknown composer',
        ...(input.work.metadata ? { metadata: input.work.metadata } : {}),
        ...(input.relationship === 'derived-work' ? { derivedFromWorkId: input.sourceWorkId } : {}),
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      const arrangement: PersistedArrangement = {
        id: this.createId(), workId: work.id, name: input.arrangement.name.trim() || 'Imported arrangement',
        difficulty: input.arrangement.difficulty, source: 'user-imported',
        includedPartIds: [...input.arrangement.includedPartIds],
        ...(input.arrangement.targetTempoBpm ? { targetTempoBpm: input.arrangement.targetTempoBpm } : {}),
        createdAt: timestamp, updatedAt: timestamp,
      }
      const scoreVersion: PersistedScoreVersion = {
        id: this.createId(), arrangementId: arrangement.id, version: 1,
        format: input.loaded.sourceFormat, createdAt: timestamp, sourceFileName: input.loaded.fileName,
        sourceBytes: input.loaded.sourceBytes, uncompressedBytes: input.loaded.uncompressedBytes,
        contentHash, canonicalMusicXml: input.loaded.musicXmlText, normalizedScoreId: input.normalizedScoreId,
        parserVersion: input.parserVersion,
        includedPartIds: [...input.arrangement.includedPartIds],
      }
      const repertoire: RepertoireEntry = {
        id: this.createId(), arrangementId: arrangement.id, status: input.status, addedAt: timestamp, updatedAt: timestamp,
      }
      if (!requestedWork) workStore.add(work)
      arrangementStore.add(arrangement)
      versionStore.add(scoreVersion)
      repertoireStore.add(repertoire)
      await completion
      this.notify()
      return { work, arrangement, scoreVersion, repertoire, duplicate: false }
    } catch (cause) {
      try { transaction.abort() } catch { /* already completed or aborted */ }
      try { await completion } catch { /* preserve original error */ }
      throw asPianoStorageError(cause, 'The imported score could not be saved.')
    }
  }

  async createScoreVersion(input: CreateScoreVersionInput): Promise<CreateScoreVersionResult> {
    const contentHash = await sha256Hex(input.loaded.musicXmlText)
    const database = await this.openDatabase()
    const transaction = database.transaction([STORE.arrangements, STORE.scoreVersions], 'readwrite')
    const completion = transactionComplete(transaction)
    try {
      const arrangement = await requestValue(transaction.objectStore(STORE.arrangements).get(input.arrangementId)) as PersistedArrangement | undefined
      if (!arrangement) throw new PianoStorageError('NOT_FOUND', 'The Arrangement for this score revision no longer exists.')
      const store = transaction.objectStore(STORE.scoreVersions)
      const versions = await requestValue(store.index('arrangementId').getAll(idbRangeFor(input.arrangementId))) as PersistedScoreVersion[]
      const duplicate = versions.find((version) => version.contentHash === contentHash)
      if (duplicate) {
        await completion
        return { scoreVersion: duplicate, duplicate: true }
      }
      const scoreVersion: PersistedScoreVersion = {
        id: this.createId(),
        arrangementId: input.arrangementId,
        version: Math.max(0, ...versions.map((version) => version.version)) + 1,
        format: input.loaded.sourceFormat,
        createdAt: this.now().toISOString(),
        sourceFileName: input.loaded.fileName,
        sourceBytes: input.loaded.sourceBytes,
        uncompressedBytes: input.loaded.uncompressedBytes,
        contentHash,
        canonicalMusicXml: input.loaded.musicXmlText,
        normalizedScoreId: input.normalizedScoreId,
        parserVersion: input.parserVersion,
        includedPartIds: [...input.includedPartIds],
      }
      store.add(scoreVersion)
      await completion
      this.notify()
      return { scoreVersion, duplicate: false }
    } catch (cause) {
      try { transaction.abort() } catch { /* already completed or aborted */ }
      try { await completion } catch { /* preserve original error */ }
      throw asPianoStorageError(cause, 'The new ScoreVersion could not be saved.')
    }
  }

  async listWorks(): Promise<readonly PersistedWork[]> {
    const values = await this.getAll<unknown>(STORE.works)
    const works = values.map((value) => { assertWork(value); return value })
    return works.sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id))
  }

  async listRepertoire(): Promise<readonly RepertoireListItem[]> {
    const [entries, works, arrangements, versions, summaries, sessions] = await Promise.all([
      this.getAll<RepertoireEntry>(STORE.repertoire), this.getAll<PersistedWork>(STORE.works),
      this.getAll<PersistedArrangement>(STORE.arrangements), this.getAll<PersistedScoreVersion>(STORE.scoreVersions),
      this.getAll<AttemptSummary>(STORE.summaries), this.getAll<PracticeSessionRecord>(STORE.sessions),
    ])
    return entries.map((entry) => {
      const arrangement = arrangements.find((value) => value.id === entry.arrangementId)
      const work = arrangement ? works.find((value) => value.id === arrangement.workId) : undefined
      const scoreVersion = versions.filter((value) => value.arrangementId === entry.arrangementId).sort((a, b) => b.version - a.version)[0]
      if (!arrangement || !work || !scoreVersion) throw new PianoStorageError('CORRUPT_RECORD', `Repertoire entry ${entry.id} has missing linked data.`)
      const arrangementSummaries = summaries.filter((value) => value.arrangementId === arrangement.id).sort(compareIsoDescending)
      const arrangementSessions = sessions.filter((value) => value.arrangementId === arrangement.id)
      return {
        work, arrangement, scoreVersion, repertoire: entry, latestAttempt: arrangementSummaries[0] ?? null,
        sessionCount: arrangementSessions.length,
        totalPracticeMs: arrangementSessions.reduce((total, session) => total + session.durationMs, 0),
        lastPracticedAt: arrangementSessions.map((session) => session.endedAt).sort().at(-1) ?? null,
      }
    }).sort((a, b) => (b.lastPracticedAt ?? b.repertoire.addedAt).localeCompare(a.lastPracticedAt ?? a.repertoire.addedAt) || a.arrangement.id.localeCompare(b.arrangement.id))
  }

  getArrangement(id: string): Promise<PersistedArrangement | null> { return this.getById(STORE.arrangements, id) }
  async getScoreVersion(id: string): Promise<PersistedScoreVersion | null> {
    const value = await this.getById<unknown>(STORE.scoreVersions, id)
    if (value === null) return null
    assertScoreVersion(value)
    return value
  }

  async getAttempt(id: string): Promise<PerformanceAttemptRecord | null> {
    const value = await this.getById<unknown>(STORE.attempts, id)
    if (value === null) return null
    assertAttempt(value)
    return value
  }

  async listAttemptSummaries(arrangementId?: string): Promise<readonly AttemptSummary[]> {
    const values = arrangementId
      ? await this.getAllByIndex<AttemptSummary>(STORE.summaries, 'arrangementId', arrangementId)
      : await this.getAll<AttemptSummary>(STORE.summaries)
    return values.sort(compareIsoDescending)
  }

  async listSessions(arrangementId?: string): Promise<readonly PracticeSessionRecord[]> {
    const values = arrangementId
      ? await this.getAllByIndex<PracticeSessionRecord>(STORE.sessions, 'arrangementId', arrangementId)
      : await this.getAll<PracticeSessionRecord>(STORE.sessions)
    return values.sort((a, b) => b.startedAt.localeCompare(a.startedAt) || a.id.localeCompare(b.id))
  }

  async saveAttempt(input: AttemptSaveInput): Promise<AttemptSaveResult> {
    const { attempt, session } = input
    if (attempt.practiceSessionId !== session.id || attempt.arrangementId !== session.arrangementId || attempt.scoreVersionId !== session.scoreVersionId) {
      throw new PianoStorageError('REFERENTIAL_INTEGRITY', 'The attempt and practice session identities do not match.')
    }
    const database = await this.openDatabase()
    const transaction = database.transaction([STORE.arrangements, STORE.scoreVersions, STORE.sessions, STORE.attempts, STORE.summaries], 'readwrite')
    const completion = transactionComplete(transaction)
    try {
      const arrangements = transaction.objectStore(STORE.arrangements)
      const versions = transaction.objectStore(STORE.scoreVersions)
      const sessions = transaction.objectStore(STORE.sessions)
      const attempts = transaction.objectStore(STORE.attempts)
      const summaries = transaction.objectStore(STORE.summaries)
      const [arrangement, version, existingAttempt, existingSession] = await Promise.all([
        requestValue(arrangements.get(attempt.arrangementId)), requestValue(versions.get(attempt.scoreVersionId)),
        requestValue(attempts.get(attempt.id)), requestValue(sessions.get(session.id)),
      ])
      if (!arrangement || !version || (version as PersistedScoreVersion).arrangementId !== attempt.arrangementId) {
        throw new PianoStorageError('REFERENTIAL_INTEGRITY', 'The attempt references an unavailable Arrangement or ScoreVersion.')
      }
      if (existingAttempt) {
        const existingSummary = await requestValue(summaries.get(attempt.id)) as AttemptSummary | undefined
        if (!existingSummary) throw new PianoStorageError('CORRUPT_RECORD', 'The saved attempt is missing its lightweight summary.')
        await completion
        return { created: false, summary: existingSummary }
      }
      const summary = createAttemptSummary(attempt)
      attempts.add(attempt)
      this.faultInjector?.('after-attempt-write')
      summaries.add(summary)
      const previous = existingSession as PracticeSessionRecord | undefined
      if (previous && (previous.arrangementId !== session.arrangementId || previous.scoreVersionId !== session.scoreVersionId)) {
        throw new PianoStorageError('IMMUTABLE_RECORD', 'A PracticeSession cannot be moved to another Arrangement or ScoreVersion.')
      }
      const startedAt = previous ? minIso(previous.startedAt, session.startedAt) : session.startedAt
      const endedAt = previous ? maxIso(previous.endedAt, session.endedAt) : session.endedAt
      const mergedSession: PracticeSessionRecord = {
        ...session, startedAt, endedAt,
        durationMs: Math.max(0, new Date(endedAt).getTime() - new Date(startedAt).getTime()),
        attemptIds: [...new Set([...(previous?.attemptIds ?? []), ...session.attemptIds, attempt.id])],
      }
      sessions.put(mergedSession)
      await completion
      this.notify()
      return { created: true, summary }
    } catch (cause) {
      try { transaction.abort() } catch { /* already completed or aborted */ }
      try { await completion } catch { /* preserve original error */ }
      throw asPianoStorageError(cause, 'The performance attempt could not be saved.')
    }
  }

  async removeFromRepertoire(arrangementId: string): Promise<void> {
    const database = await this.openDatabase()
    const transaction = database.transaction(STORE.repertoire, 'readwrite')
    const store = transaction.objectStore(STORE.repertoire)
    const entry = await requestValue(store.index('arrangementId').get(arrangementId)) as RepertoireEntry | undefined
    if (entry) store.delete(entry.id)
    await transactionComplete(transaction)
    this.notify()
  }

  async getProgress(range: ProgressRange, now = this.now()): Promise<ProgressSnapshot> {
    const [attempts, sessions] = await Promise.all([this.listAttemptSummaries(), this.listSessions()])
    const cutoff = cutoffForRange(range, now)
    const includedAttempts = cutoff === null ? attempts : attempts.filter((value) => new Date(value.performedAt).getTime() >= cutoff)
    const includedSessions = cutoff === null ? sessions : sessions.filter((value) => new Date(value.endedAt).getTime() >= cutoff)
    return {
      range,
      practiceTimeMs: includedSessions.reduce((total, session) => total + session.durationMs, 0),
      sessionCount: includedSessions.length,
      attemptCount: includedAttempts.length,
      activeDays: new Set(includedSessions.map((session) => session.startedAt.slice(0, 10))).size,
      attempts: includedAttempts,
      sessions: includedSessions,
    }
  }

  async getCounts(): Promise<StorageCounts> {
    const database = await this.openDatabase()
    const names = [STORE.works, STORE.arrangements, STORE.scoreVersions, STORE.repertoire, STORE.sessions, STORE.attempts] as const
    const transaction = database.transaction(names, 'readonly')
    const counts = await Promise.all(names.map((name) => requestValue(transaction.objectStore(name).count())))
    await transactionComplete(transaction)
    return {
      works: counts[0] ?? 0,
      arrangements: counts[1] ?? 0,
      scoreVersions: counts[2] ?? 0,
      repertoireEntries: counts[3] ?? 0,
      practiceSessions: counts[4] ?? 0,
      performanceAttempts: counts[5] ?? 0,
    }
  }

  async clearAll(): Promise<void> {
    const database = await this.openDatabase()
    const names = Object.values(STORE)
    const transaction = database.transaction(names, 'readwrite')
    names.forEach((name) => transaction.objectStore(name).clear())
    await transactionComplete(transaction)
    this.notify()
  }
}
