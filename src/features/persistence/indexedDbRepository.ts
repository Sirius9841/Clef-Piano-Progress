import { PianoStorageError, asPianoStorageError } from './errors'
import { sha256Hex } from './hash'
import { localCalendarDateKey } from './localCalendar'
import { canonicalizePartSelection, exactPartOrder, samePartSelection } from './partSelection'
import { isRepertoireStatus, type RepertoireStatus } from '../../domain/music'
import type { PianoProgressRepository } from './repository'
import { validateVoicingIntentProfile } from '../voicing-analysis/voicingIntent'
import type { VoiceLane, VoicingIntentProfile } from '../voicing-analysis/types'
import { compareTime } from '../musicxml/musicalTime'
import { parseMusicXml } from '../musicxml/parser'
import {
  CLEF_BACKUP_DISCRIMINATOR,
  CLEF_BACKUP_FORMAT_VERSION,
  backupFilename,
  canonicalJson,
  parseBackupEnvelope,
  payloadDigest,
  snapshotCounts,
  sortSnapshot,
  type BackupExport,
  type IntegrityIssue,
  type IntegrityReport,
  type PersistenceSnapshot,
  type ValidatedBackup,
} from './backup'
import {
  PERSISTENCE_SCHEMA_VERSION,
  PIANO_PROGRESS_DB_NAME,
  createAttemptSummary,
  createTechniqueAttemptSummary,
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
  type TechniqueAttemptRecord,
  type TechniqueAttemptSaveResult,
  type TechniqueAttemptSummary,
} from './types'
import {
  TECHNIQUE_ANALYSIS_ENGINE_VERSION_V1,
  TECHNIQUE_EXERCISE_ENGINE_VERSION_V1,
  SUPPORTED_TECHNIQUE_ANALYSIS_ENGINE_VERSIONS_V2,
  SUPPORTED_TECHNIQUE_ENGINE_PAIRS_V2,
  SUPPORTED_TECHNIQUE_EXERCISE_ENGINE_VERSIONS_V2,
  TECHNIQUE_FACET_IDS,
  TECHNIQUE_FACET_IDS_V1,
  TECHNIQUE_MODULE_IDS,
} from '../technique/types'

const STORE = {
  works: 'works',
  arrangements: 'arrangements',
  scoreVersions: 'scoreVersions',
  repertoire: 'repertoire',
  sessions: 'practiceSessions',
  attempts: 'performanceAttempts',
  summaries: 'attemptSummaries',
  techniqueAttempts: 'techniqueAttempts',
  techniqueSummaries: 'techniqueAttemptSummaries',
} as const

type StoreName = (typeof STORE)[keyof typeof STORE]

export type PersistenceFaultStage =
  | 'after-attempt-write'
  | 'after-technique-attempt-write'
  | 'restore-before-clear'
  | 'restore-during-clear'
  | 'restore-after-store-writes'
  | 'restore-performance-attempts'
  | 'restore-technique-attempts'
  | 'restore-before-complete'

export interface IndexedDbRepositoryOptions {
  readonly databaseName?: string
  readonly indexedDb?: IDBFactory
  readonly now?: () => Date
  readonly createId?: () => string
  readonly faultInjector?: (stage: PersistenceFaultStage) => void
  readonly openDatabaseRequest?: (name: string, version: number) => IDBOpenDBRequest
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

function isCanonicalIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const date = new Date(value)
  return Number.isFinite(date.getTime()) && date.toISOString() === value
}

function assertRecord(value: unknown, label: string): asserts value is { id: string } {
  if (!value || typeof value !== 'object' || typeof (value as { id?: unknown }).id !== 'string') {
    throw new PianoStorageError('CORRUPT_RECORD', `A stored ${label} record is invalid.`)
  }
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
}

const TECHNIQUE_DIRECTIONS = ['ascending', 'descending', 'both'] as const
const TECHNIQUE_MODES_V2 = ['major', 'natural-minor'] as const
const TECHNIQUE_HANDS = ['left', 'right', 'both'] as const
const TECHNIQUE_TEMPO_SHAPES = ['steady', 'accelerate', 'decelerate', 'arch'] as const
const TECHNIQUE_EVENT_ROLES_V2 = ['opening', 'continuation', 'turn', 'landing', 'recovery', 'closing'] as const
const TECHNIQUE_TRANSITIONS = ['opening', 'ordinary', 'direction-change', 'register-boundary', 'jump-landing', 'jump-recovery'] as const
const TECHNIQUE_EVIDENCE_FAMILIES = ['pitch', 'interval-precision', 'continuity', 'synchronization', 'tempo'] as const
const TECHNIQUE_EVIDENCE_CONTEXTS = ['first-pass', 'repeat-practice', 'technical-drill'] as const
const TECHNIQUE_OBSERVATION_UNITS = ['ratio', 'milliseconds', 'count', 'percent', 'log-ratio'] as const
const TECHNIQUE_OBSERVATION_METHODS = ['event-pitch', 'rhythm-loss', 'median-centered-interval', 'hesitation-expansion', 'chord-spread', 'turn-neighborhood', 'jump-landing-interval', 'jump-recovery-interval', 'target-tempo-ratio', 'local-tempo-stability', 'authored-tempo-trajectory'] as const

function inEnum(value: unknown, values: readonly string[]): value is string { return typeof value === 'string' && values.includes(value) }
function supportedTechniqueExerciseEngine(value: unknown): boolean { return inEnum(value, SUPPORTED_TECHNIQUE_EXERCISE_ENGINE_VERSIONS_V2) }
function supportedTechniqueAnalysisEngine(value: unknown): boolean { return inEnum(value, SUPPORTED_TECHNIQUE_ANALYSIS_ENGINE_VERSIONS_V2) }
function supportedTechniqueEnginePair(exercise: unknown, analysis: unknown): boolean {
  return SUPPORTED_TECHNIQUE_ENGINE_PAIRS_V2.some((pair) => pair.exercise === exercise && pair.analysis === analysis)
}
function validTechniqueModule(value: unknown): boolean { return inEnum(value, TECHNIQUE_MODULE_IDS) }
function validTechniqueTime(value: unknown, positive = false): boolean {
  return isObjectRecord(value) && Number.isInteger(value.numerator) && Number.isInteger(value.denominator) && (value.denominator as number) > 0 && (!positive || (value.numerator as number) > 0)
}
function validTechniqueNovelty(value: unknown, exerciseInstanceId: string): boolean {
  return isObjectRecord(value) && value.exerciseInstanceId === exerciseInstanceId && isNonnegativeInteger(value.priorSavedAttemptCount) && typeof value.firstSavedAttempt === 'boolean'
    && value.firstSavedAttempt === (value.priorSavedAttemptCount === 0)
}
function validTechniqueSpecV2(value: unknown): value is Record<string, unknown> {
  return isObjectRecord(value) && validTechniqueModule(value.moduleId) && typeof value.templateId === 'string' && value.templateId.length > 0 && typeof value.seed === 'string' && value.seed.length > 0
    && supportedTechniqueExerciseEngine(value.exerciseEngineVersion) && Number.isInteger(value.tonic) && (value.tonic as number) >= 0 && (value.tonic as number) <= 11
    && inEnum(value.mode, TECHNIQUE_MODES_V2) && isFiniteNumber(value.targetTempoBpm) && value.targetTempoBpm >= 30 && value.targetTempoBpm <= 240
    && isNonnegativeInteger(value.eventCount) && value.eventCount >= 4 && value.eventCount <= 64 && inEnum(value.direction, TECHNIQUE_DIRECTIONS)
    && (value.octaveSpan === 1 || value.octaveSpan === 2) && (value.subdivision === 1 || value.subdivision === 2 || value.subdivision === 4)
    && (value.chordInversion === 0 || value.chordInversion === 1 || value.chordInversion === 2) && [7, 12, 19, 24].includes(value.jumpSemitones as number)
    && inEnum(value.tempoShape, TECHNIQUE_TEMPO_SHAPES) && inEnum(value.declaredHandContext, TECHNIQUE_HANDS)
}
function validTechniqueChallengeV2(value: unknown, spec?: Record<string, unknown>): value is Record<string, unknown> {
  if (!isObjectRecord(value) || !isFiniteNumber(value.targetTempoBpm) || value.targetTempoBpm < 30 || value.targetTempoBpm > 240
    || !isNonnegativeInteger(value.eventCount) || value.eventCount < 1 || !validTechniqueTime(value.expectedDuration, true) || !isFiniteNumber(value.expectedDurationMs) || value.expectedDurationMs <= 0
    || !Number.isInteger(value.minimumMidi) || !Number.isInteger(value.maximumMidi) || (value.minimumMidi as number) < 0 || (value.maximumMidi as number) > 127 || (value.minimumMidi as number) > (value.maximumMidi as number)
    || !isFiniteNumber(value.pitchSpanSemitones) || value.pitchSpanSemitones !== (value.maximumMidi as number) - (value.minimumMidi as number)
    || !isNonnegativeInteger(value.maximumChordSize) || value.maximumChordSize < 1 || !isNonnegativeInteger(value.maximumJumpSemitones)
    || !isFiniteNumber(value.rhythmicDensity) || value.rhythmicDensity <= 0 || ![1, 2, 4].includes(value.smallestSubdivision as number)
    || !isNonnegativeInteger(value.tempoChangeCount) || (value.octaveSpan !== 1 && value.octaveSpan !== 2) || !isObjectRecord(value.moduleSpecific)
    || !Number.isInteger(value.tonic) || (value.tonic as number) < 0 || (value.tonic as number) > 11 || !inEnum(value.mode, TECHNIQUE_MODES_V2)
    || !inEnum(value.declaredHandContext, TECHNIQUE_HANDS) || !inEnum(value.direction, TECHNIQUE_DIRECTIONS)
    || ![1, 2, 4].includes(value.subdivision as number) || ![0, 1, 2].includes(value.chordInversion as number)
    || ![7, 12, 19, 24].includes(value.jumpSemitones as number) || !inEnum(value.tempoShape, TECHNIQUE_TEMPO_SHAPES)) return false
  return !spec || (value.tonic === spec.tonic && value.mode === spec.mode && value.declaredHandContext === spec.declaredHandContext && value.direction === spec.direction
    && value.subdivision === spec.subdivision && value.chordInversion === spec.chordInversion && value.jumpSemitones === spec.jumpSemitones && value.tempoShape === spec.tempoShape
    && value.targetTempoBpm === spec.targetTempoBpm && value.eventCount === spec.eventCount && value.octaveSpan === spec.octaveSpan)
}
function validTechniqueExerciseV2(value: unknown): value is Record<string, unknown> {
  if (!isObjectRecord(value) || typeof value.id !== 'string' || typeof value.title !== 'string' || value.title.length === 0 || typeof value.generatedMusicXml !== 'string' || value.generatedMusicXml.length === 0
    || typeof value.parserVersion !== 'string' || !validTechniqueSpecV2(value.spec) || !Array.isArray(value.events) || !validTechniqueChallengeV2(value.challenge, value.spec)
    || value.events.length !== value.spec.eventCount || value.events.length !== value.challenge.eventCount) return false
  const ids = new Set<string>()
  const eventsValid = value.events.every((event) => {
    if (!isObjectRecord(event) || typeof event.id !== 'string' || ids.has(event.id) || !validTechniqueTime(event.position) || !validTechniqueTime(event.duration, true)
      || !Array.isArray(event.midiNotes) || event.midiNotes.length === 0 || !event.midiNotes.every((midi) => Number.isInteger(midi) && midi >= 0 && midi <= 127)
      || !inEnum(event.role, TECHNIQUE_EVENT_ROLES_V2) || !inEnum(event.transitionKind, TECHNIQUE_TRANSITIONS) || !isFiniteNumber(event.targetTempoBpm) || event.targetTempoBpm < 30 || event.targetTempoBpm > 240) return false
    ids.add(event.id); return true
  })
  return eventsValid
}
function validTechniqueCompletionV2(value: unknown): boolean {
  if (!isObjectRecord(value) || !isNonnegativeInteger(value.expectedEventCount) || value.expectedEventCount < 1 || !isNonnegativeInteger(value.attemptedEventCount)
    || !isNonnegativeInteger(value.completeCorrectOrIncorrectEventCount) || value.attemptedEventCount > value.expectedEventCount || value.completeCorrectOrIncorrectEventCount > value.attemptedEventCount
    || !(value.reachedSpanEndIndex === null || (isNonnegativeInteger(value.reachedSpanEndIndex) && value.reachedSpanEndIndex < value.expectedEventCount))
    || !isFiniteNumber(value.eventCoverageRatio) || !isFiniteNumber(value.spanReachedRatio) || value.eventCoverageRatio < 0 || value.eventCoverageRatio > 1 || value.spanReachedRatio < 0 || value.spanReachedRatio > 1
    || typeof value.completeEnoughForEvidence !== 'boolean') return false
  const expectedCoverage = value.completeCorrectOrIncorrectEventCount / value.expectedEventCount
  const expectedSpan = value.reachedSpanEndIndex === null ? 0 : (value.reachedSpanEndIndex + 1) / value.expectedEventCount
  return approximately(value.eventCoverageRatio, expectedCoverage) && approximately(value.spanReachedRatio, expectedSpan)
}
function validTechniqueFacetV2(value: unknown, challenge: Record<string, unknown>, observationIds: ReadonlySet<string>): boolean {
  if (!isObjectRecord(value) || !inEnum(value.id, TECHNIQUE_FACET_IDS) || typeof value.label !== 'string' || value.label.length === 0 || !validStatus(value.status)
    || !(value.score === null || (isFiniteNumber(value.score) && value.score >= 0 && value.score <= 100)) || !validReliability(value.reliability)
    || !isNonnegativeInteger(value.evidenceCount) || !isNonnegativeInteger(value.eligibleCount) || value.evidenceCount > value.eligibleCount
    || !isFiniteNumber(value.coverage) || value.coverage < 0 || value.coverage > 1 || !approximately(value.coverage, value.eligibleCount === 0 ? 0 : value.evidenceCount / value.eligibleCount)
    || !inEnum(value.evidenceFamily, TECHNIQUE_EVIDENCE_FAMILIES) || !inEnum(value.evidenceContext, TECHNIQUE_EVIDENCE_CONTEXTS)
    || !Array.isArray(value.observationIds) || !value.observationIds.every((id) => typeof id === 'string' && observationIds.has(id)) || new Set(value.observationIds).size !== value.observationIds.length
    || value.evidenceCount !== value.observationIds.length || !isNonnegativeInteger(value.minimumEvidence) || value.minimumEvidence < 1 || typeof value.summary !== 'string'
    || !validTechniqueChallengeV2(value.challengeEvidence) || !semanticEqual(value.challengeEvidence, challenge)) return false
  return value.status === 'ready' ? value.score !== null && value.evidenceCount >= value.minimumEvidence && value.reliability !== 'unavailable' : value.score === null && value.reliability === 'unavailable'
}
function validTechniqueAnalysisV2(value: unknown, exercise: Record<string, unknown>): value is Record<string, unknown> {
  if (!isObjectRecord(value) || typeof value.id !== 'string' || !validStatus(value.status) || !supportedTechniqueAnalysisEngine(value.analysisEngineVersion)
    || value.moduleId !== (exercise.spec as Record<string, unknown>).moduleId || value.exerciseInstanceId !== exercise.id || typeof value.recordingId !== 'string'
    || typeof value.alignmentId !== 'string' || typeof value.noteGradingId !== 'string' || typeof value.timingAnalysisId !== 'string'
    || !validTechniqueCompletionV2(value.completion) || !validTechniqueNovelty(value.novelty, exercise.id as string) || !validTechniqueChallengeV2(value.challenge, exercise.spec as Record<string, unknown>)
    || !semanticEqual(value.challenge, exercise.challenge) || !Array.isArray(value.facets) || !Array.isArray(value.observations) || !Array.isArray(value.findings)
    || !isStringArray(value.findings) || !isStringArray(value.exclusions) || !isStringArray(value.warnings)) return false
  const facetIds = new Set(value.facets.flatMap((facet) => isObjectRecord(facet) && typeof facet.id === 'string' ? [facet.id] : []))
  const observationIds = new Set<string>()
  const observationsValid = value.observations.every((observation) => {
    if (!isObjectRecord(observation) || typeof observation.id !== 'string' || observationIds.has(observation.id) || !inEnum(observation.facetId, TECHNIQUE_FACET_IDS) || !facetIds.has(observation.facetId)
      || !isStringArray(observation.expectedEventIds) || !isStringArray(observation.expectedGroupIds) || !isStringArray(observation.performedGroupIds)
      || !isStringArray(observation.sourceTimingObservationIds) || !isStringArray(observation.sourceNoteResultIds)
      || !isFiniteNumber(observation.score) || observation.score < 0 || observation.score > 100 || !isFiniteNumber(observation.value)
      || !inEnum(observation.unit, TECHNIQUE_OBSERVATION_UNITS) || !inEnum(observation.method, TECHNIQUE_OBSERVATION_METHODS) || typeof observation.summary !== 'string') return false
    observationIds.add(observation.id); return true
  })
  return observationsValid && facetIds.size === value.facets.length && value.facets.every((facet) => validTechniqueFacetV2(facet, value.challenge as Record<string, unknown>, observationIds))
    && (value.status === 'ready' ? value.facets.some((facet) => isObjectRecord(facet) && facet.status === 'ready') : value.facets.every((facet) => isObjectRecord(facet) && facet.status === 'unavailable'))
}
function validTechniqueV1Base(value: Record<string, unknown>): boolean {
  if (value.schemaVersion !== 1 || typeof value.id !== 'string' || !isCanonicalIsoTimestamp(value.performedAt) || !validTechniqueModule(value.moduleId)
    || typeof value.templateId !== 'string' || typeof value.exerciseInstanceId !== 'string' || !isObjectRecord(value.exercise) || value.exercise.id !== value.exerciseInstanceId
    || !isObjectRecord(value.exercise.spec) || value.exercise.spec.moduleId !== value.moduleId || value.exercise.spec.templateId !== value.templateId
    || value.exercise.spec.exerciseEngineVersion !== TECHNIQUE_EXERCISE_ENGINE_VERSION_V1 || !isObjectRecord(value.techniqueAnalysis)
    || value.techniqueAnalysis.analysisEngineVersion !== TECHNIQUE_ANALYSIS_ENGINE_VERSION_V1 || !isObjectRecord(value.engineVersions)
    || value.engineVersions.exercise !== TECHNIQUE_EXERCISE_ENGINE_VERSION_V1 || value.engineVersions.techniqueAnalysis !== TECHNIQUE_ANALYSIS_ENGINE_VERSION_V1) return false
  return Array.isArray(value.techniqueAnalysis.facets) && value.techniqueAnalysis.facets.every((facet) => isObjectRecord(facet) && inEnum(facet.id, TECHNIQUE_FACET_IDS_V1))
}
function validTechniqueCrossProvenance(value: Record<string, unknown>, strictEngines: boolean): boolean {
  if (!isObjectRecord(value.exercise) || !isObjectRecord(value.expectedPerformancePlan) || !isObjectRecord(value.recording) || !isObjectRecord(value.recording.practiceContext)
    || !isObjectRecord(value.alignment) || !isObjectRecord(value.noteGrading) || !isObjectRecord(value.timingAnalysis) || !isObjectRecord(value.techniqueAnalysis) || !isObjectRecord(value.engineVersions)) return false
  const plan = value.expectedPerformancePlan, recording = value.recording, practiceContext = recording.practiceContext as Record<string, unknown>, alignment = value.alignment, notes = value.noteGrading, timing = value.timingAnalysis, technique = value.techniqueAnalysis
  const provenance = plan.id === practiceContext.expectedPerformancePlanId && alignment.expectedPlanId === plan.id && alignment.recordingId === recording.id
    && notes.expectedPlanId === plan.id && notes.recordingId === recording.id && notes.alignmentId === alignment.id
    && timing.expectedPlanId === plan.id && timing.recordingId === recording.id && timing.alignmentId === alignment.id && timing.noteGradingId === notes.id
    && technique.exerciseInstanceId === value.exercise.id && technique.recordingId === recording.id && technique.alignmentId === alignment.id && technique.noteGradingId === notes.id && technique.timingAnalysisId === timing.id
  if (!strictEngines) return provenance
  return provenance && isObjectRecord(alignment.diagnostics) && isObjectRecord(notes.diagnostics) && isObjectRecord(timing.diagnostics)
    && value.engineVersions.exercise === (value.exercise.spec as Record<string, unknown>).exerciseEngineVersion && value.engineVersions.parser === value.exercise.parserVersion
    && value.engineVersions.alignment === alignment.diagnostics.alignmentEngineVersion && value.engineVersions.noteGrading === notes.diagnostics.noteGradingEngineVersion
    && value.engineVersions.timingAnalysis === timing.diagnostics.timingAnalysisEngineVersion && value.engineVersions.techniqueAnalysis === technique.analysisEngineVersion
}
function validTechniqueSnapshotSources(value: Record<string, unknown>): boolean {
  const exercise = value.exercise, plan = value.expectedPerformancePlan, recording = value.recording, alignment = value.alignment, notes = value.noteGrading, timing = value.timingAnalysis, technique = value.techniqueAnalysis
  if (!isObjectRecord(exercise) || !Array.isArray(exercise.events) || !isObjectRecord(plan) || typeof plan.id !== 'string' || !Array.isArray(plan.onsetGroups)
    || !isObjectRecord(recording) || typeof recording.id !== 'string' || !isFiniteNumber(recording.durationMs) || recording.durationMs < 0 || !Array.isArray(recording.events) || !Array.isArray(recording.keyPresses) || !isObjectRecord(recording.statistics)
    || !isObjectRecord(alignment) || typeof alignment.id !== 'string' || !Array.isArray(alignment.expectedGroups) || !Array.isArray(alignment.performedGroups) || !Array.isArray(alignment.groupAlignments)
    || !isObjectRecord(notes) || typeof notes.id !== 'string' || !Array.isArray(notes.expectedResults) || !Array.isArray(notes.performedResults) || !Array.isArray(notes.groupResults)
    || !isObjectRecord(timing) || typeof timing.id !== 'string' || !isObjectRecord(timing.rhythm) || !Array.isArray(timing.rhythm.observations) || !Array.isArray(timing.rhythm.chordSpreadDiagnostics)
    || !isObjectRecord(timing.tempo) || !Array.isArray(timing.tempo.localSamples) || !isObjectRecord(technique) || !Array.isArray(technique.observations)) return false
  const ids = (items: readonly unknown[]): Set<string> => new Set(items.flatMap((item) => isObjectRecord(item) && typeof item.id === 'string' ? [item.id] : []))
  const eventIds = ids(exercise.events), expectedGroupIds = ids(alignment.expectedGroups), performedGroupIds = ids(alignment.performedGroups)
  const noteResultIds = new Set([...ids(notes.expectedResults), ...ids(notes.performedResults), ...ids(notes.groupResults)])
  const timingIds = new Set([...ids(timing.rhythm.observations), ...ids(timing.rhythm.chordSpreadDiagnostics), ...ids(timing.tempo.localSamples)])
  if (eventIds.size !== exercise.events.length || expectedGroupIds.size !== alignment.expectedGroups.length || performedGroupIds.size !== alignment.performedGroups.length) return false
  return technique.observations.every((observation) => isObjectRecord(observation)
    && isStringArray(observation.expectedEventIds) && observation.expectedEventIds.every((id) => eventIds.has(id))
    && isStringArray(observation.expectedGroupIds) && observation.expectedGroupIds.every((id) => expectedGroupIds.has(id))
    && isStringArray(observation.performedGroupIds) && observation.performedGroupIds.every((id) => performedGroupIds.has(id))
    && isStringArray(observation.sourceTimingObservationIds) && observation.sourceTimingObservationIds.every((id) => timingIds.has(id))
    && isStringArray(observation.sourceNoteResultIds) && observation.sourceNoteResultIds.every((id) => noteResultIds.has(id)))
}
function sameMidiMultiset(left: readonly unknown[], right: readonly unknown[]): boolean {
  if (left.length !== right.length || !left.every(Number.isInteger) || !right.every(Number.isInteger)) return false
  const sortedLeft = [...left].sort((a, b) => (a as number) - (b as number)), sortedRight = [...right].sort((a, b) => (a as number) - (b as number))
  return sortedLeft.every((midi, index) => midi === sortedRight[index])
}
function validTechniqueExercisePlan(value: Record<string, unknown>): boolean {
  const exercise = value.exercise, plan = value.expectedPerformancePlan, recording = value.recording
  if (!isObjectRecord(exercise) || !Array.isArray(exercise.events) || !isObjectRecord(plan) || !Array.isArray(plan.onsetGroups)
    || !Array.isArray(plan.includedPartIds) || plan.includedPartIds.length !== 1 || plan.includedPartIds[0] !== 'P1'
    || !isObjectRecord(recording) || !isObjectRecord(recording.practiceContext) || typeof plan.scoreId !== 'string' || recording.practiceContext.scoreId !== plan.scoreId
    || exercise.events.length !== plan.onsetGroups.length) return false
  const onsetGroups = plan.onsetGroups
  return exercise.events.every((event, index) => {
    const group = onsetGroups[index]
    return isObjectRecord(event) && validTechniqueTime(event.position) && Array.isArray(event.midiNotes)
      && isObjectRecord(group) && validTechniqueTime(group.position) && Array.isArray(group.midiNotes)
      && compareTime(event.position as { numerator: number; denominator: number }, group.position as { numerator: number; denominator: number }) === 0
      && sameMidiMultiset(event.midiNotes, group.midiNotes)
  })
}
function assertTechniqueAttempt(value: unknown): asserts value is TechniqueAttemptRecord {
  if (!isObjectRecord(value)) throw new PianoStorageError('CORRUPT_RECORD', 'A stored TechniqueAttempt record is invalid.')
  const valid = value.schemaVersion === 1 ? validTechniqueV1Base(value) && validTechniqueCrossProvenance(value, false)
    : value.schemaVersion === 2 && typeof value.id === 'string' && isCanonicalIsoTimestamp(value.performedAt) && validTechniqueModule(value.moduleId)
      && typeof value.templateId === 'string' && typeof value.exerciseInstanceId === 'string' && validTechniqueExerciseV2(value.exercise)
      && value.exercise.id === value.exerciseInstanceId && (value.exercise.spec as Record<string, unknown>).moduleId === value.moduleId && (value.exercise.spec as Record<string, unknown>).templateId === value.templateId
      && validTechniqueAnalysisV2(value.techniqueAnalysis, value.exercise) && validTechniqueNovelty(value.novelty, value.exerciseInstanceId) && semanticEqual(value.novelty, value.techniqueAnalysis.novelty)
      && isObjectRecord(value.engineVersions) && supportedTechniqueEnginePair(value.engineVersions.exercise, value.engineVersions.techniqueAnalysis)
      && validTechniqueCrossProvenance(value, true) && validTechniqueSnapshotSources(value) && validTechniqueExercisePlan(value)
  if (!valid) throw new PianoStorageError('CORRUPT_RECORD', 'A stored TechniqueAttempt record is invalid or has inconsistent provenance.')
}

