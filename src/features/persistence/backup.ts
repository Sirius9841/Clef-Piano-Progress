import { PianoStorageError } from './errors'
import { sha256Hex } from './hash'
import { PERSISTENCE_SCHEMA_VERSION, type AttemptSummary, type PerformanceAttemptRecord, type PersistedArrangement, type PersistedScoreVersion, type PersistedWork, type PracticeSessionRecord, type RepertoireEntry, type TechniqueAttemptRecord, type TechniqueAttemptSummary } from './types'

export const CLEF_BACKUP_DISCRIMINATOR = 'clef-local-backup'
export const CLEF_BACKUP_FORMAT_VERSION = 1

export interface PersistenceSnapshot {
  readonly works: readonly PersistedWork[]
  readonly arrangements: readonly PersistedArrangement[]
  readonly scoreVersions: readonly PersistedScoreVersion[]
  readonly repertoireEntries: readonly RepertoireEntry[]
  readonly practiceSessions: readonly PracticeSessionRecord[]
  readonly performanceAttempts: readonly PerformanceAttemptRecord[]
  readonly attemptSummaries: readonly AttemptSummary[]
  readonly techniqueAttempts: readonly TechniqueAttemptRecord[]
  readonly techniqueAttemptSummaries: readonly TechniqueAttemptSummary[]
}

export type BackupRecordCounts = { readonly [K in keyof PersistenceSnapshot]: number }

export type IntegritySeverity = 'error' | 'warning'

export interface IntegrityIssue {
  readonly code: string
  readonly severity: IntegritySeverity
  readonly recordFamily: keyof PersistenceSnapshot
  readonly recordId?: string
  readonly detail: string
}

export interface IntegrityReport {
  readonly status: 'healthy' | 'issues-found'
  readonly checkedAt: string
  readonly counts: BackupRecordCounts
  readonly issues: readonly IntegrityIssue[]
  readonly warnings: readonly IntegrityIssue[]
  readonly totalIssueCount: number
  readonly summaryOnlyRepairable: boolean
}

export interface ClefBackupEnvelope {
  readonly format: typeof CLEF_BACKUP_DISCRIMINATOR
  readonly formatVersion: typeof CLEF_BACKUP_FORMAT_VERSION
  readonly createdAt: string
  readonly persistenceSchemaVersion: typeof PERSISTENCE_SCHEMA_VERSION
  readonly recordCounts: BackupRecordCounts
  readonly payloadDigest: string
  readonly payload: PersistenceSnapshot
}

export interface BackupExport {
  readonly filename: string
  readonly json: string
  readonly envelope: ClefBackupEnvelope
  readonly integrity: IntegrityReport
}

export interface ValidatedBackup {
  readonly envelope: ClefBackupEnvelope
  readonly integrity: IntegrityReport
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(([key, nested]) => [key, canonicalValue(nested)]))
  }
  return value
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value))
}

export function snapshotCounts(snapshot: PersistenceSnapshot): BackupRecordCounts {
  return {
    works: snapshot.works.length,
    arrangements: snapshot.arrangements.length,
    scoreVersions: snapshot.scoreVersions.length,
    repertoireEntries: snapshot.repertoireEntries.length,
    practiceSessions: snapshot.practiceSessions.length,
    performanceAttempts: snapshot.performanceAttempts.length,
    attemptSummaries: snapshot.attemptSummaries.length,
    techniqueAttempts: snapshot.techniqueAttempts.length,
    techniqueAttemptSummaries: snapshot.techniqueAttemptSummaries.length,
  }
}

export function sortSnapshot(snapshot: PersistenceSnapshot): PersistenceSnapshot {
  const byId = <T extends { readonly id: string }>(values: readonly T[]) => [...values].sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
  return {
    works: byId(snapshot.works), arrangements: byId(snapshot.arrangements), scoreVersions: byId(snapshot.scoreVersions),
    repertoireEntries: byId(snapshot.repertoireEntries), practiceSessions: byId(snapshot.practiceSessions),
    performanceAttempts: byId(snapshot.performanceAttempts), attemptSummaries: byId(snapshot.attemptSummaries),
    techniqueAttempts: byId(snapshot.techniqueAttempts), techniqueAttemptSummaries: byId(snapshot.techniqueAttemptSummaries),
  }
}

export async function payloadDigest(snapshot: PersistenceSnapshot): Promise<string> {
  return sha256Hex(canonicalJson(snapshot))
}

export function backupFilename(createdAt: string): string {
  return `clef-backup-${createdAt.replace(/:/g, '-').replace(/\.\d{3}Z$/, 'Z')}.json`
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new PianoStorageError('CORRUPT_RECORD', `${label} is not a JSON object.`)
  return value as Record<string, unknown>
}

export function parseBackupEnvelope(json: string): ClefBackupEnvelope {
  let parsed: unknown
  try { parsed = JSON.parse(json) } catch (cause) { throw new PianoStorageError('CORRUPT_RECORD', 'The selected file is not valid JSON.', cause) }
  const envelope = objectValue(parsed, 'The backup')
  if (envelope.format !== CLEF_BACKUP_DISCRIMINATOR) throw new PianoStorageError('CORRUPT_RECORD', 'This is not a Clef local backup file.')
  if (envelope.formatVersion !== CLEF_BACKUP_FORMAT_VERSION) throw new PianoStorageError('CORRUPT_RECORD', `Backup format version ${String(envelope.formatVersion)} is not supported by this Clef release.`)
  if (envelope.persistenceSchemaVersion !== PERSISTENCE_SCHEMA_VERSION) throw new PianoStorageError('CORRUPT_RECORD', `Backup persistence schema ${String(envelope.persistenceSchemaVersion)} is not supported by this Clef release.`)
  const createdTime = typeof envelope.createdAt === 'string' ? new Date(envelope.createdAt).getTime() : Number.NaN
  if (!Number.isFinite(createdTime) || new Date(createdTime).toISOString() !== envelope.createdAt) throw new PianoStorageError('CORRUPT_RECORD', 'The backup creation timestamp is invalid.')
  if (typeof envelope.payloadDigest !== 'string' || !/^[a-f0-9]{64}$/.test(envelope.payloadDigest)) throw new PianoStorageError('CORRUPT_RECORD', 'The backup SHA-256 digest is malformed.')
  const payload = objectValue(envelope.payload, 'The backup payload')
  const counts = objectValue(envelope.recordCounts, 'The backup record counts')
  const keys: readonly (keyof PersistenceSnapshot)[] = ['works', 'arrangements', 'scoreVersions', 'repertoireEntries', 'practiceSessions', 'performanceAttempts', 'attemptSummaries', 'techniqueAttempts', 'techniqueAttemptSummaries']
  for (const key of keys) {
    if (!Array.isArray(payload[key])) throw new PianoStorageError('CORRUPT_RECORD', `The backup payload is missing ${key}.`)
    if (!Number.isInteger(counts[key]) || counts[key] !== payload[key].length) throw new PianoStorageError('CORRUPT_RECORD', `The backup count for ${key} does not match its payload.`)
  }
  return parsed as ClefBackupEnvelope
}
