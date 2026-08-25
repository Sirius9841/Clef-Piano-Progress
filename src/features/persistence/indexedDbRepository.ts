import { PianoStorageError, asPianoStorageError } from './errors'
import { sha256Hex } from './hash'
import { localCalendarDateKey } from './localCalendar'
import { canonicalizePartSelection, exactPartOrder, samePartSelection } from './partSelection'
import { isRepertoireStatus, type RepertoireStatus } from '../../domain/music'
import type { PianoProgressRepository } from './repository'
import { validateVoicingIntentProfile } from '../voicing-analysis/voicingIntent'
import type { VoiceLane, VoicingIntentProfile } from '../voicing-analysis/types'
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
      !isObjectRecord(expression) || !isObjectRecord(voicing) || !isObjectRecord(voicing.scope) || !isObjectRecord(voicing.coverage) || !isObjectRecord(voicing.diagnostics)
      || !Array.isArray(voicing.lanes) || !Array.isArray(voicing.targets) || !Array.isArray(voicing.observations) || !Array.isArray(voicing.regionResults) || !Array.isArray(voicing.laneStatistics) || !Array.isArray(voicing.exclusions) || !Array.isArray(voicing.warnings)
      || (voicing.status !== 'ready' && voicing.status !== 'unavailable') || (voicing.mode !== 'descriptive' && voicing.mode !== 'configured')
      || !['reliable', 'limited', 'provisional', 'unavailable'].includes(typeof voicing.reliability === 'string' ? voicing.reliability : '') || !isUnitNumberOrNull(voicing.score)
      || voicing.scoreId !== plan.scoreId || voicing.scoreVersionId !== attempt.scoreVersionId || voicing.expectedPlanId !== plan.id || voicing.recordingId !== recording.id || voicing.alignmentId !== alignment.id || voicing.noteGradingId !== noteGrading.id || voicing.expressionAnalysisId !== expression.id
      || voicing.scope.type !== noteGrading.scope.type || voicing.scope.expectedStartIndex !== noteGrading.scope.expectedStartIndex || voicing.scope.expectedEndIndex !== noteGrading.scope.expectedEndIndex || voicing.scope.expectedStartGroupId !== noteGrading.scope.expectedStartGroupId || voicing.scope.expectedEndGroupId !== noteGrading.scope.expectedEndGroupId
      || typeof voicing.diagnostics.voicingAnalysisEngineVersion !== 'string' || versions.voicingAnalysis !== voicing.diagnostics.voicingAnalysisEngineVersion
      || !isObjectRecord(reference) || !isObjectRecord(reference.overlapScope) || !isObjectRecord(reference.diagnostics)
      || !isObjectRecord(reference.tempo) || !isObjectRecord(reference.dynamics) || !isObjectRecord(reference.articulation) || !isObjectRecord(reference.pedal) || !isObjectRecord(reference.voicing) || !Array.isArray(reference.warnings)
      || (reference.status !== 'ready' && reference.status !== 'unavailable') || !['reliable', 'limited', 'provisional', 'unavailable'].includes(typeof reference.reliability === 'string' ? reference.reliability : '')
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
    entries.forEach((entry) => {
      assertRecord(entry, 'RepertoireEntry')
      if (typeof entry.arrangementId !== 'string' || typeof entry.addedAt !== 'string') throw new PianoStorageError('CORRUPT_RECORD', `Repertoire entry ${entry.id} is invalid.`)
    })
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