function validTechniqueSummaryV1(value: Record<string, unknown>): boolean {
  return !('schemaVersion' in value) && typeof value.id === 'string' && validTechniqueModule(value.moduleId) && typeof value.templateId === 'string' && typeof value.exerciseInstanceId === 'string'
    && isCanonicalIsoTimestamp(value.performedAt) && isFiniteNumber(value.durationMs) && value.durationMs >= 0 && isObjectRecord(value.challenge)
    && isFiniteNumber(value.completionRatio) && value.completionRatio >= 0 && value.completionRatio <= 1 && Array.isArray(value.facets)
    && value.facets.every((facet) => isObjectRecord(facet) && inEnum(facet.id, TECHNIQUE_FACET_IDS_V1) && typeof facet.label === 'string' && validStatus(facet.status)
      && (facet.score === null || (isFiniteNumber(facet.score) && facet.score >= 0 && facet.score <= 100)) && validReliability(facet.reliability)
      && isNonnegativeInteger(facet.evidenceCount) && isFiniteNumber(facet.coverage) && facet.coverage >= 0 && facet.coverage <= 1)
}
function validTechniqueSummaryV2(value: Record<string, unknown>): boolean {
  if (value.schemaVersion !== 2 || typeof value.id !== 'string' || !validTechniqueModule(value.moduleId) || typeof value.templateId !== 'string' || typeof value.exerciseInstanceId !== 'string'
    || !isCanonicalIsoTimestamp(value.performedAt) || !isFiniteNumber(value.durationMs) || value.durationMs < 0 || !supportedTechniqueExerciseEngine(value.exerciseEngineVersion)
    || !supportedTechniqueEnginePair(value.exerciseEngineVersion, value.techniqueAnalysisEngineVersion) || !validTechniqueChallengeV2(value.challenge) || !validTechniqueCompletionV2(value.completion)
    || !validTechniqueNovelty(value.novelty, value.exerciseInstanceId) || !Array.isArray(value.facets)) return false
  return value.facets.every((facet) => isObjectRecord(facet) && inEnum(facet.id, TECHNIQUE_FACET_IDS) && typeof facet.label === 'string' && validStatus(facet.status)
    && (facet.score === null || (isFiniteNumber(facet.score) && facet.score >= 0 && facet.score <= 100)) && validReliability(facet.reliability)
    && isNonnegativeInteger(facet.evidenceCount) && isNonnegativeInteger(facet.eligibleCount) && facet.evidenceCount <= facet.eligibleCount
    && isFiniteNumber(facet.coverage) && facet.coverage >= 0 && facet.coverage <= 1 && approximately(facet.coverage, facet.eligibleCount === 0 ? 0 : facet.evidenceCount / facet.eligibleCount)
    && inEnum(facet.evidenceFamily, TECHNIQUE_EVIDENCE_FAMILIES) && inEnum(facet.evidenceContext, TECHNIQUE_EVIDENCE_CONTEXTS) && isNonnegativeInteger(facet.minimumEvidence) && facet.minimumEvidence >= 1
    && (facet.status === 'ready' ? facet.score !== null && facet.evidenceCount >= facet.minimumEvidence && facet.reliability !== 'unavailable' : facet.score === null && facet.reliability === 'unavailable'))
}
function assertTechniqueSummary(value: unknown): asserts value is TechniqueAttemptSummary {
  if (!isObjectRecord(value) || !(validTechniqueSummaryV1(value) || validTechniqueSummaryV2(value))) throw new PianoStorageError('CORRUPT_RECORD', 'A stored TechniqueAttempt summary is invalid.')
}

function semanticEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (Array.isArray(left) || Array.isArray(right)) return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((item, index) => semanticEqual(item, right[index]))
  if (!isObjectRecord(left) || !isObjectRecord(right)) return false
  const leftKeys = Object.keys(left).sort(), rightKeys = Object.keys(right).sort()
  return leftKeys.length === rightKeys.length && leftKeys.every((key, index) => key === rightKeys[index] && semanticEqual(left[key], right[key]))
}

function isNullableInteger(value: unknown): value is number | null {
  return value === null || Number.isInteger(value)
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function isFiniteNumber(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) }
function isNonnegativeInteger(value: unknown): value is number { return Number.isInteger(value) && (value as number) >= 0 }
function isUnitNumberOrNull(value: unknown): boolean { return value === null || (isFiniteNumber(value) && value >= 0 && value <= 1) }
function isMusicalTimeRecord(value: unknown): boolean {
  return isObjectRecord(value) && Number.isInteger(value.numerator) && Number.isInteger(value.denominator) && (value.denominator as number) > 0
}

function isStringArray(value: unknown): value is string[] { return Array.isArray(value) && value.every((item) => typeof item === 'string') }
function isStringRecord(value: unknown): value is Record<string, string> { return isObjectRecord(value) && Object.values(value).every((item) => typeof item === 'string') }
function approximately(left: number, right: number): boolean { return Math.abs(left - right) <= 1e-9 }
function validRatio(ratio: unknown, numerator: number, denominator: number): boolean { return denominator === 0 ? ratio === null : isFiniteNumber(ratio) && approximately(ratio, numerator / denominator) }
function validReliability(value: unknown): boolean { return value === 'reliable' || value === 'limited' || value === 'provisional' || value === 'unavailable' }
function validStatus(value: unknown): boolean { return value === 'ready' || value === 'unavailable' }
function validWarning(value: unknown): boolean { return isObjectRecord(value) && typeof value.code === 'string' && typeof value.message === 'string' }
function sameStringRecord(left: Record<string, string>, right: Record<string, string>): boolean {
  const leftEntries = Object.entries(left).sort(([a], [b]) => a.localeCompare(b))
  const rightEntries = Object.entries(right).sort(([a], [b]) => a.localeCompare(b))
  return leftEntries.length === rightEntries.length && leftEntries.every(([key, value], index) => rightEntries[index]?.[0] === key && rightEntries[index]?.[1] === value)
}

function validIntentSnapshot(value: unknown): boolean {
  if (value === null) return true
  return isObjectRecord(value) && typeof value.id === 'string' && typeof value.scoreVersionId === 'string' && isCanonicalIsoTimestamp(value.updatedAt)
    && Array.isArray(value.regions) && value.regions.length > 0 && value.regions.every((region) => isObjectRecord(region) && typeof region.id === 'string'
      && isNonnegativeInteger(region.startMeasureIndex) && isNonnegativeInteger(region.endMeasureIndex) && region.endMeasureIndex >= region.startMeasureIndex
      && isStringArray(region.foregroundLaneIds) && region.foregroundLaneIds.length > 0 && isStringArray(region.supportLaneIds) && region.supportLaneIds.length > 0)
}

