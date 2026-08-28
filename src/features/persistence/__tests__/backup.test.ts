import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { parseMusicXml } from '../../musicxml/parser'
import { canonicalJson, payloadDigest, type ClefBackupEnvelope, type PersistenceSnapshot } from '../backup'
import { IndexedDbPianoProgressRepository, type PersistenceFaultStage } from '../indexedDbRepository'

type Mutable<T> = { -readonly [K in keyof T]: T[K] extends readonly (infer U)[] ? Mutable<U>[] : T[K] extends object ? Mutable<T[K]> : T[K] }
type MutableBackup = Mutable<ClefBackupEnvelope>

const scoreXml = `<?xml version="1.0"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><staff>1</staff></note></measure></part></score-partwise>`

function repository(name: string, faultStage?: PersistenceFaultStage) {
  return new IndexedDbPianoProgressRepository({
    databaseName: name,
    now: () => new Date('2026-08-28T12:34:56.000Z'),
    createId: (() => { let id = 0; return () => `${name}:id:${++id}` })(),
    ...(faultStage ? { faultInjector: (stage: PersistenceFaultStage) => { if (stage === faultStage) throw new Error(`Injected ${stage}`) } } : {}),
  })
}

async function populate(repo: IndexedDbPianoProgressRepository, title: string) {
  const score = parseMusicXml(scoreXml)
  return repo.importScore({
    relationship: 'new-work', work: { title, composer: 'Test Composer' },
    arrangement: { name: 'Piano solo', difficulty: 'Intermediate', includedPartIds: ['P1'] },
    loaded: { fileName: `${title}.musicxml`, sourceFormat: 'musicxml', musicXmlText: scoreXml, sourceBytes: scoreXml.length, uncompressedBytes: scoreXml.length },
    normalizedScoreId: score.id, parserVersion: 'musicxml-parser-1.2.0', status: 'Learning',
  })
}

async function rewritten(envelope: ClefBackupEnvelope, mutate: (value: MutableBackup) => void): Promise<string> {
  const copy = structuredClone(envelope) as MutableBackup
  mutate(copy)
  const digest = await payloadDigest(copy.payload)
  return canonicalJson({ ...copy, payloadDigest: digest })
}