function validVoicingSnapshot(voicing: Record<string, unknown>): boolean {
  if (!validStatus(voicing.status) || (voicing.mode !== 'descriptive' && voicing.mode !== 'configured') || !validReliability(voicing.reliability)
    || !isUnitNumberOrNull(voicing.score) || !isNullableString(voicing.unavailableReason) || !validIntentSnapshot(voicing.intentProfileSnapshot)
    || !Array.isArray(voicing.lanes) || !Array.isArray(voicing.targets) || !Array.isArray(voicing.observations) || !Array.isArray(voicing.regionResults)
    || !Array.isArray(voicing.laneStatistics) || !Array.isArray(voicing.exclusions) || !Array.isArray(voicing.warnings)
    || !isObjectRecord(voicing.coverage) || !isObjectRecord(voicing.diagnostics)) return false
  const targets = voicing.targets
  const observations = voicing.observations
  const lanesValid = voicing.lanes.every((lane) => isObjectRecord(lane) && typeof lane.id === 'string' && typeof lane.partId === 'string'
    && isNullableString(lane.partName) && isNullableInteger(lane.staff) && isNullableString(lane.voice) && isNonnegativeInteger(lane.noteCount)
    && Array.isArray(lane.measureCoverage) && lane.measureCoverage.every(isNonnegativeInteger)
    && typeof lane.ambiguous === 'boolean' && typeof lane.label === 'string')
  const laneIds = new Set(voicing.lanes.flatMap((lane) => isObjectRecord(lane) && typeof lane.id === 'string' ? [lane.id] : []))
  const intentRegionIds = new Set(isObjectRecord(voicing.intentProfileSnapshot) && Array.isArray(voicing.intentProfileSnapshot.regions)
    ? voicing.intentProfileSnapshot.regions.flatMap((region) => isObjectRecord(region) && typeof region.id === 'string' ? [region.id] : []) : [])
  const targetsValid = targets.every((target) => isObjectRecord(target) && typeof target.id === 'string' && typeof target.regionId === 'string'
    && isMusicalTimeRecord(target.position) && isNonnegativeInteger(target.measureIndex) && typeof target.measureNumber === 'string'
    && isStringArray(target.foregroundLaneIds) && isStringArray(target.supportLaneIds) && isStringArray(target.foregroundExpectedTargetIds)
    && isStringArray(target.supportExpectedTargetIds) && isStringArray(target.sourceNoteIds)
    && [...target.foregroundLaneIds, ...target.supportLaneIds].every((laneId) => laneIds.has(laneId))
    && (voicing.mode !== 'configured' || intentRegionIds.has(target.regionId)))
  const targetById = new Map(targets.flatMap((target) => isObjectRecord(target) && typeof target.id === 'string' ? [[target.id, target] as const] : []))
  const observationsValid = observations.every((observation) => isObjectRecord(observation) && typeof observation.id === 'string'
    && typeof observation.targetId === 'string' && targetById.has(observation.targetId) && typeof observation.regionId === 'string'
    && isMusicalTimeRecord(observation.position) && isNonnegativeInteger(observation.measureIndex) && typeof observation.measureNumber === 'string'
    && isStringArray(observation.foregroundObservationIds) && isStringArray(observation.supportObservationIds)
    && isFiniteNumber(observation.foregroundIntensity) && observation.foregroundIntensity >= 0 && observation.foregroundIntensity <= 1
    && isFiniteNumber(observation.supportIntensity) && observation.supportIntensity >= 0 && observation.supportIntensity <= 1
    && isFiniteNumber(observation.focusAdvantage) && approximately(observation.focusAdvantage, observation.foregroundIntensity - observation.supportIntensity)
    && isFiniteNumber(observation.score) && observation.score >= 0 && observation.score <= 1 && typeof observation.summary === 'string'
    && (() => { const target = targetById.get(observation.targetId as string); return !!target && target.regionId === observation.regionId && target.measureIndex === observation.measureIndex && target.measureNumber === observation.measureNumber && isObjectRecord(target.position) && compareTime(target.position as { numerator: number; denominator: number }, observation.position as { numerator: number; denominator: number }) === 0 })())
  const regionsValid = voicing.regionResults.every((region) => isObjectRecord(region) && typeof region.regionId === 'string' && intentRegionIds.has(region.regionId)
    && isNonnegativeInteger(region.targetCount) && region.targetCount === targets.filter((target) => isObjectRecord(target) && target.regionId === region.regionId).length
    && isNonnegativeInteger(region.analyzedTargetCount) && region.analyzedTargetCount === observations.filter((observation) => isObjectRecord(observation) && observation.regionId === region.regionId).length
    && region.analyzedTargetCount <= region.targetCount && isUnitNumberOrNull(region.score))
  const laneStatsValid = voicing.laneStatistics.every((lane) => isObjectRecord(lane) && typeof lane.laneId === 'string' && laneIds.has(lane.laneId)
    && isNonnegativeInteger(lane.sampleCount) && isUnitNumberOrNull(lane.medianNormalizedIntensity))
  const exclusionsValid = voicing.exclusions.every((item) => isObjectRecord(item) && typeof item.id === 'string' && typeof item.sourceId === 'string'
    && isNullableString(item.measureNumber) && typeof item.reason === 'string')
  const coverage = voicing.coverage
  const diagnostics = voicing.diagnostics
  const descriptiveShapeValid = voicing.mode !== 'descriptive' || (voicing.intentProfileSnapshot === null && targets.length === 0 && observations.length === 0 && voicing.regionResults.length === 0)
  const configuredShapeValid = voicing.mode !== 'configured' || voicing.intentProfileSnapshot !== null
  const configuredRegionCount = isObjectRecord(voicing.intentProfileSnapshot) && Array.isArray(voicing.intentProfileSnapshot.regions) ? voicing.intentProfileSnapshot.regions.length : 0
  return lanesValid && laneIds.size === voicing.lanes.length && targetsValid && targetById.size === targets.length && observationsValid
    && new Set(observations.flatMap((observation) => isObjectRecord(observation) && typeof observation.id === 'string' ? [observation.id] : [])).size === observations.length
    && regionsValid && new Set(voicing.regionResults.flatMap((region) => isObjectRecord(region) && typeof region.regionId === 'string' ? [region.regionId] : [])).size === voicing.regionResults.length
    && laneStatsValid && exclusionsValid && descriptiveShapeValid && configuredShapeValid && voicing.warnings.every(validWarning)
    && isNonnegativeInteger(coverage.configuredTargetCount) && isNonnegativeInteger(coverage.analyzedTargetCount)
    && coverage.analyzedTargetCount <= coverage.configuredTargetCount && validRatio(coverage.ratio, coverage.analyzedTargetCount, coverage.configuredTargetCount)
    && typeof diagnostics.voicingAnalysisEngineVersion === 'string' && typeof diagnostics.normalizationMethod === 'string'
    && isNonnegativeInteger(diagnostics.configuredRegionCount) && diagnostics.configuredRegionCount === configuredRegionCount && isNonnegativeInteger(diagnostics.targetCount) && isNonnegativeInteger(diagnostics.analyzedTargetCount)
    && diagnostics.targetCount === targets.length && diagnostics.analyzedTargetCount === observations.length
    && coverage.configuredTargetCount === targets.length && coverage.analyzedTargetCount === observations.length
}

function validReferenceDimension(value: unknown): boolean {
  if (!isObjectRecord(value) || !validStatus(value.status) || !validReliability(value.reliability) || !isNullableString(value.unavailableReason)
    || !isObjectRecord(value.coverage) || !Array.isArray(value.observations) || typeof value.summary !== 'string') return false
  const coverage = value.coverage
  if (!isNonnegativeInteger(coverage.currentCount) || !isNonnegativeInteger(coverage.referenceCount) || !isNonnegativeInteger(coverage.sharedCount)
    || coverage.sharedCount > coverage.currentCount || coverage.sharedCount > coverage.referenceCount
    || !validRatio(coverage.ratio, coverage.sharedCount, Math.max(coverage.currentCount, coverage.referenceCount))) return false
  const observationsValid = value.observations.every((item) => isObjectRecord(item) && typeof item.id === 'string' && typeof item.key === 'string'
    && isMusicalTimeRecord(item.position) && isStringArray(item.measureNumbers) && isFiniteNumber(item.currentValue) && isFiniteNumber(item.referenceValue)
    && isFiniteNumber(item.signedDifference) && approximately(item.signedDifference, item.currentValue - item.referenceValue)
    && isFiniteNumber(item.magnitude) && item.magnitude >= 0 && approximately(item.magnitude, Math.abs(item.signedDifference))
    && (item.similarity === 'very-similar' || item.similarity === 'similar' || item.similarity === 'noticeably-different' || item.similarity === 'strongly-different')
    && typeof item.description === 'string')
  return observationsValid && value.observations.length === coverage.sharedCount
}

function validReferenceSnapshot(reference: Record<string, unknown>): boolean {
  if (!validStatus(reference.status) || !validReliability(reference.reliability) || !isNullableString(reference.unavailableReason)
    || !isObjectRecord(reference.overlapScope) || !validReferenceDimension(reference.tempo) || !validReferenceDimension(reference.dynamics)
    || !validReferenceDimension(reference.articulation) || !validReferenceDimension(reference.pedal) || !validReferenceDimension(reference.voicing)
    || !Array.isArray(reference.warnings) || !reference.warnings.every(validWarning) || !isObjectRecord(reference.diagnostics)
    || !isStringRecord(reference.referenceEngineVersions) || !isStringRecord(reference.diagnostics.currentEngineVersions)
    || !isStringRecord(reference.diagnostics.referenceEngineVersions) || !sameStringRecord(reference.referenceEngineVersions, reference.diagnostics.referenceEngineVersions)) return false
  const overlap = reference.overlapScope
  const validStart = overlap.start === null || isMusicalTimeRecord(overlap.start)
  const validEnd = overlap.end === null || isMusicalTimeRecord(overlap.end)
  if (!validStart || !validEnd || (isObjectRecord(overlap.start) && isObjectRecord(overlap.end) && compareTime(overlap.start as { numerator: number; denominator: number }, overlap.end as { numerator: number; denominator: number }) > 0)) return false
  if (!isNullableString(reference.referenceAttemptId) || !isNullableString(reference.referencePerformedAt)
    || (reference.referencePerformedAt !== null && !isCanonicalIsoTimestamp(reference.referencePerformedAt))
    || (reference.referencePracticeSpeed !== null && (!isFiniteNumber(reference.referencePracticeSpeed) || reference.referencePracticeSpeed <= 0))
    || (reference.referenceSchemaVersion !== null && reference.referenceSchemaVersion !== 1 && reference.referenceSchemaVersion !== 2 && reference.referenceSchemaVersion !== 3 && reference.referenceSchemaVersion !== 4)) return false
  if (reference.referenceAttemptId === null && (reference.referencePerformedAt !== null || reference.referencePracticeSpeed !== null || reference.referenceSchemaVersion !== null)) return false
  return reference.diagnostics.referenceComparisonEngineVersion === 'reference-comparison-1.0.0'
    || reference.diagnostics.referenceComparisonEngineVersion === 'reference-comparison-1.1.0'
}

function assertWork(value: unknown): asserts value is PersistedWork {
  assertRecord(value, 'Work')
  const work = value as Partial<PersistedWork>
  if (typeof work.title !== 'string' || typeof work.composer !== 'string' || !isCanonicalIsoTimestamp(work.createdAt) || !isCanonicalIsoTimestamp(work.updatedAt)) {
    throw new PianoStorageError('CORRUPT_RECORD', `Stored Work ${work.id} is missing required fields.`)
  }
}

function assertArrangement(value: unknown): asserts value is PersistedArrangement {
  assertRecord(value, 'Arrangement')
  const arrangement = value as Partial<PersistedArrangement>
  if (typeof arrangement.workId !== 'string' || typeof arrangement.name !== 'string' || !Array.isArray(arrangement.includedPartIds) || !isCanonicalIsoTimestamp(arrangement.createdAt) || !isCanonicalIsoTimestamp(arrangement.updatedAt)) throw new PianoStorageError('CORRUPT_RECORD', `Stored Arrangement ${arrangement.id} is missing required fields.`)
  if (arrangement.analysisPreferences !== undefined) {
    const preferences = arrangement.analysisPreferences
    const validRegion = (region: unknown): boolean => isObjectRecord(region) && typeof region.id === 'string' && Number.isInteger(region.startMeasureIndex) && Number.isInteger(region.endMeasureIndex) && Array.isArray(region.foregroundLaneIds) && region.foregroundLaneIds.every((id) => typeof id === 'string') && Array.isArray(region.supportLaneIds) && region.supportLaneIds.every((id) => typeof id === 'string')
    const validVoicingProfiles = isObjectRecord(preferences) && isObjectRecord(preferences.voicingByScoreVersion) && Object.entries(preferences.voicingByScoreVersion).every(([scoreVersionId, profile]) => isObjectRecord(profile) && typeof profile.id === 'string' && profile.scoreVersionId === scoreVersionId && isCanonicalIsoTimestamp(profile.updatedAt) && Array.isArray(profile.regions) && profile.regions.length > 0 && profile.regions.every(validRegion))
    if (!validVoicingProfiles || !isObjectRecord(preferences.referenceByScoreVersion) || !Object.values(preferences.referenceByScoreVersion).every((id) => typeof id === 'string' && id.length > 0)) throw new PianoStorageError('CORRUPT_RECORD', `Stored Arrangement ${arrangement.id} has malformed analysis preferences.`)
  }
}

function assertScoreVersion(value: unknown): asserts value is PersistedScoreVersion {
  assertRecord(value, 'ScoreVersion')
  const version = value as Partial<PersistedScoreVersion>
  if (typeof version.arrangementId !== 'string' || !Number.isInteger(version.version) || (version.version ?? 0) < 1 || !isCanonicalIsoTimestamp(version.createdAt) || typeof version.canonicalMusicXml !== 'string' || typeof version.contentHash !== 'string' || typeof version.normalizedScoreId !== 'string' || typeof version.parserVersion !== 'string' || !Array.isArray(version.includedPartIds)) {
    throw new PianoStorageError('CORRUPT_RECORD', `Stored ScoreVersion ${version.id} is missing required fields.`)
  }
}

function assertAttempt(value: unknown): asserts value is PerformanceAttemptRecord {
  assertRecord(value, 'PerformanceAttempt')
  const attempt = value as Record<string, unknown>
  if (
    (attempt.schemaVersion !== 1 && attempt.schemaVersion !== 2 && attempt.schemaVersion !== 3 && attempt.schemaVersion !== 4)
    || typeof attempt.arrangementId !== 'string'
    || typeof attempt.scoreVersionId !== 'string'
    || typeof attempt.practiceSessionId !== 'string'
    || !isCanonicalIsoTimestamp(attempt.performedAt)
    || typeof attempt.practiceSpeedMultiplier !== 'number'
    || attempt.practiceSpeedMultiplier <= 0
    || !Array.isArray(attempt.includedPartIds)
    || !isObjectRecord(attempt.engineVersions)
    || !isObjectRecord(attempt.expectedPerformancePlan)
    || !isObjectRecord(attempt.recording)
    || !isObjectRecord(attempt.alignment)
    || !isObjectRecord(attempt.noteGrading)
    || !isObjectRecord(attempt.timingAnalysis)
    || !isObjectRecord(attempt.performanceResults)
  ) {
    throw new PianoStorageError('CORRUPT_RECORD', `Stored PerformanceAttempt ${attempt.id} is missing required snapshots.`)
  }
  const versions = attempt.engineVersions
  const plan = attempt.expectedPerformancePlan
  const recording = attempt.recording
  const alignment = attempt.alignment
  const noteGrading = attempt.noteGrading
  const timing = attempt.timingAnalysis
  const results = attempt.performanceResults
  if (
    !isObjectRecord(noteGrading.scope)
    || !Array.isArray(plan.includedPartIds)
    || !isObjectRecord(alignment.diagnostics)
    || !isObjectRecord(noteGrading.diagnostics)
    || !isObjectRecord(timing.diagnostics)
    || !isObjectRecord(results.diagnostics)
  ) {
    throw new PianoStorageError('CORRUPT_RECORD', `Stored PerformanceAttempt ${attempt.id} has malformed nested snapshots.`)
  }
  if (alignment.diagnostics.alignmentEngineVersion === '2.0.0') {
    const localization = alignment.localization
    const validHint = (hint: unknown): boolean => isObjectRecord(hint) && (
      hint.mode === 'auto' || hint.mode === 'beginning'
      || (hint.mode === 'confirmed' && isNonnegativeInteger(hint.expectedStartIndex) && isNonnegativeInteger(hint.expectedEndIndex) && hint.expectedEndIndex >= hint.expectedStartIndex)
      || (hint.mode === 'section' && typeof hint.scoreVersionId === 'string' && isNonnegativeInteger(hint.startMeasureIndex) && isNonnegativeInteger(hint.endMeasureIndex) && hint.endMeasureIndex >= hint.startMeasureIndex && isStringArray(hint.sourceMeasureIds))
    )
    const validCandidate = (candidate: unknown): boolean => isObjectRecord(candidate) && typeof candidate.id === 'string'
      && isNonnegativeInteger(candidate.expectedStartIndex) && isNonnegativeInteger(candidate.expectedEndIndex) && candidate.expectedEndIndex >= candidate.expectedStartIndex
      && isNonnegativeInteger(candidate.performedStartIndex) && isNonnegativeInteger(candidate.performedEndIndex) && candidate.performedEndIndex >= candidate.performedStartIndex
      && typeof candidate.expectedStartGroupId === 'string' && typeof candidate.expectedEndGroupId === 'string'
      && isStringArray(candidate.measureNumbers) && Array.isArray(candidate.measureIndices) && candidate.measureIndices.every(isNonnegativeInteger)
      && typeof candidate.displayRange === 'string' && (candidate.hintAgreement === 'exact' || candidate.hintAgreement === 'near' || candidate.hintAgreement === 'none')
      && isObjectRecord(candidate.evidence) && isFiniteNumber(candidate.evidence.quality) && candidate.evidence.quality >= 0 && candidate.evidence.quality <= 1
      && isFiniteNumber(candidate.evidence.normalizedPitchCost) && candidate.evidence.normalizedPitchCost >= 0
      && isNonnegativeInteger(candidate.evidence.exactPitchAnchorCount) && isNonnegativeInteger(candidate.evidence.exactPitchPairCount)
      && isFiniteNumber(candidate.evidence.exactPitchAnchorDensity) && candidate.evidence.exactPitchAnchorDensity >= 0 && candidate.evidence.exactPitchAnchorDensity <= 1 && isNonnegativeInteger(candidate.evidence.correspondenceCount)
      && isFiniteNumber(candidate.evidence.correspondenceDensity) && candidate.evidence.correspondenceDensity >= 0 && candidate.evidence.correspondenceDensity <= 1
      && isFiniteNumber(candidate.evidence.performedCoverage) && candidate.evidence.performedCoverage >= 0 && candidate.evidence.performedCoverage <= 1 && isNonnegativeInteger(candidate.evidence.longestUnsupportedGap)
    const validRegion = (region: unknown): boolean => isObjectRecord(region) && isNonnegativeInteger(region.expectedStartIndex) && isNonnegativeInteger(region.expectedEndIndex) && region.expectedEndIndex >= region.expectedStartIndex
      && isNonnegativeInteger(region.performedStartIndex) && isNonnegativeInteger(region.performedEndIndex) && region.performedEndIndex >= region.performedStartIndex
      && typeof region.expectedStartGroupId === 'string' && typeof region.expectedEndGroupId === 'string' && typeof region.performedStartGroupId === 'string' && typeof region.performedEndGroupId === 'string'
      && Array.isArray(region.measureIndices) && region.measureIndices.every(isNonnegativeInteger) && isStringArray(region.measureNumbers) && typeof region.displayRange === 'string'
      && (region.confidence === 'confident' || region.confidence === 'limited')
    if (!isObjectRecord(localization) || !Array.isArray(alignment.expectedGroups) || !Array.isArray(alignment.performedGroups)
      || !['confident', 'limited', 'ambiguous', 'divergent', 'insufficient-data'].includes(typeof localization.status === 'string' ? localization.status : '')
      || !['automatic', 'intended-start', 'user-confirmed', 'unresolved'].includes(typeof localization.resolution === 'string' ? localization.resolution : '')
      || !validHint(localization.intendedStart) || !Array.isArray(localization.candidates) || !localization.candidates.every(validCandidate)
      || !isNullableString(localization.selectedCandidateId) || (localization.bestVsSecondQualitySeparation !== null && !isFiniteNumber(localization.bestVsSecondQualitySeparation))
      || (localization.takeRegion !== null && !validRegion(localization.takeRegion)) || typeof localization.explanation !== 'string'
      || ((localization.status === 'confident' || localization.status === 'limited') !== (localization.takeRegion !== null))) {
      throw new PianoStorageError('CORRUPT_RECORD', `Stored PerformanceAttempt ${attempt.id} has malformed score-region localization provenance.`)
    }
    const resolved = localization.status === 'confident' || localization.status === 'limited'
    const selectedCandidate = typeof localization.selectedCandidateId === 'string'
      ? localization.candidates.find((candidate) => isObjectRecord(candidate) && candidate.id === localization.selectedCandidateId)
      : null
    const region = isObjectRecord(localization.takeRegion) ? localization.takeRegion : null
    const expectedGroups = Array.isArray(alignment.expectedGroups)
  ? alignment.expectedGroups
  : []

const performedGroups = Array.isArray(alignment.performedGroups)
  ? alignment.performedGroups
  : []

const expectedAt = (index: unknown) => {
  if (typeof index !== 'number' || !Number.isInteger(index) || index < 0) return null
  const group = expectedGroups[index]
  return isObjectRecord(group) ? group : null
}

const performedAt = (index: unknown) => {
  if (typeof index !== 'number' || !Number.isInteger(index) || index < 0) return null
  const group = performedGroups[index]
  return isObjectRecord(group) ? group : null
}
    if ((resolved && (!selectedCandidate || !region || localization.resolution === 'unresolved' || region.confidence !== localization.status))
      || (!resolved && (localization.selectedCandidateId !== null || localization.takeRegion !== null || localization.resolution !== 'unresolved'))
      || (region && (expectedAt(region.expectedStartIndex)?.id !== region.expectedStartGroupId || expectedAt(region.expectedEndIndex)?.id !== region.expectedEndGroupId
        || performedAt(region.performedStartIndex)?.id !== region.performedStartGroupId || performedAt(region.performedEndIndex)?.id !== region.performedEndGroupId))) {
      throw new PianoStorageError('CORRUPT_RECORD', `Stored PerformanceAttempt ${attempt.id} has inconsistent score-region localization provenance.`)
    }
  }
  if (timing.diagnostics.timingAnalysisEngineVersion === '1.1.0' && !isNonnegativeInteger(timing.diagnostics.rejectedLocalTempoWindowCount)) {
    throw new PianoStorageError('CORRUPT_RECORD', `Stored PerformanceAttempt ${attempt.id} has malformed local-tempo geometry diagnostics.`)
  }
  if (
    !isCanonicalIsoTimestamp(recording.startedAt)
    || typeof recording.durationMs !== 'number'
    || !Number.isFinite(recording.durationMs)
    || recording.durationMs < 0
    || alignment.expectedPlanId !== plan.id
    || alignment.recordingId !== recording.id
    || noteGrading.expectedPlanId !== plan.id
    || noteGrading.recordingId !== recording.id
    || noteGrading.alignmentId !== alignment.id
    || timing.expectedPlanId !== plan.id
    || timing.recordingId !== recording.id
    || timing.alignmentId !== alignment.id
    || timing.noteGradingId !== noteGrading.id
    || results.normalizedScoreId !== plan.scoreId
    || results.expectedPlanId !== plan.id
    || results.alignmentId !== alignment.id
    || results.noteGradingId !== noteGrading.id
    || results.timingAnalysisId !== timing.id
    || results.scope !== attempt.gradingScope
    || noteGrading.scope.type !== attempt.gradingScope
    || versions.alignment !== alignment.diagnostics.alignmentEngineVersion
    || versions.noteGrading !== noteGrading.diagnostics.noteGradingEngineVersion
    || versions.timingAnalysis !== timing.diagnostics.timingAnalysisEngineVersion
    || versions.resultAggregation !== results.diagnostics.resultAggregationVersion
  ) {
    throw new PianoStorageError('CORRUPT_RECORD', `Stored PerformanceAttempt ${attempt.id} has inconsistent snapshot provenance.`)
  }
  if (attempt.schemaVersion === 2 || attempt.schemaVersion === 3 || attempt.schemaVersion === 4) {
    const expression = attempt.expressionAnalysis
    const validExpressionMetric = (metric: Record<string, unknown>): boolean => {
      const score = metric.score
      const reliability = metric.reliability
      const metricCoverage = metric.coverage
      return (metric.status === 'ready' || metric.status === 'unavailable')
        && ['reliable', 'limited', 'provisional', 'unavailable'].includes(typeof reliability === 'string' ? reliability : '')
        && (score === null || (typeof score === 'number' && Number.isFinite(score) && score >= 0 && score <= 1))
        && isObjectRecord(metricCoverage)
        && Number.isInteger(metricCoverage.authoredTargetCount) && (metricCoverage.authoredTargetCount as number) >= 0
        && Number.isInteger(metricCoverage.analyzedTargetCount) && (metricCoverage.analyzedTargetCount as number) >= 0
        && (metricCoverage.ratio === null || (typeof metricCoverage.ratio === 'number' && Number.isFinite(metricCoverage.ratio) && metricCoverage.ratio >= 0 && metricCoverage.ratio <= 1))
        && Array.isArray(metric.targets) && Array.isArray(metric.observations) && Array.isArray(metric.exclusions) && Array.isArray(metric.warnings)
        && isObjectRecord(metric.diagnostics)
    }
    if (
      !isObjectRecord(expression)
      || !isObjectRecord(expression.scope)
      || !isObjectRecord(expression.dynamics)
      || !isObjectRecord(expression.articulation)
      || !isObjectRecord(expression.diagnostics)
      || !isObjectRecord(expression.dynamics.coverage)
      || !isObjectRecord(expression.dynamics.diagnostics)
      || !isObjectRecord(expression.articulation.coverage)
      || !isObjectRecord(expression.articulation.diagnostics)
      || (expression.scope.type !== 'full-plan' && expression.scope.type !== 'aligned-span')
      || !isNullableInteger(expression.scope.expectedStartIndex)
      || !isNullableInteger(expression.scope.expectedEndIndex)
      || !isNullableString(expression.scope.expectedStartGroupId)
      || !isNullableString(expression.scope.expectedEndGroupId)
      || !Array.isArray(expression.matchedObservations)
      || !Array.isArray(expression.dynamics.targets)
      || !Array.isArray(expression.dynamics.observations)
      || !Array.isArray(expression.articulation.targets)
      || !Array.isArray(expression.articulation.observations)
      || (expression.status !== 'ready' && expression.status !== 'unavailable')
      || !validExpressionMetric(expression.dynamics)
      || !validExpressionMetric(expression.articulation)
      || typeof expression.diagnostics.expressionAnalysisEngineVersion !== 'string'
      || typeof expression.diagnostics.musicXmlParserVersion !== 'string'
      || typeof expression.diagnostics.alignmentEngineVersion !== 'string'
      || typeof expression.diagnostics.noteGradingEngineVersion !== 'string'
      || !expression.matchedObservations.every(isObjectRecord)
      || expression.scoreId !== plan.scoreId
      || expression.expectedPlanId !== plan.id
      || expression.recordingId !== recording.id
      || expression.alignmentId !== alignment.id
      || expression.noteGradingId !== noteGrading.id
      || expression.scope.type !== noteGrading.scope.type
      || expression.scope.expectedStartIndex !== noteGrading.scope.expectedStartIndex
      || expression.scope.expectedEndIndex !== noteGrading.scope.expectedEndIndex
      || expression.scope.expectedStartGroupId !== noteGrading.scope.expectedStartGroupId
      || expression.scope.expectedEndGroupId !== noteGrading.scope.expectedEndGroupId
      || typeof versions.expressionAnalysis !== 'string'
      || versions.expressionAnalysis !== expression.diagnostics.expressionAnalysisEngineVersion
    ) {
      throw new PianoStorageError('CORRUPT_RECORD', `Stored PerformanceAttempt ${attempt.id} has malformed or inconsistent expression provenance.`)
    }
  }
  if (attempt.schemaVersion === 3 || attempt.schemaVersion === 4) {
    const pedalValue = attempt.pedalAnalysis
    const expression = attempt.expressionAnalysis
    if (!isObjectRecord(pedalValue) || !isObjectRecord(expression) || !isObjectRecord(expression.diagnostics)) {
      throw new PianoStorageError('CORRUPT_RECORD', `Stored PerformanceAttempt ${attempt.id} has malformed or inconsistent pedal provenance.`)
    }
    const pedal = pedalValue
    const validScore = pedal.score === null || (typeof pedal.score === 'number' && Number.isFinite(pedal.score) && pedal.score >= 0 && pedal.score <= 1)
    const initialSustain = recording.initialSustain
    const validInitialSustain = isObjectRecord(initialSustain)
      && typeof initialSustain.observed === 'boolean'
      && (initialSustain.down === null || typeof initialSustain.down === 'boolean')
      && (initialSustain.value === null || (Number.isInteger(initialSustain.value) && (initialSustain.value as number) >= 0 && (initialSustain.value as number) <= 127))
      && (initialSustain.observed ? typeof initialSustain.down === 'boolean' && typeof initialSustain.value === 'number' : initialSustain.down === null && initialSustain.value === null)
    const validController = (controller: Record<string, unknown>): boolean =>
      ['unknown', 'binary-like', 'continuous-evidence'].includes(typeof controller.mode === 'string' ? controller.mode : '')
      && typeof controller.initialStateKnown === 'boolean'
      && (controller.initialDown === null || typeof controller.initialDown === 'boolean')
      && (controller.initialValue === null || Number.isInteger(controller.initialValue))
      && isNonnegativeInteger(controller.rawSampleCount) && isNonnegativeInteger(controller.downTransitionCount) && isNonnegativeInteger(controller.upTransitionCount)
      && isNonnegativeInteger(controller.distinctValueCount) && isNonnegativeInteger(controller.intermediateValueCount)
      && isFiniteNumber(controller.knownStateDurationMs) && controller.knownStateDurationMs >= 0
      && isUnitNumberOrNull(controller.knownStateCoverage) && isNonnegativeInteger(controller.extraUnassignedTransitionCount)
    const pedalEngineVersion = isObjectRecord(pedal.diagnostics) && typeof pedal.diagnostics.pedalAnalysisEngineVersion === 'string'
      ? pedal.diagnostics.pedalAnalysisEngineVersion
      : null
    const requiresV11Shape = pedalEngineVersion !== null && pedalEngineVersion !== 'pedal-analysis-1.0.0'
    const validTimingAnchor = (anchor: unknown): boolean => isObjectRecord(anchor)
      && (anchor.source === 'local-performed' || anchor.source === 'global-score-clock')
      && isMusicalTimeRecord(anchor.scorePosition)
      && isFiniteNumber(anchor.globalPredictedMs) && isFiniteNumber(anchor.anchoredPerformedMs) && isFiniteNumber(anchor.anchorOffsetFromGlobalMs)
      && isNullableString(anchor.beforeExpectedGroupId) && isNullableString(anchor.afterExpectedGroupId)
      && Array.isArray(anchor.matchedPerformedGroupIds) && anchor.matchedPerformedGroupIds.every((id) => typeof id === 'string')
      && isFiniteNumber(anchor.confidence) && anchor.confidence >= 0 && anchor.confidence <= 1
    const validModernController = (controller: Record<string, unknown>): boolean => !requiresV11Shape || (
      (controller.channelMode === 'none' || controller.channelMode === 'single-channel' || controller.channelMode === 'multi-channel-ambiguous')
      && Array.isArray(controller.channels) && controller.channels.every((channel) => Number.isInteger(channel) && (channel as number) >= 0 && (channel as number) <= 15)
      && (controller.authoritativeChannel === null || (Number.isInteger(controller.authoritativeChannel) && (controller.authoritativeChannel as number) >= 0 && (controller.authoritativeChannel as number) <= 15))
    )
    const validModernCoverage = (coverage: Record<string, unknown>): boolean => !requiresV11Shape || (
      isNonnegativeInteger(coverage.fullyAnalyzedPhraseCount)
      && isNonnegativeInteger(coverage.partiallyAnalyzedPhraseCount)
      && isNonnegativeInteger(coverage.unanalyzedPhraseCount)
      && isNonnegativeInteger(coverage.authoredEventCount)
      && isNonnegativeInteger(coverage.analyzedEventCount)
      && isNonnegativeInteger(coverage.truncatedEventCount)
      && isNonnegativeInteger(coverage.unavailableEventCount)
      && isUnitNumberOrNull(coverage.eventCoverageRatio)
      && coverage.analyzedPhraseCount === coverage.fullyAnalyzedPhraseCount
      && (coverage.fullyAnalyzedPhraseCount as number) + (coverage.partiallyAnalyzedPhraseCount as number) + (coverage.unanalyzedPhraseCount as number) === coverage.authoredPhraseCount
      && (coverage.analyzedEventCount as number) + (coverage.truncatedEventCount as number) + (coverage.unavailableEventCount as number) === coverage.authoredEventCount
    )
    if (
      !isObjectRecord(pedal.scope)
      || !isObjectRecord(pedal.coverage)
      || !isObjectRecord(pedal.controllerEvidence)
      || !isObjectRecord(pedal.timeline)
      || !isObjectRecord(pedal.diagnostics)
      || !Array.isArray(pedal.targets)
      || !Array.isArray(pedal.observations)
      || !Array.isArray(pedal.phraseResults)
      || !Array.isArray(pedal.damperHolds)
      || !Array.isArray(pedal.interactions)
      || !Array.isArray(pedal.exclusions)
      || !Array.isArray(pedal.warnings)
      || !Array.isArray(pedal.timeline.rawSamples)
      || !Array.isArray(pedal.timeline.transitions)
      || !isObjectRecord(pedal.timeline.controllerEvidence)
      || !validInitialSustain
      || (pedal.status !== 'ready' && pedal.status !== 'unavailable')
      || !['reliable', 'limited', 'provisional', 'unavailable'].includes(typeof pedal.reliability === 'string' ? pedal.reliability : '')
      || !validScore
      || (pedal.scope.type !== 'full-plan' && pedal.scope.type !== 'aligned-span')
      || !isNullableInteger(pedal.scope.expectedStartIndex)
      || !isNullableInteger(pedal.scope.expectedEndIndex)
      || !isNullableString(pedal.scope.expectedStartGroupId)
      || !isNullableString(pedal.scope.expectedEndGroupId)
      || !isNonnegativeInteger(pedal.coverage.authoredPhraseCount)
      || !isNonnegativeInteger(pedal.coverage.analyzedPhraseCount)
      || !isUnitNumberOrNull(pedal.coverage.ratio)
      || !validController(pedal.controllerEvidence)
      || !validController(pedal.timeline.controllerEvidence)
      || !validModernController(pedal.controllerEvidence)
      || !validModernController(pedal.timeline.controllerEvidence)
      || !validModernCoverage(pedal.coverage)
      || pedal.controllerEvidence.mode !== pedal.timeline.controllerEvidence.mode
      || !pedal.timeline.rawSamples.every((sample) => isObjectRecord(sample) && typeof sample.id === 'string' && isNonnegativeInteger(sample.sequence) && isFiniteNumber(sample.relativeMs) && sample.relativeMs >= 0 && Number.isInteger(sample.channel) && Number.isInteger(sample.value) && (sample.value as number) >= 0 && (sample.value as number) <= 127 && typeof sample.down === 'boolean')
      || !pedal.timeline.transitions.every((transition) => isObjectRecord(transition) && typeof transition.id === 'string' && (transition.kind === 'down' || transition.kind === 'up') && isFiniteNumber(transition.relativeMs) && transition.relativeMs >= 0 && isNonnegativeInteger(transition.sequence) && Number.isInteger(transition.value) && typeof transition.sourceSampleId === 'string' && (!requiresV11Shape || (Number.isInteger(transition.channel) && (transition.channel as number) >= 0 && (transition.channel as number) <= 15)))
      || (requiresV11Shape && (pedal.controllerEvidence.channelMode !== pedal.timeline.controllerEvidence.channelMode || pedal.controllerEvidence.authoritativeChannel !== pedal.timeline.controllerEvidence.authoritativeChannel || JSON.stringify(pedal.controllerEvidence.channels) !== JSON.stringify(pedal.timeline.controllerEvidence.channels)))
      || !pedal.targets.every((target) => isObjectRecord(target) && typeof target.id === 'string' && Array.isArray(target.sourceEventIds) && typeof target.partId === 'string' && isMusicalTimeRecord(target.startPosition) && isMusicalTimeRecord(target.endPosition) && Array.isArray(target.events) && target.events.every((event) => isObjectRecord(event) && typeof event.id === 'string' && ['start', 'change', 'stop'].includes(typeof event.kind === 'string' ? event.kind : '') && isMusicalTimeRecord(event.position) && isFiniteNumber(event.expectedPerformedMs) && (!requiresV11Shape || (validTimingAnchor(event.timingAnchor) && (event.timingAnchor as Record<string, unknown>).anchoredPerformedMs === event.expectedPerformedMs))))
      || !pedal.observations.every((observation) => isObjectRecord(observation) && typeof observation.id === 'string' && typeof observation.phraseTargetId === 'string' && ['start', 'change', 'stop'].includes(typeof observation.kind === 'string' ? observation.kind : '') && isFiniteNumber(observation.score) && observation.score >= 0 && observation.score <= 1 && Array.isArray(observation.transitionIds) && ['transition', 'predepressed', 'missing'].includes(typeof observation.evidence === 'string' ? observation.evidence : '') && (!requiresV11Shape || ((observation.timingAnchorSource === 'local-performed' || observation.timingAnchorSource === 'global-score-clock') && isFiniteNumber(observation.globalExpectedMs) && isFiniteNumber(observation.anchoredExpectedMs) && observation.anchoredExpectedMs === observation.expectedPerformedMs && isFiniteNumber(observation.anchorOffsetFromGlobalMs) && isNullableString(observation.beforeExpectedGroupId) && isNullableString(observation.afterExpectedGroupId) && Array.isArray(observation.anchorPerformedGroupIds))))
      || !pedal.phraseResults.every((phrase) => isObjectRecord(phrase) && typeof phrase.id === 'string' && typeof phrase.targetId === 'string' && ((requiresV11Shape && phrase.score === null) || (isFiniteNumber(phrase.score) && phrase.score >= 0 && phrase.score <= 1)) && Array.isArray(phrase.observationIds) && (!requiresV11Shape || (isNonnegativeInteger(phrase.authoredEventCount) && isNonnegativeInteger(phrase.analyzedEventCount) && isNonnegativeInteger(phrase.truncatedEventCount) && isNonnegativeInteger(phrase.unavailableEventCount) && isFiniteNumber(phrase.coverageRatio) && phrase.coverageRatio >= 0 && phrase.coverageRatio <= 1 && (phrase.completeness === 'complete' || phrase.completeness === 'partial' || phrase.completeness === 'unanalyzed'))))
      || !pedal.damperHolds.every((hold) => isObjectRecord(hold) && typeof hold.id === 'string' && isFiniteNumber(hold.physicalReleaseMs) && isUnitNumberOrNull(hold.pedalDownAtPhysicalRelease === null ? null : hold.pedalDownAtPhysicalRelease ? 1 : 0) && typeof hold.openAtRecordingEnd === 'boolean')
      || !pedal.interactions.every((interaction) => isObjectRecord(interaction) && (interaction.kind === 'pedal-connects-detached-keys' || interaction.kind === 'pedal-bridges-key-gap') && Array.isArray(interaction.matchedObservationIds))
      || !pedal.exclusions.every(isObjectRecord)
      || !pedal.warnings.every(isObjectRecord)
      || typeof pedal.diagnostics.pedalAnalysisEngineVersion !== 'string'
      || typeof pedal.diagnostics.musicXmlParserVersion !== 'string'
      || typeof pedal.diagnostics.expressionAnalysisEngineVersion !== 'string'
      || (requiresV11Shape && (!isNonnegativeInteger(pedal.diagnostics.localTimingAnchorCount) || !isNonnegativeInteger(pedal.diagnostics.globalTimingFallbackCount) || !isUnitNumberOrNull(pedal.diagnostics.meanTimingAnchorConfidence)))
      || pedal.scoreId !== plan.scoreId
      || pedal.expectedPlanId !== plan.id
      || pedal.recordingId !== recording.id
      || pedal.alignmentId !== alignment.id
      || pedal.noteGradingId !== noteGrading.id
      || pedal.expressionAnalysisId !== expression.id
      || pedal.scope.type !== noteGrading.scope.type
      || pedal.scope.expectedStartIndex !== noteGrading.scope.expectedStartIndex
      || pedal.scope.expectedEndIndex !== noteGrading.scope.expectedEndIndex
      || pedal.scope.expectedStartGroupId !== noteGrading.scope.expectedStartGroupId
      || pedal.scope.expectedEndGroupId !== noteGrading.scope.expectedEndGroupId
      || typeof versions.pedalAnalysis !== 'string'
      || versions.pedalAnalysis !== pedal.diagnostics.pedalAnalysisEngineVersion
      || pedal.diagnostics.expressionAnalysisEngineVersion !== expression.diagnostics.expressionAnalysisEngineVersion
    ) {
      throw new PianoStorageError('CORRUPT_RECORD', `Stored PerformanceAttempt ${attempt.id} has malformed or inconsistent pedal provenance.`)
    }
  }
  if (attempt.schemaVersion === 4) {
    const voicing = attempt.voicingAnalysis
    const reference = attempt.referenceComparison
    const expression = attempt.expressionAnalysis
    if (
      !isObjectRecord(expression) || !isObjectRecord(voicing) || !isObjectRecord(voicing.scope) || !isObjectRecord(voicing.diagnostics) || !validVoicingSnapshot(voicing)
      || typeof voicing.id !== 'string' || typeof voicing.scoreId !== 'string' || typeof voicing.scoreVersionId !== 'string'
      || typeof voicing.expectedPlanId !== 'string' || typeof voicing.recordingId !== 'string' || typeof voicing.alignmentId !== 'string'
      || typeof voicing.noteGradingId !== 'string' || typeof voicing.expressionAnalysisId !== 'string'
      || voicing.scoreId !== plan.scoreId || voicing.scoreVersionId !== attempt.scoreVersionId || voicing.expectedPlanId !== plan.id || voicing.recordingId !== recording.id || voicing.alignmentId !== alignment.id || voicing.noteGradingId !== noteGrading.id || voicing.expressionAnalysisId !== expression.id
      || voicing.scope.type !== noteGrading.scope.type || voicing.scope.expectedStartIndex !== noteGrading.scope.expectedStartIndex || voicing.scope.expectedEndIndex !== noteGrading.scope.expectedEndIndex || voicing.scope.expectedStartGroupId !== noteGrading.scope.expectedStartGroupId || voicing.scope.expectedEndGroupId !== noteGrading.scope.expectedEndGroupId
      || typeof voicing.diagnostics.voicingAnalysisEngineVersion !== 'string' || versions.voicingAnalysis !== voicing.diagnostics.voicingAnalysisEngineVersion
      || !isObjectRecord(reference) || !isObjectRecord(reference.diagnostics) || !validReferenceSnapshot(reference)
      || typeof reference.id !== 'string' || typeof reference.scoreVersionId !== 'string' || typeof reference.currentAttemptOrRecordingId !== 'string'
      || typeof reference.currentVoicingAnalysisId !== 'string'
      || reference.scoreVersionId !== attempt.scoreVersionId || (reference.currentAttemptOrRecordingId !== attempt.id && reference.currentAttemptOrRecordingId !== recording.id) || reference.currentVoicingAnalysisId !== voicing.id
      || typeof reference.diagnostics.referenceComparisonEngineVersion !== 'string' || versions.referenceComparison !== reference.diagnostics.referenceComparisonEngineVersion
      || (reference.referenceAttemptId !== null && typeof reference.referenceAttemptId !== 'string') || (reference.referencePerformedAt !== null && !isCanonicalIsoTimestamp(reference.referencePerformedAt))
    ) throw new PianoStorageError('CORRUPT_RECORD', `Stored PerformanceAttempt ${attempt.id} has malformed or inconsistent Phase 11 provenance.`)
  }
}