describe('Clef local backup and integrity', () => {
  it('exports an empty database deterministically with all nine families and a valid digest', async () => {
    const repo = repository('backup-empty')
    const first = await repo.createBackup()
    const second = await repo.createBackup()
    expect(first.filename).toBe('clef-backup-2026-08-28T12-34-56Z.json')
    expect(first.json).toBe(second.json)
    expect(first.envelope).toMatchObject({ format: 'clef-local-backup', formatVersion: 1, persistenceSchemaVersion: 4 })
    expect(Object.keys(first.envelope.payload)).toEqual(['works', 'arrangements', 'scoreVersions', 'repertoireEntries', 'practiceSessions', 'performanceAttempts', 'attemptSummaries', 'techniqueAttempts', 'techniqueAttemptSummaries'])
    await expect(repo.inspectBackup(first.json)).resolves.toMatchObject({ integrity: { status: 'healthy' } })
  })

  it('preserves canonical MusicXML and exact values through export, replacement, and restore', async () => {
    const source = repository('backup-source')
    const imported = await populate(source, 'Source')
    const exported = await source.createBackup()
    expect(exported.envelope.payload.scoreVersions[0]).toEqual(imported.scoreVersion)
    expect(exported.envelope.payload.scoreVersions[0]?.canonicalMusicXml).toBe(scoreXml)
    const target = repository('backup-target')
    await populate(target, 'Replaced')
    const beforeInspection = (await target.createBackup()).envelope.payload
    const inspected = await target.inspectBackup(exported.json)
    expect((await target.createBackup()).envelope.payload).toEqual(beforeInspection)
    let activePracticeCleared = false
    let notifications = 0
    const unsubscribe = target.subscribe(() => { notifications += 1 })
    await expect(target.restoreBackup(inspected, () => { activePracticeCleared = true })).resolves.toMatchObject({ works: 1, scoreVersions: 1 })
    unsubscribe()
    expect(activePracticeCleared).toBe(true)
    expect(notifications).toBe(1)
    const roundTrip = await target.createBackup()
    expect(roundTrip.envelope.payload).toEqual(exported.envelope.payload)
  })

  it('atomically replaces populated storage with a valid empty backup', async () => {
    const empty = repository('backup-empty-source')
    const target = repository('backup-empty-target'); await populate(target, 'Will be replaced')
    const inspected = await target.inspectBackup((await empty.createBackup()).json)
    await expect(target.restoreBackup(inspected)).resolves.toMatchObject({ works: 0, arrangements: 0, scoreVersions: 0 })
    expect((await target.createBackup()).envelope.payload).toEqual((await empty.createBackup()).envelope.payload)
  })

  it.each([
    ['one changed character', (value: MutableBackup) => { value.payload.works[0]!.title = 'Tampered' }],
    ['one removed record', (value: MutableBackup) => { value.payload.works.pop(); value.recordCounts.works -= 1 }],
    ['one inserted record', (value: MutableBackup) => { value.payload.works.push(structuredClone(value.payload.works[0]!)); value.recordCounts.works += 1 }],
  ])('rejects payload tampering: %s', async (_label, mutate) => {
    const repo = repository(`backup-tamper-${_label}`); await populate(repo, 'Original')
    const exported = await repo.createBackup(); const parsed = JSON.parse(exported.json) as MutableBackup
    mutate(parsed)
    await expect(repo.inspectBackup(JSON.stringify(parsed))).rejects.toThrow('SHA-256')
  })

  it.each([
    ['wrong discriminator', (value: Record<string, unknown>) => { value.format = 'other' }],
    ['future format', (value: Record<string, unknown>) => { value.formatVersion = 2 }],
    ['wrong persistence schema', (value: Record<string, unknown>) => { value.persistenceSchemaVersion = 5 }],
    ['malformed digest', (value: Record<string, unknown>) => { value.payloadDigest = 'bad' }],
  ])('rejects %s before database mutation', async (_label, mutate) => {
    const repo = repository(`backup-envelope-${_label}`); const exported = await repo.createBackup()
    const value = JSON.parse(exported.json) as Record<string, unknown>; mutate(value)
    await expect(repo.inspectBackup(JSON.stringify(value))).rejects.toMatchObject({ code: 'CORRUPT_RECORD' })
    await expect(repo.getCounts()).resolves.toMatchObject({ works: 0 })
  })

  it('rejects duplicate IDs and cross-store orphan records even when their digest is recomputed', async () => {
    const repo = repository('backup-relations'); await populate(repo, 'Relations')
    const exported = await repo.createBackup()
    const duplicate = await rewritten(exported.envelope, (value) => { value.payload.works.push(structuredClone(value.payload.works[0]!)); value.recordCounts.works += 1 })
    await expect(repo.inspectBackup(duplicate)).rejects.toThrow('integrity issue')
    const orphan = await rewritten(exported.envelope, (value) => { value.payload.arrangements[0]!.workId = 'missing-work' })
    await expect(repo.inspectBackup(orphan)).rejects.toThrow('integrity issue')
  })

  it('rejects a structurally malformed record without leaking a raw property-access failure', async () => {
    const repo = repository('backup-malformed-record'); await populate(repo, 'Malformed')
    const copy = structuredClone((await repo.createBackup()).envelope) as unknown as { payload: { works: unknown[] }; payloadDigest: string }
    copy.payload.works[0] = null
    copy.payloadDigest = await payloadDigest(copy.payload as unknown as PersistenceSnapshot)
    await expect(repo.inspectBackup(canonicalJson(copy))).rejects.toMatchObject({ code: 'CORRUPT_RECORD' })
  })

  it.each(['restore-before-clear', 'restore-during-clear', 'restore-after-store-writes', 'restore-performance-attempts', 'restore-technique-attempts', 'restore-before-complete'] as const)('rolls back the complete previous database on %s', async (stage) => {
    const source = repository(`restore-source-${stage}`); await populate(source, 'Incoming'); const exported = await source.createBackup()
    const setup = repository(`restore-target-${stage}`); await populate(setup, 'Existing'); const before = (await setup.createBackup()).envelope.payload; setup.close()
    const failing = repository(`restore-target-${stage}`, stage); const inspected = await failing.inspectBackup(exported.json)
    let afterCommitCalled = false
    await expect(failing.restoreBackup(inspected, () => { afterCommitCalled = true })).rejects.toBeTruthy()
    expect(afterCommitCalled).toBe(false)
    const after = (await failing.createBackup()).envelope.payload
    expect(after).toEqual(before)
  })
})