function assertAttemptSummary(value: unknown): asserts value is AttemptSummary {
  assertRecord(value, 'AttemptSummary')
  const summary = value as Partial<AttemptSummary>
  const metricIsValid = (metric: unknown) => metric === null || (typeof metric === 'number' && Number.isFinite(metric))
  if (typeof summary.arrangementId !== 'string' || typeof summary.scoreVersionId !== 'string' || typeof summary.practiceSessionId !== 'string' || !isCanonicalIsoTimestamp(summary.performedAt) || typeof summary.durationMs !== 'number' || summary.durationMs < 0 || typeof summary.practiceSpeedMultiplier !== 'number' || summary.practiceSpeedMultiplier <= 0 || (summary.gradingScope !== 'full-plan' && summary.gradingScope !== 'aligned-span') || !['reliable', 'limited', 'provisional', 'unavailable'].includes(summary.reliability ?? '') || !metricIsValid(summary.notes) || !metricIsValid(summary.rhythm) || !metricIsValid(summary.tempo)) {
    throw new PianoStorageError('CORRUPT_RECORD', `Stored AttemptSummary ${summary.id} is invalid.`)
  }
}

function assertPracticeSession(value: unknown): asserts value is PracticeSessionRecord {
  assertRecord(value, 'PracticeSession')
  const session = value as Partial<PracticeSessionRecord>
  const startedAt = isCanonicalIsoTimestamp(session.startedAt) ? new Date(session.startedAt).getTime() : Number.NaN
  const endedAt = isCanonicalIsoTimestamp(session.endedAt) ? new Date(session.endedAt).getTime() : Number.NaN
  if (typeof session.arrangementId !== 'string' || typeof session.scoreVersionId !== 'string' || !Number.isFinite(startedAt) || !Number.isFinite(endedAt) || endedAt < startedAt || typeof session.durationMs !== 'number' || !Number.isFinite(session.durationMs) || session.durationMs < 0 || !Array.isArray(session.attemptIds) || !session.attemptIds.every((id) => typeof id === 'string')) {
    throw new PianoStorageError('CORRUPT_RECORD', `Stored PracticeSession ${session.id} is invalid.`)
  }
}

function assertRepertoireEntry(value: unknown): asserts value is RepertoireEntry {
  assertRecord(value, 'RepertoireEntry')
  const entry = value as Partial<RepertoireEntry>
  if (typeof entry.arrangementId !== 'string' || !isRepertoireStatus(entry.status) || !isCanonicalIsoTimestamp(entry.addedAt) || !isCanonicalIsoTimestamp(entry.updatedAt)) {
    throw new PianoStorageError('CORRUPT_RECORD', `Stored Repertoire entry ${entry.id} is invalid.`)
  }
}

interface SnapshotValidationResult {
  readonly report: IntegrityReport
  readonly hasSummaryIssue: boolean
}

function buildSummaryRepairCandidate(snapshot: PersistenceSnapshot): PersistenceSnapshot | null {
  try {
    const performanceAttempts: PerformanceAttemptRecord[] = []
    const techniqueAttempts: TechniqueAttemptRecord[] = []
    for (const value of snapshot.performanceAttempts as readonly unknown[]) {
      assertAttempt(value)
      performanceAttempts.push(value)
    }
    for (const value of snapshot.techniqueAttempts as readonly unknown[]) {
      assertTechniqueAttempt(value)
      techniqueAttempts.push(value)
    }
    return {
      ...snapshot,
      performanceAttempts,
      attemptSummaries: performanceAttempts.map(createAttemptSummary),
      techniqueAttempts,
      techniqueAttemptSummaries: techniqueAttempts.map(createTechniqueAttemptSummary),
    }
  } catch {
    return null
  }
}

async function validatePersistenceSnapshotCore(snapshot: PersistenceSnapshot, checkedAt: string): Promise<SnapshotValidationResult> {
  const retainedIssues: IntegrityIssue[] = []
  let totalIssueCount = 0
  let hasSummaryIssue = false
  const issue = (value: IntegrityIssue) => {
    totalIssueCount += 1
    if (value.recordFamily === 'attemptSummaries' || value.recordFamily === 'techniqueAttemptSummaries') hasSummaryIssue = true
    if (retainedIssues.length < 100) retainedIssues.push(Object.freeze(value))
  }
  const recordIssue = (recordFamily: keyof PersistenceSnapshot, recordId: string | undefined, code: string, detail: string) => issue({ code, severity: 'error', recordFamily, ...(recordId ? { recordId } : {}), detail })
  const finishReport = (): IntegrityReport => {
    const warnings: IntegrityIssue[] = []
    return Object.freeze({ status: totalIssueCount === 0 ? 'healthy' : 'issues-found', checkedAt, counts: Object.freeze(snapshotCounts(snapshot)), issues: Object.freeze(retainedIssues), warnings: Object.freeze(warnings), totalIssueCount, summaryOnlyRepairable: false })
  }
  const validateFamily = <T>(family: keyof PersistenceSnapshot, values: readonly unknown[], validate: (value: unknown) => void): T[] => {
    const ids = new Set<string>()
    const valid: T[] = []
    for (const value of values) {
      const recordId = value !== null && typeof value === 'object' && !Array.isArray(value) && typeof (value as { readonly id?: unknown }).id === 'string'
        ? (value as { readonly id: string }).id
        : undefined
      if (recordId && ids.has(recordId)) recordIssue(family, recordId, 'DUPLICATE_RECORD_ID', `More than one ${family} record uses this ID.`)
      if (recordId) ids.add(recordId)
      try {
        validate(value)
        valid.push(value as T)
      } catch (cause) {
        recordIssue(family, recordId, 'MALFORMED_RECORD', cause instanceof Error ? cause.message : `The ${family} record is malformed.`)
      }
    }
    return valid
  }
  const workRecords = validateFamily<PersistedWork>('works', snapshot.works, assertWork)
  const arrangementRecords = validateFamily<PersistedArrangement>('arrangements', snapshot.arrangements, assertArrangement)
  const versionRecords = validateFamily<PersistedScoreVersion>('scoreVersions', snapshot.scoreVersions, assertScoreVersion)
  const repertoireRecords = validateFamily<RepertoireEntry>('repertoireEntries', snapshot.repertoireEntries, assertRepertoireEntry)
  const sessionRecords = validateFamily<PracticeSessionRecord>('practiceSessions', snapshot.practiceSessions, assertPracticeSession)
  const attemptRecords = validateFamily<PerformanceAttemptRecord>('performanceAttempts', snapshot.performanceAttempts, assertAttempt)
  const attemptSummaryRecords = validateFamily<AttemptSummary>('attemptSummaries', snapshot.attemptSummaries, assertAttemptSummary)
  const techniqueAttemptRecords = validateFamily<TechniqueAttemptRecord>('techniqueAttempts', snapshot.techniqueAttempts, assertTechniqueAttempt)
  const techniqueSummaryRecords = validateFamily<TechniqueAttemptSummary>('techniqueAttemptSummaries', snapshot.techniqueAttemptSummaries, assertTechniqueSummary)

  const works = new Map(workRecords.map((value) => [value.id, value]))
  const arrangements = new Map(arrangementRecords.map((value) => [value.id, value]))
  const versions = new Map(versionRecords.map((value) => [value.id, value]))
  const sessions = new Map(sessionRecords.map((value) => [value.id, value]))
  const attempts = new Map(attemptRecords.map((value) => [value.id, value]))
  const attemptSummaries = new Map(attemptSummaryRecords.map((value) => [value.id, value]))
  const techniqueAttempts = new Map(techniqueAttemptRecords.map((value) => [value.id, value]))
  const techniqueSummaries = new Map(techniqueSummaryRecords.map((value) => [value.id, value]))

  for (const arrangement of arrangementRecords) {
    if (!works.has(arrangement.workId)) recordIssue('arrangements', arrangement.id, 'MISSING_WORK', 'The Arrangement references a missing Work.')
  }
  const versionsByArrangement = new Map<string, PersistedScoreVersion[]>()
  for (const version of versionRecords) {
    if (!arrangements.has(version.arrangementId)) recordIssue('scoreVersions', version.id, 'MISSING_ARRANGEMENT', 'The ScoreVersion references a missing Arrangement.')
    const siblings = versionsByArrangement.get(version.arrangementId) ?? []
    siblings.push(version); versionsByArrangement.set(version.arrangementId, siblings)
    try {
      if (await sha256Hex(version.canonicalMusicXml) !== version.contentHash) recordIssue('scoreVersions', version.id, 'SCORE_HASH_MISMATCH', 'The canonical MusicXML does not match its stored SHA-256 content hash.')
      const normalized = parseMusicXml(version.canonicalMusicXml)
      if (normalized.id !== version.normalizedScoreId) recordIssue('scoreVersions', version.id, 'NORMALIZED_SCORE_MISMATCH', 'Parsed MusicXML does not reproduce the stored NormalizedScore identity.')
      const availableParts = new Set(normalized.parts.map((part) => part.id))
      const canonicalParts = canonicalizePartSelection(version.includedPartIds)
      if (canonicalParts.length === 0 || !exactPartOrder(canonicalParts, version.includedPartIds) || canonicalParts.some((partId) => !availableParts.has(partId))) recordIssue('scoreVersions', version.id, 'INVALID_PART_SELECTION', 'The ScoreVersion part selection is not a canonical exact subset of its parsed score.')
    } catch (cause) {
      recordIssue('scoreVersions', version.id, 'INVALID_SCORE_CONTENT', cause instanceof Error ? cause.message : 'The canonical MusicXML could not be parsed.')
    }
  }
  for (const [arrangementId, values] of versionsByArrangement) {
    const identities = new Set<number>()
    for (const value of values) {
      if (identities.has(value.version)) recordIssue('scoreVersions', value.id, 'DUPLICATE_SCORE_VERSION', `Arrangement ${arrangementId} contains duplicate ScoreVersion number ${value.version}.`)
      identities.add(value.version)
    }
    const latest = [...values].sort((left, right) => right.version - left.version || left.id.localeCompare(right.id))[0]
    const arrangement = arrangements.get(arrangementId)
    if (latest && arrangement && !samePartSelection(latest.includedPartIds, arrangement.includedPartIds)) recordIssue('arrangements', arrangement.id, 'LATEST_PART_SELECTION_MISMATCH', 'The Arrangement part metadata does not match its latest ScoreVersion.')
  }
  const repertoireMemberships = new Map<string, string>()
  for (const entry of repertoireRecords) {
    if (!arrangements.has(entry.arrangementId)) recordIssue('repertoireEntries', entry.id, 'MISSING_ARRANGEMENT', 'The Repertoire entry references a missing Arrangement.')
    const existingEntryId = repertoireMemberships.get(entry.arrangementId)
    if (existingEntryId) recordIssue('repertoireEntries', entry.id, 'DUPLICATE_REPERTOIRE_MEMBERSHIP', `Arrangement ${entry.arrangementId} has more than one Repertoire membership (${existingEntryId} and ${entry.id}).`)
    else repertoireMemberships.set(entry.arrangementId, entry.id)
  }
  const sessionOwnership = new Map<string, string>()
  for (const session of sessionRecords) {
    const version = versions.get(session.scoreVersionId)
    if (!arrangements.has(session.arrangementId) || !version || version.arrangementId !== session.arrangementId) recordIssue('practiceSessions', session.id, 'SESSION_IDENTITY_MISMATCH', 'The PracticeSession does not reference one exact Arrangement and ScoreVersion.')
    const sessionAttemptIds = new Set<string>()
    for (const attemptId of session.attemptIds) {
      if (sessionAttemptIds.has(attemptId)) recordIssue('practiceSessions', session.id, 'DUPLICATE_SESSION_ATTEMPT', `Attempt ${attemptId} is listed more than once in this PracticeSession.`)
      sessionAttemptIds.add(attemptId)
      const previousOwner = sessionOwnership.get(attemptId)
      if (previousOwner && previousOwner !== session.id) recordIssue('practiceSessions', session.id, 'ATTEMPT_IN_MULTIPLE_SESSIONS', `Attempt ${attemptId} is listed by more than one PracticeSession.`)
      sessionOwnership.set(attemptId, session.id)
      const attempt = attempts.get(attemptId)
      if (!attempt) recordIssue('practiceSessions', session.id, 'MISSING_SESSION_ATTEMPT', `Listed attempt ${attemptId} does not exist.`)
      else if (attempt.practiceSessionId !== session.id) recordIssue('practiceSessions', session.id, 'SESSION_ATTEMPT_BACKLINK_MISMATCH', `Attempt ${attemptId} points to another PracticeSession.`)
    }
  }
  for (const attempt of attemptRecords) {
    const arrangement = arrangements.get(attempt.arrangementId)
    const version = versions.get(attempt.scoreVersionId)
    const session = sessions.get(attempt.practiceSessionId)
    if (!arrangement || !version || !session || version.arrangementId !== attempt.arrangementId || session.arrangementId !== attempt.arrangementId || session.scoreVersionId !== attempt.scoreVersionId) recordIssue('performanceAttempts', attempt.id, 'ATTEMPT_IDENTITY_MISMATCH', 'The attempt does not resolve to one exact Arrangement, ScoreVersion, and PracticeSession.')
    if (session && !session.attemptIds.includes(attempt.id)) recordIssue('performanceAttempts', attempt.id, 'SESSION_MISSING_ATTEMPT_BACKLINK', 'The owning PracticeSession does not list this attempt.')
    if (version && (attempt.expectedPerformancePlan.scoreId !== version.normalizedScoreId || !samePartSelection(version.includedPartIds, attempt.includedPartIds) || !samePartSelection(version.includedPartIds, attempt.expectedPerformancePlan.includedPartIds))) recordIssue('performanceAttempts', attempt.id, 'ATTEMPT_SCORE_PROVENANCE_MISMATCH', 'The attempt plan or part identity differs from its exact ScoreVersion.')
    if (attempt.schemaVersion === 4 && attempt.referenceComparison.referenceAttemptId) {
      const reference = attempts.get(attempt.referenceComparison.referenceAttemptId)
      if (!reference || reference.arrangementId !== attempt.arrangementId || reference.scoreVersionId !== attempt.scoreVersionId || !samePartSelection(reference.includedPartIds, attempt.includedPartIds)) recordIssue('performanceAttempts', attempt.id, 'INVALID_REFERENCE_ATTEMPT', 'The frozen reference comparison points to an incompatible or missing attempt.')
    }
    const summary = attemptSummaries.get(attempt.id)
    if (!summary) recordIssue('attemptSummaries', attempt.id, 'ATTEMPT_SUMMARY_MISSING', 'The authoritative PerformanceAttempt has no derived summary.')
    else if (!semanticEqual(summary, createAttemptSummary(attempt))) recordIssue('attemptSummaries', attempt.id, 'ATTEMPT_SUMMARY_MISMATCH', 'The derived summary does not exactly match its authoritative PerformanceAttempt.')
  }
  for (const summary of attemptSummaryRecords) if (!attempts.has(summary.id)) recordIssue('attemptSummaries', summary.id, 'ATTEMPT_SUMMARY_ORPHAN', 'The summary has no authoritative PerformanceAttempt.')
  for (const attempt of techniqueAttemptRecords) {
    const summary = techniqueSummaries.get(attempt.id)
    if (!summary) recordIssue('techniqueAttemptSummaries', attempt.id, 'TECHNIQUE_SUMMARY_MISSING', 'The authoritative TechniqueAttempt has no derived summary.')
    else if (!semanticEqual(summary, createTechniqueAttemptSummary(attempt))) recordIssue('techniqueAttemptSummaries', attempt.id, 'TECHNIQUE_SUMMARY_MISMATCH', 'The derived summary does not exactly match its authoritative TechniqueAttempt.')
  }
  for (const summary of techniqueSummaryRecords) if (!techniqueAttempts.has(summary.id)) recordIssue('techniqueAttemptSummaries', summary.id, 'TECHNIQUE_SUMMARY_ORPHAN', 'The summary has no authoritative TechniqueAttempt.')
  for (const arrangement of arrangementRecords) {
    const preferences = arrangement.analysisPreferences
    if (!preferences) continue
    for (const [scoreVersionId, profile] of Object.entries(preferences.voicingByScoreVersion)) {
      const version = versions.get(scoreVersionId)
      if (!version || version.arrangementId !== arrangement.id || profile.scoreVersionId !== scoreVersionId) recordIssue('arrangements', arrangement.id, 'INVALID_VOICING_SCORE_VERSION', `Voicing preference ${profile.id} does not belong to this Arrangement and exact ScoreVersion.`)
    }
    for (const [scoreVersionId, attemptId] of Object.entries(preferences.referenceByScoreVersion)) {
      const version = versions.get(scoreVersionId); const attempt = attempts.get(attemptId)
      if (!version || version.arrangementId !== arrangement.id || !attempt || attempt.arrangementId !== arrangement.id || attempt.scoreVersionId !== scoreVersionId) recordIssue('arrangements', arrangement.id, 'INVALID_REFERENCE_PREFERENCE', `Reference preference ${attemptId} is missing or incompatible with ScoreVersion ${scoreVersionId}.`)
    }
  }
  return { report: finishReport(), hasSummaryIssue }
}

export async function validatePersistenceSnapshot(snapshot: PersistenceSnapshot, checkedAt: string): Promise<IntegrityReport> {
  const current = await validatePersistenceSnapshotCore(snapshot, checkedAt)
  if (current.report.status === 'healthy' || !current.hasSummaryIssue) return current.report
  const candidate = buildSummaryRepairCandidate(snapshot)
  if (!candidate) return current.report
  const candidateResult = await validatePersistenceSnapshotCore(candidate, checkedAt)
  return Object.freeze({ ...current.report, summaryOnlyRepairable: candidateResult.report.status === 'healthy' })
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
  private readonly openDatabaseRequest: (name: string, version: number) => IDBOpenDBRequest
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
    this.openDatabaseRequest = options.openDatabaseRequest ?? ((name, version) => this.indexedDb.open(name, version))
  }

  async initialize(): Promise<void> {
    await this.openDatabase()
  }

  close(): void {
    const connection = this.databasePromise
    this.databasePromise = null
    void connection?.then((database) => database.close()).catch(() => { /* a failed open is already cleared */ })
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
    const opening = new Promise<IDBDatabase>((resolve, reject) => {
      let request: IDBOpenDBRequest
      let settled = false
      const fail = (error: PianoStorageError) => {
        if (settled) return
        settled = true
        reject(error)
      }
      try {
        request = this.openDatabaseRequest(this.databaseName, PERSISTENCE_SCHEMA_VERSION)
      } catch (cause) {
        fail(new PianoStorageError('DATABASE_OPEN_FAILED', 'The local piano database could not be opened.', cause))
        return
      }
      request.onupgradeneeded = (event) => this.migrate(request.result, request.transaction, event.oldVersion)
      request.onsuccess = () => {
        const database = request.result
        if (settled) {
          database.close()
          return
        }
        settled = true
        database.onversionchange = () => {
          if (this.databasePromise === opening) this.databasePromise = null
          database.close()
        }
        database.addEventListener('close', () => {
          if (this.databasePromise === opening) this.databasePromise = null
        })
        resolve(database)
      }
      request.onerror = () => fail(new PianoStorageError('DATABASE_OPEN_FAILED', 'The local piano database could not be opened.', request.error))
      request.onblocked = () => fail(new PianoStorageError('DATABASE_OPEN_FAILED', 'Close other Clef tabs so the local database can be upgraded.'))
    })
    this.databasePromise = opening
    void opening.catch(() => {
      if (this.databasePromise === opening) this.databasePromise = null
    })
    return opening
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
    if (oldVersion < 3) {
      const sessions = transaction.objectStore(STORE.sessions)
      if (!sessions.indexNames.contains('endedAt')) sessions.createIndex('endedAt', 'endedAt')
    }
    if (oldVersion < 4) {
      const attempts = database.createObjectStore(STORE.techniqueAttempts, { keyPath: 'id' })
      attempts.createIndex('performedAt', 'performedAt')
      attempts.createIndex('moduleId', 'moduleId')
      attempts.createIndex('templateId', 'templateId')
      attempts.createIndex('exerciseInstanceId', 'exerciseInstanceId')
      const summaries = database.createObjectStore(STORE.techniqueSummaries, { keyPath: 'id' })
      summaries.createIndex('performedAt', 'performedAt')
      summaries.createIndex('moduleId', 'moduleId')
      summaries.createIndex('templateId', 'templateId')
      summaries.createIndex('exerciseInstanceId', 'exerciseInstanceId')
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

  private async getAllByIndexRange<T>(storeName: StoreName, indexName: string, range: IDBKeyRange): Promise<T[]> {
    const database = await this.openDatabase()
    const transaction = database.transaction(storeName, 'readonly')
    const records = await requestValue(transaction.objectStore(storeName).index(indexName).getAll(range)) as T[]
    await transactionComplete(transaction)
    return records
  }

  private async getManyById<T>(storeName: StoreName, ids: readonly string[]): Promise<T[]> {
    if (ids.length === 0) return []
    const database = await this.openDatabase()
    const transaction = database.transaction(storeName, 'readonly')
    const store = transaction.objectStore(storeName)
    const requests = [...new Set(ids)].map((id) => requestValue(store.get(id)))
    const values = await Promise.all(requests)
    await transactionComplete(transaction)
    return values.filter((value): value is T => value !== undefined) as T[]
  }

  private async getAllForIndexKeys<T>(storeName: StoreName, indexName: string, keys: readonly string[]): Promise<T[]> {
    if (keys.length === 0) return []
    const database = await this.openDatabase()
    const transaction = database.transaction(storeName, 'readonly')
    const index = transaction.objectStore(storeName).index(indexName)
    const requests = [...new Set(keys)].map((key) => requestValue(index.getAll(idbRangeFor(key))))
    const groups = await Promise.all(requests) as T[][]
    await transactionComplete(transaction)
    return groups.flat()
  }

  private async readSnapshot(): Promise<PersistenceSnapshot> {
    const database = await this.openDatabase()
    const names = Object.values(STORE)
    const transaction = database.transaction(names, 'readonly')
    const read = <T>(name: StoreName) => requestValue(transaction.objectStore(name).getAll()) as Promise<T[]>
    const [works, arrangements, scoreVersions, repertoireEntries, practiceSessions, performanceAttempts, attemptSummaries, techniqueAttempts, techniqueAttemptSummaries] = await Promise.all([
      read<PersistedWork>(STORE.works), read<PersistedArrangement>(STORE.arrangements), read<PersistedScoreVersion>(STORE.scoreVersions),
      read<RepertoireEntry>(STORE.repertoire), read<PracticeSessionRecord>(STORE.sessions), read<PerformanceAttemptRecord>(STORE.attempts),
      read<AttemptSummary>(STORE.summaries), read<TechniqueAttemptRecord>(STORE.techniqueAttempts), read<TechniqueAttemptSummary>(STORE.techniqueSummaries),
    ])
    await transactionComplete(transaction)
    return { works, arrangements, scoreVersions, repertoireEntries, practiceSessions, performanceAttempts, attemptSummaries, techniqueAttempts, techniqueAttemptSummaries }
  }

  async importScore(input: ImportScoreInput): Promise<ImportScoreResult> {
    const includedPartIds = canonicalizePartSelection(input.arrangement.includedPartIds)
    if (includedPartIds.length === 0 || includedPartIds.some((partId) => partId.length === 0)) {
      throw new PianoStorageError('REFERENTIAL_INTEGRITY', 'Select at least one valid score part before importing.')
    }
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
      const requestedArrangementName = input.arrangement.name.trim() || 'Imported arrangement'

      const requestedWorkId = input.relationship === 'existing-work-arrangement' ? input.existingWorkId : undefined
      if (input.relationship === 'existing-work-arrangement' && !requestedWorkId) {
        throw new PianoStorageError('REFERENTIAL_INTEGRITY', 'Choose the existing Work for this arrangement.')
      }
      const requestedWork = requestedWorkId ? existingWorks.find((work) => work.id === requestedWorkId) : undefined
      if (requestedWorkId && !requestedWork) throw new PianoStorageError('NOT_FOUND', 'The selected Work no longer exists.')
      if (input.relationship === 'derived-work' && (!input.sourceWorkId || !existingWorks.some((work) => work.id === input.sourceWorkId))) {
        throw new PianoStorageError('REFERENTIAL_INTEGRITY', 'Choose the source Work for this derived Work.')
      }

      const contextVersions = matchingVersions.filter((version) => {
        const arrangement = existingArrangements.find((candidate) => candidate.id === version.arrangementId)
        if (!arrangement || arrangement.name !== requestedArrangementName) return false
        if (requestedWorkId) return arrangement.workId === requestedWorkId
        const work = existingWorks.find((candidate) => candidate.id === arrangement.workId)
        if (input.relationship === 'derived-work') return work?.derivedFromWorkId === input.sourceWorkId && work?.title === input.work.title && work?.composer === input.work.composer
        return work?.title === input.work.title && work.composer === input.work.composer
      })
      const contextVersion = [...contextVersions].sort((left, right) => right.version - left.version || left.id.localeCompare(right.id))[0]
      if (contextVersion) {
        const arrangement = existingArrangements.find((candidate) => candidate.id === contextVersion.arrangementId)
        const work = arrangement ? existingWorks.find((candidate) => candidate.id === arrangement.workId) : undefined
        if (work && arrangement) {
          const arrangementVersions = await requestValue(versionStore.index('arrangementId').getAll(idbRangeFor(arrangement.id))) as PersistedScoreVersion[]
          const activeVersion = [...arrangementVersions].sort((left, right) => right.version - left.version || left.id.localeCompare(right.id))[0]
          const existingRepertoire = await requestValue(repertoireStore.index('arrangementId').get(arrangement.id)) as RepertoireEntry | undefined
          const timestamp = this.now().toISOString()
          const repertoire = existingRepertoire ?? {
            id: this.createId(), arrangementId: arrangement.id, status: input.status, addedAt: timestamp, updatedAt: timestamp,
          }
          if (!existingRepertoire) repertoireStore.add(repertoire)
          if (activeVersion && activeVersion.contentHash === contentHash && samePartSelection(activeVersion.includedPartIds, includedPartIds)) {
            const activeArrangement = exactPartOrder(arrangement.includedPartIds, activeVersion.includedPartIds)
              ? arrangement
              : { ...arrangement, includedPartIds: [...activeVersion.includedPartIds], updatedAt: timestamp }
            if (activeArrangement !== arrangement) arrangementStore.put(activeArrangement)
            await completion
            if (!existingRepertoire || activeArrangement !== arrangement) this.notify()
            return { work, arrangement: activeArrangement, scoreVersion: activeVersion, repertoire, duplicate: true }
          }
          const scoreVersion: PersistedScoreVersion = {
            id: this.createId(), arrangementId: arrangement.id,
            version: Math.max(0, ...arrangementVersions.map((version) => version.version)) + 1,
            format: input.loaded.sourceFormat, createdAt: timestamp, sourceFileName: input.loaded.fileName,
            sourceBytes: input.loaded.sourceBytes, uncompressedBytes: input.loaded.uncompressedBytes,
            contentHash, canonicalMusicXml: input.loaded.musicXmlText, normalizedScoreId: input.normalizedScoreId,
            parserVersion: input.parserVersion, includedPartIds: [...includedPartIds],
          }
          const activeArrangement: PersistedArrangement = { ...arrangement, includedPartIds: [...includedPartIds], updatedAt: timestamp }
          arrangementStore.put(activeArrangement)
          versionStore.add(scoreVersion)
          await completion
          this.notify()
          return { work, arrangement: activeArrangement, scoreVersion, repertoire, duplicate: false }
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
        id: this.createId(), workId: work.id, name: requestedArrangementName,
        difficulty: input.arrangement.difficulty, source: 'user-imported',
        includedPartIds: [...includedPartIds],
        ...(input.arrangement.targetTempoBpm ? { targetTempoBpm: input.arrangement.targetTempoBpm } : {}),
        createdAt: timestamp, updatedAt: timestamp,
      }
      const scoreVersion: PersistedScoreVersion = {
        id: this.createId(), arrangementId: arrangement.id, version: 1,
        format: input.loaded.sourceFormat, createdAt: timestamp, sourceFileName: input.loaded.fileName,
        sourceBytes: input.loaded.sourceBytes, uncompressedBytes: input.loaded.uncompressedBytes,
        contentHash, canonicalMusicXml: input.loaded.musicXmlText, normalizedScoreId: input.normalizedScoreId,
        parserVersion: input.parserVersion,
        includedPartIds: [...includedPartIds],
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
    const includedPartIds = canonicalizePartSelection(input.includedPartIds)
    if (includedPartIds.length === 0 || includedPartIds.some((partId) => partId.length === 0)) {
      throw new PianoStorageError('REFERENTIAL_INTEGRITY', 'Select at least one valid score part before creating a ScoreVersion.')
    }
    const contentHash = await sha256Hex(input.loaded.musicXmlText)
    const database = await this.openDatabase()
    const transaction = database.transaction([STORE.arrangements, STORE.scoreVersions], 'readwrite')
    const completion = transactionComplete(transaction)
    try {
      const arrangementStore = transaction.objectStore(STORE.arrangements)
      const arrangement = await requestValue(arrangementStore.get(input.arrangementId)) as PersistedArrangement | undefined
      if (!arrangement) throw new PianoStorageError('NOT_FOUND', 'The Arrangement for this score revision no longer exists.')
      const store = transaction.objectStore(STORE.scoreVersions)
      const versions = await requestValue(store.index('arrangementId').getAll(idbRangeFor(input.arrangementId))) as PersistedScoreVersion[]
      const duplicate = [...versions].sort((left, right) => right.version - left.version || left.id.localeCompare(right.id))[0]
      if (duplicate) {
        if (duplicate.contentHash === contentHash && samePartSelection(duplicate.includedPartIds, includedPartIds)) {
          if (!exactPartOrder(arrangement.includedPartIds, duplicate.includedPartIds)) {
            arrangementStore.put({ ...arrangement, includedPartIds: [...duplicate.includedPartIds], updatedAt: this.now().toISOString() })
            await completion
            this.notify()
          } else {
            await completion
          }
          return { scoreVersion: duplicate, duplicate: true }
        }
      }
      const timestamp = this.now().toISOString()
      const scoreVersion: PersistedScoreVersion = {
        id: this.createId(),
        arrangementId: input.arrangementId,
        version: Math.max(0, ...versions.map((version) => version.version)) + 1,
        format: input.loaded.sourceFormat,
        createdAt: timestamp,
        sourceFileName: input.loaded.fileName,
        sourceBytes: input.loaded.sourceBytes,
        uncompressedBytes: input.loaded.uncompressedBytes,
        contentHash,
        canonicalMusicXml: input.loaded.musicXmlText,
        normalizedScoreId: input.normalizedScoreId,
        parserVersion: input.parserVersion,
        includedPartIds: [...includedPartIds],
      }
      store.add(scoreVersion)
      arrangementStore.put({ ...arrangement, includedPartIds: [...includedPartIds], updatedAt: timestamp })
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
    const entries = await this.getAll<RepertoireEntry>(STORE.repertoire)
    entries.forEach(assertRepertoireEntry)
    const arrangementIds = entries.map((entry) => entry.arrangementId)
    const arrangements = await this.getManyById<PersistedArrangement>(STORE.arrangements, arrangementIds)
    arrangements.forEach(assertArrangement)
    const [works, versions, summaries, sessions] = await Promise.all([
      this.getManyById<PersistedWork>(STORE.works, arrangements.map((arrangement) => arrangement.workId)),
      this.getAllForIndexKeys<PersistedScoreVersion>(STORE.scoreVersions, 'arrangementId', arrangementIds),
      this.getAllForIndexKeys<AttemptSummary>(STORE.summaries, 'arrangementId', arrangementIds),
      this.getAllForIndexKeys<PracticeSessionRecord>(STORE.sessions, 'arrangementId', arrangementIds),
    ])
    works.forEach(assertWork)
    versions.forEach(assertScoreVersion)
    summaries.forEach(assertAttemptSummary)
    sessions.forEach(assertPracticeSession)
    const arrangementById = new Map(arrangements.map((value) => [value.id, value]))
    const workById = new Map(works.map((value) => [value.id, value]))
    const latestVersionByArrangement = new Map<string, PersistedScoreVersion>()
    for (const version of versions) {
      const current = latestVersionByArrangement.get(version.arrangementId)
      if (!current || version.version > current.version || (version.version === current.version && version.id < current.id)) latestVersionByArrangement.set(version.arrangementId, version)
    }
    const latestSummaryByArrangement = new Map<string, AttemptSummary>()
    for (const summary of summaries) {
      const current = latestSummaryByArrangement.get(summary.arrangementId)
      if (!current || compareIsoDescending(summary, current) < 0) latestSummaryByArrangement.set(summary.arrangementId, summary)
    }
    const sessionStatsByArrangement = new Map<string, { count: number; totalMs: number; lastAt: string | null }>()
    for (const session of sessions) {
      const current = sessionStatsByArrangement.get(session.arrangementId) ?? { count: 0, totalMs: 0, lastAt: null }
      sessionStatsByArrangement.set(session.arrangementId, { count: current.count + 1, totalMs: current.totalMs + session.durationMs, lastAt: current.lastAt === null || session.endedAt > current.lastAt ? session.endedAt : current.lastAt })
    }
    return entries.map((entry) => {
      const arrangement = arrangementById.get(entry.arrangementId)
      const work = arrangement ? workById.get(arrangement.workId) : undefined
      const scoreVersion = latestVersionByArrangement.get(entry.arrangementId)
      if (!arrangement || !work || !scoreVersion) throw new PianoStorageError('CORRUPT_RECORD', `Repertoire entry ${entry.id} has missing linked data.`)
      const stats = sessionStatsByArrangement.get(arrangement.id) ?? { count: 0, totalMs: 0, lastAt: null }
      return {
        work, arrangement, scoreVersion, repertoire: entry, latestAttempt: latestSummaryByArrangement.get(arrangement.id) ?? null,
        sessionCount: stats.count, totalPracticeMs: stats.totalMs, lastPracticedAt: stats.lastAt,
      }
    }).sort((a, b) => (b.lastPracticedAt ?? b.repertoire.addedAt).localeCompare(a.lastPracticedAt ?? a.repertoire.addedAt) || a.arrangement.id.localeCompare(b.arrangement.id))
  }

  async getArrangement(id: string): Promise<PersistedArrangement | null> {
    const value = await this.getById<unknown>(STORE.arrangements, id)
    if (value === null) return null
    assertArrangement(value)
    return value
  }
  async getScoreVersion(id: string): Promise<PersistedScoreVersion | null> {
    const value = await this.getById<unknown>(STORE.scoreVersions, id)
    if (value === null) return null
    assertScoreVersion(value)
    return value
  }

  async listScoreVersions(arrangementId: string): Promise<readonly PersistedScoreVersion[]> {
    const values = await this.getAllByIndex<unknown>(STORE.scoreVersions, 'arrangementId', arrangementId)
    const versions = values.map((value) => { assertScoreVersion(value); return value })
    return versions.sort((left, right) => left.version - right.version || left.id.localeCompare(right.id))
  }

  async getAttempt(id: string): Promise<PerformanceAttemptRecord | null> {
    const value = await this.getById<unknown>(STORE.attempts, id)
    if (value === null) return null
    assertAttempt(value)
    return value
  }

  async listAttemptSummaries(arrangementId?: string): Promise<readonly AttemptSummary[]> {
    const raw = arrangementId
      ? await this.getAllByIndex<unknown>(STORE.summaries, 'arrangementId', arrangementId)
      : await this.getAll<unknown>(STORE.summaries)
    const values = raw.map((value) => { assertAttemptSummary(value); return value })
    return values.sort(compareIsoDescending)
  }

  async listSessions(arrangementId?: string): Promise<readonly PracticeSessionRecord[]> {
    const raw = arrangementId
      ? await this.getAllByIndex<unknown>(STORE.sessions, 'arrangementId', arrangementId)
      : await this.getAll<unknown>(STORE.sessions)
    const values = raw.map((value) => { assertPracticeSession(value); return value })
    return values.sort((a, b) => b.startedAt.localeCompare(a.startedAt) || a.id.localeCompare(b.id))
  }

  async getTechniqueAttempt(id: string): Promise<TechniqueAttemptRecord | null> {
    const value = await this.getById<unknown>(STORE.techniqueAttempts, id)
    if (value === null) return null
    assertTechniqueAttempt(value)
    return value
  }

  async listTechniqueAttemptSummaries(moduleId?: string): Promise<readonly TechniqueAttemptSummary[]> {
    const raw = moduleId ? await this.getAllByIndex<unknown>(STORE.techniqueSummaries, 'moduleId', moduleId) : await this.getAll<unknown>(STORE.techniqueSummaries)
    return raw.map((value) => { assertTechniqueSummary(value); return value }).sort(compareIsoDescending)
  }

  async countTechniqueAttemptsForInstance(exerciseInstanceId: string): Promise<number> {
    const database = await this.openDatabase()
    const transaction = database.transaction(STORE.techniqueAttempts, 'readonly')
    const count = await requestValue(transaction.objectStore(STORE.techniqueAttempts).index('exerciseInstanceId').count(idbRangeFor(exerciseInstanceId)))
    await transactionComplete(transaction)
    return count
  }

  async saveTechniqueAttempt(attempt: TechniqueAttemptRecord): Promise<TechniqueAttemptSaveResult> {
    try { assertTechniqueAttempt(attempt) } catch (cause) { throw new PianoStorageError('REFERENTIAL_INTEGRITY', 'The Technique attempt contains invalid snapshot provenance.', cause) }
    const database = await this.openDatabase()
    const transaction = database.transaction([STORE.techniqueAttempts, STORE.techniqueSummaries], 'readwrite')
    const completion = transactionComplete(transaction)
    try {
      const attempts = transaction.objectStore(STORE.techniqueAttempts)
      const summaries = transaction.objectStore(STORE.techniqueSummaries)
      const existing = await requestValue(attempts.get(attempt.id))
      if (existing) {
        assertTechniqueAttempt(existing)
        const existingSummary = await requestValue(summaries.get(attempt.id)) as unknown
        assertTechniqueSummary(existingSummary)
        const incomingSummary = createTechniqueAttemptSummary(attempt)
        if (!semanticEqual(existing, attempt) || !semanticEqual(existingSummary, incomingSummary)) {
          throw new PianoStorageError('IMMUTABLE_RECORD', 'A different frozen Technique attempt already uses this attempt ID.')
        }
        await completion
        return { created: false, summary: existingSummary }
      }
      const priorInstanceCount = await requestValue(attempts.index('exerciseInstanceId').count(idbRangeFor(attempt.exerciseInstanceId)))
      if (attempt.novelty.priorSavedAttemptCount !== priorInstanceCount || attempt.novelty.firstSavedAttempt !== (priorInstanceCount === 0)) {
        throw new PianoStorageError('REFERENTIAL_INTEGRITY', 'The Technique sight-reading novelty snapshot is stale for this exact exercise instance.')
      }
      const summary = createTechniqueAttemptSummary(attempt)
      attempts.add(attempt)
      this.faultInjector?.('after-technique-attempt-write')
      summaries.add(summary)
      await completion
      this.notify()
      return { created: true, summary }
    } catch (cause) {
      try { transaction.abort() } catch { /* already closed */ }
      void completion.catch(() => undefined)
      if (cause instanceof PianoStorageError) throw cause
      throw asPianoStorageError(cause)
    }
  }

  async saveAttempt(input: AttemptSaveInput): Promise<AttemptSaveResult> {
    const { attempt, session } = input
    try {
      assertAttempt(attempt)
      assertPracticeSession(session)
    } catch (cause) {
      throw new PianoStorageError('REFERENTIAL_INTEGRITY', 'The attempt or practice session contains invalid identity, snapshot, or timing data.', cause)
    }
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
      assertScoreVersion(version)
      if (version.normalizedScoreId !== attempt.expectedPerformancePlan.scoreId) {
        throw new PianoStorageError('REFERENTIAL_INTEGRITY', 'The attempt normalized score does not match its persisted ScoreVersion.')
      }
      if (
        !samePartSelection(version.includedPartIds, attempt.includedPartIds)
        || !samePartSelection(version.includedPartIds, attempt.expectedPerformancePlan.includedPartIds)
      ) {
        throw new PianoStorageError('REFERENTIAL_INTEGRITY', 'The attempt part selection does not match its persisted ScoreVersion.')
      }
      if (attempt.schemaVersion === 4 && attempt.referenceComparison.referenceAttemptId !== null) {
        const referenceId = attempt.referenceComparison.referenceAttemptId
        if (referenceId === attempt.id) throw new PianoStorageError('REFERENTIAL_INTEGRITY', 'A performance attempt cannot use itself as its interpretation reference.')
        const referenceValue = await requestValue(attempts.get(referenceId))
        if (!referenceValue) throw new PianoStorageError('REFERENTIAL_INTEGRITY', 'The selected interpretation reference attempt is unavailable.')
        assertAttempt(referenceValue)
        if (referenceValue.arrangementId !== attempt.arrangementId || referenceValue.scoreVersionId !== attempt.scoreVersionId || !samePartSelection(referenceValue.includedPartIds, attempt.includedPartIds)) throw new PianoStorageError('REFERENTIAL_INTEGRITY', 'The selected interpretation reference is incompatible with this Arrangement, ScoreVersion, or part selection.')
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

  async setVoicingIntentProfile(arrangementId: string, scoreVersionId: string, profile: VoicingIntentProfile | null, lanes: readonly Pick<VoiceLane, 'id' | 'ambiguous'>[]): Promise<PersistedArrangement> {
    if (profile && !isCanonicalIsoTimestamp(profile.updatedAt)) throw new PianoStorageError('REFERENTIAL_INTEGRITY', 'The Voicing profile timestamp is invalid.')
    if (profile) {
      const errors = validateVoicingIntentProfile(profile, lanes, scoreVersionId)
      if (errors.length) throw new PianoStorageError('REFERENTIAL_INTEGRITY', errors.join(' '))
    }
    const database = await this.openDatabase()
    const transaction = database.transaction([STORE.arrangements, STORE.scoreVersions], 'readwrite')
    const completion = transactionComplete(transaction)
    try {
      const arrangements = transaction.objectStore(STORE.arrangements)
      const versions = transaction.objectStore(STORE.scoreVersions)
      const [arrangementValue, versionValue] = await Promise.all([requestValue(arrangements.get(arrangementId)), requestValue(versions.get(scoreVersionId))])
      if (!arrangementValue || !versionValue) throw new PianoStorageError('NOT_FOUND', 'The Arrangement or ScoreVersion is unavailable.')
      assertArrangement(arrangementValue); assertScoreVersion(versionValue)
      if (versionValue.arrangementId !== arrangementId || (profile !== null && profile.scoreVersionId !== scoreVersionId)) throw new PianoStorageError('REFERENTIAL_INTEGRITY', 'The Voicing profile does not belong to this exact ScoreVersion.')
      const preferences = arrangementValue.analysisPreferences ?? { voicingByScoreVersion: {}, referenceByScoreVersion: {} }
      const voicingByScoreVersion = { ...preferences.voicingByScoreVersion }
      if (profile) voicingByScoreVersion[scoreVersionId] = profile
      else delete voicingByScoreVersion[scoreVersionId]
      const updated: PersistedArrangement = { ...arrangementValue, analysisPreferences: { ...preferences, voicingByScoreVersion }, updatedAt: this.now().toISOString() }
      arrangements.put(updated)
      await completion; this.notify(); return updated
    } catch (cause) {
      try { transaction.abort() } catch { /* already complete */ }
      try { await completion } catch { /* preserve cause */ }
      throw asPianoStorageError(cause, 'The Voicing preference could not be saved.')
    }
  }

  async setInterpretationReference(arrangementId: string, scoreVersionId: string, attemptId: string | null): Promise<PersistedArrangement> {
    const database = await this.openDatabase()
    const transaction = database.transaction([STORE.arrangements, STORE.scoreVersions, STORE.attempts], 'readwrite')
    const completion = transactionComplete(transaction)
    try {
      const arrangements = transaction.objectStore(STORE.arrangements); const versions = transaction.objectStore(STORE.scoreVersions); const attempts = transaction.objectStore(STORE.attempts)
      const [arrangementValue, versionValue, attemptValue] = await Promise.all([requestValue(arrangements.get(arrangementId)), requestValue(versions.get(scoreVersionId)), attemptId ? requestValue(attempts.get(attemptId)) : Promise.resolve(undefined)])
      if (!arrangementValue || !versionValue) throw new PianoStorageError('NOT_FOUND', 'The Arrangement or ScoreVersion is unavailable.')
      assertArrangement(arrangementValue); assertScoreVersion(versionValue)
      if (versionValue.arrangementId !== arrangementId) throw new PianoStorageError('REFERENTIAL_INTEGRITY', 'The ScoreVersion does not belong to this Arrangement.')
      if (attemptId) {
        if (!attemptValue) throw new PianoStorageError('REFERENTIAL_INTEGRITY', 'The selected reference attempt does not exist.')
        assertAttempt(attemptValue)
        if (attemptValue.arrangementId !== arrangementId || attemptValue.scoreVersionId !== scoreVersionId || !samePartSelection(attemptValue.includedPartIds, versionValue.includedPartIds)) throw new PianoStorageError('REFERENTIAL_INTEGRITY', 'The selected reference attempt is incompatible with this exact ScoreVersion and part selection.')
      }
      const preferences = arrangementValue.analysisPreferences ?? { voicingByScoreVersion: {}, referenceByScoreVersion: {} }
      const referenceByScoreVersion = { ...preferences.referenceByScoreVersion }
      if (attemptId) referenceByScoreVersion[scoreVersionId] = attemptId
      else delete referenceByScoreVersion[scoreVersionId]
      const updated: PersistedArrangement = { ...arrangementValue, analysisPreferences: { ...preferences, referenceByScoreVersion }, updatedAt: this.now().toISOString() }
      arrangements.put(updated)
      await completion; this.notify(); return updated
    } catch (cause) {
      try { transaction.abort() } catch { /* already complete */ }
      try { await completion } catch { /* preserve cause */ }
      throw asPianoStorageError(cause, 'The interpretation reference could not be saved.')
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

  async updateRepertoireStatus(arrangementId: string, status: RepertoireStatus): Promise<RepertoireEntry> {
    if (!isRepertoireStatus(status)) throw new PianoStorageError('REFERENTIAL_INTEGRITY', 'Choose a valid Repertoire status.')
    const database = await this.openDatabase()
    const transaction = database.transaction(STORE.repertoire, 'readwrite')
    const completion = transactionComplete(transaction)
    try {
      const store = transaction.objectStore(STORE.repertoire)
      const entry = await requestValue(store.index('arrangementId').get(arrangementId)) as RepertoireEntry | undefined
      if (!entry) throw new PianoStorageError('NOT_FOUND', 'This Arrangement is not in active Repertoire.')
      const updated: RepertoireEntry = { ...entry, status, updatedAt: this.now().toISOString() }
      store.put(updated)
      await completion
      this.notify()
      return updated
    } catch (cause) {
      try { transaction.abort() } catch { /* already completed or aborted */ }
      try { await completion } catch { /* preserve original error */ }
      throw asPianoStorageError(cause, 'The Repertoire status could not be updated.')
    }
  }

  async getProgress(range: ProgressRange, now = this.now(), timeZone?: string): Promise<ProgressSnapshot> {
    const cutoff = cutoffForRange(range, now)
    const [attemptValues, sessionValues] = cutoff === null
      ? await Promise.all([this.getAll<unknown>(STORE.summaries), this.getAll<unknown>(STORE.sessions)])
      : await Promise.all([
        this.getAllByIndexRange<unknown>(STORE.summaries, 'performedAt', IDBKeyRange.lowerBound(new Date(cutoff).toISOString())),
        this.getAllByIndexRange<unknown>(STORE.sessions, 'endedAt', IDBKeyRange.lowerBound(new Date(cutoff).toISOString())),
      ])
    const includedAttempts = attemptValues.map((value) => { assertAttemptSummary(value); return value }).sort(compareIsoDescending)
    const includedSessions = sessionValues.map((value) => { assertPracticeSession(value); return value }).sort((a, b) => b.startedAt.localeCompare(a.startedAt) || a.id.localeCompare(b.id))
    return {
      range,
      practiceTimeMs: includedSessions.reduce((total, session) => total + session.durationMs, 0),
      sessionCount: includedSessions.length,
      attemptCount: includedAttempts.length,
      activeDays: new Set(includedSessions.map((session) => localCalendarDateKey(session.startedAt, timeZone))).size,
      attempts: includedAttempts,
      sessions: includedSessions,
    }
  }

  async getCounts(): Promise<StorageCounts> {
    const database = await this.openDatabase()
    const names = [STORE.works, STORE.arrangements, STORE.scoreVersions, STORE.repertoire, STORE.sessions, STORE.attempts, STORE.techniqueAttempts] as const
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
      techniqueAttempts: counts[6] ?? 0,
    }
  }

  async verifyIntegrity(): Promise<IntegrityReport> {
    const snapshot = await this.readSnapshot()
    return validatePersistenceSnapshot(snapshot, this.now().toISOString())
  }

  async createBackup(): Promise<BackupExport> {
    const createdAt = this.now().toISOString()
    const snapshot = await this.readSnapshot()
    const integrity = await validatePersistenceSnapshot(snapshot, createdAt)
    if (integrity.status !== 'healthy') throw new PianoStorageError('CORRUPT_RECORD', 'Backup not created because local data did not pass integrity verification.')
    const payload = sortSnapshot(snapshot)
    const envelope = {
      format: CLEF_BACKUP_DISCRIMINATOR,
      formatVersion: CLEF_BACKUP_FORMAT_VERSION,
      createdAt,
      persistenceSchemaVersion: PERSISTENCE_SCHEMA_VERSION,
      recordCounts: snapshotCounts(payload),
      payloadDigest: await payloadDigest(payload),
      payload,
    } as const
    const json = `${JSON.stringify(JSON.parse(canonicalJson(envelope)), null, 2)}\n`
    return Object.freeze({ filename: backupFilename(createdAt), json, envelope: Object.freeze(envelope), integrity })
  }

  async inspectBackup(json: string): Promise<ValidatedBackup> {
    const envelope = parseBackupEnvelope(json)
    const actualDigest = await payloadDigest(envelope.payload)
    if (actualDigest !== envelope.payloadDigest) throw new PianoStorageError('CORRUPT_RECORD', 'The backup payload does not match its SHA-256 integrity digest.')
    const integrity = await validatePersistenceSnapshot(envelope.payload, this.now().toISOString())
    if (integrity.status !== 'healthy') throw new PianoStorageError('CORRUPT_RECORD', `The backup contains ${integrity.totalIssueCount} structural or relational integrity issue${integrity.totalIssueCount === 1 ? '' : 's'}.`)
    return Object.freeze({ envelope, integrity })
  }

  async restoreBackup(backup: ValidatedBackup, afterCommit?: () => void): Promise<StorageCounts> {
    const envelope = parseBackupEnvelope(canonicalJson(backup.envelope))
    if (await payloadDigest(envelope.payload) !== envelope.payloadDigest) throw new PianoStorageError('CORRUPT_RECORD', 'The inspected backup changed before restore and was rejected.')
    const integrity = await validatePersistenceSnapshot(envelope.payload, this.now().toISOString())
    if (integrity.status !== 'healthy') throw new PianoStorageError('CORRUPT_RECORD', 'The inspected backup no longer passes integrity verification.')
    const database = await this.openDatabase()
    const names = Object.values(STORE)
    const transaction = database.transaction(names, 'readwrite')
    const completion = transactionComplete(transaction)
    const records: readonly [StoreName, readonly { readonly id: string }[]][] = [
      [STORE.works, envelope.payload.works], [STORE.arrangements, envelope.payload.arrangements], [STORE.scoreVersions, envelope.payload.scoreVersions],
      [STORE.repertoire, envelope.payload.repertoireEntries], [STORE.sessions, envelope.payload.practiceSessions], [STORE.attempts, envelope.payload.performanceAttempts],
      [STORE.summaries, envelope.payload.attemptSummaries], [STORE.techniqueAttempts, envelope.payload.techniqueAttempts], [STORE.techniqueSummaries, envelope.payload.techniqueAttemptSummaries],
    ]
    try {
      this.faultInjector?.('restore-before-clear')
      for (const [index, name] of names.entries()) {
        await requestValue(transaction.objectStore(name).clear())
        if (index === 0) this.faultInjector?.('restore-during-clear')
      }
      for (const [storeIndex, [name, values]] of records.entries()) {
        const store = transaction.objectStore(name)
        for (const value of values) await requestValue(store.put(value))
        if (storeIndex === 2) this.faultInjector?.('restore-after-store-writes')
        if (name === STORE.attempts) this.faultInjector?.('restore-performance-attempts')
        if (name === STORE.techniqueAttempts) this.faultInjector?.('restore-technique-attempts')
      }
      this.faultInjector?.('restore-before-complete')
      await completion
    } catch (cause) {
      try { transaction.abort() } catch { /* transaction already aborted or completed */ }
      try { await completion } catch { /* preserve original error */ }
      throw asPianoStorageError(cause, 'The backup could not be restored. The previous local database was preserved.')
    }
    afterCommit?.()
    this.notify()
    return this.getCounts()
  }

  async rebuildDerivedSummaries(): Promise<IntegrityReport> {
    const snapshot = await this.readSnapshot()
    const checkedAt = this.now().toISOString()
    const current = await validatePersistenceSnapshotCore(snapshot, checkedAt)
    if (current.report.status === 'healthy') return current.report
    if (!current.hasSummaryIssue) throw new PianoStorageError('CORRUPT_RECORD', 'Derived summaries cannot be rebuilt because the database has no summary-only repair target.')
    const candidate = buildSummaryRepairCandidate(snapshot)
    if (!candidate) throw new PianoStorageError('CORRUPT_RECORD', 'Derived summaries cannot be rebuilt because an authoritative attempt is corrupt.')
    const candidateValidation = await validatePersistenceSnapshotCore(candidate, checkedAt)
    if (candidateValidation.report.status !== 'healthy') throw new PianoStorageError('CORRUPT_RECORD', 'Derived summaries cannot be rebuilt because the complete hypothetical repaired database still has integrity issues.')
    const database = await this.openDatabase()
    const transaction = database.transaction([STORE.summaries, STORE.techniqueSummaries], 'readwrite')
    const completion = transactionComplete(transaction)
    try {
      const summaries = transaction.objectStore(STORE.summaries)
      const techniqueSummaries = transaction.objectStore(STORE.techniqueSummaries)
      await Promise.all([requestValue(summaries.clear()), requestValue(techniqueSummaries.clear())])
      for (const summary of candidate.attemptSummaries) await requestValue(summaries.put(summary))
      for (const summary of candidate.techniqueAttemptSummaries) await requestValue(techniqueSummaries.put(summary))
      await completion
    } catch (cause) {
      try { transaction.abort() } catch { /* transaction already aborted or completed */ }
      try { await completion } catch { /* preserve original error */ }
      throw asPianoStorageError(cause, 'Derived summaries could not be rebuilt.')
    }
    const finalReport = await this.verifyIntegrity()
    if (finalReport.status !== 'healthy') throw new PianoStorageError('CORRUPT_RECORD', 'Derived summaries were rebuilt, but final database integrity verification did not pass.')
    this.notify()
    return finalReport
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
