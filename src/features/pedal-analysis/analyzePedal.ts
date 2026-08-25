import type { AlignmentResult } from '../alignment/types'
import { durationBetweenScorePositionsToMilliseconds } from '../expected-performance/tempoTimeline'
import type { ExpectedPerformancePlan } from '../expected-performance/types'
import type { ExpressionAnalysisResult } from '../expression-analysis/types'
import { addTime, compareTime, musicalTime, type MusicalTime } from '../musicxml/musicalTime'
import { MUSICXML_PARSER_VERSION } from '../musicxml/parser'
import type { NormalizedScore } from '../musicxml/types'
import type { NoteGradingResult } from '../note-grading/types'
import type { PerformanceRecording } from '../performance/types'
import { buildPedalTargets, pedalScope } from './buildPedalTargets'
import { buildPedalTimeline } from './buildPedalTimeline'
import { buildDamperHolds, buildPedalInteractions } from './damperHold'
import { matchPedalTransitions, type PedalEventMatch } from './matchPedalTransitions'
import { PEDAL_ANALYSIS_ENGINE_VERSION, resolvePedalAnalysisOptions, type PedalAnalysisOptions } from './options'
import type { PedalAnalysisResult, PedalObservation, PedalPhraseResult, PedalReliability, PedalTargetEvent, PedalWarning } from './types'

export interface AnalyzePedalInput {
  readonly normalizedScore: NormalizedScore
  readonly expectedPlan: ExpectedPerformancePlan
  readonly recording: PerformanceRecording
  readonly alignment: AlignmentResult
  readonly noteGrading: NoteGradingResult
  readonly expressionAnalysis: ExpressionAnalysisResult
  readonly options?: Partial<PedalAnalysisOptions>
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 0x01000193) }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value
  seen.add(value)
  Object.values(value as Record<string, unknown>).forEach((child) => deepFreeze(child, seen))
  return Object.freeze(value)
}

function mean(values: readonly number[]): number | null { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null }
export function aggregatePedalPhraseScores(phraseResults: readonly Pick<PedalPhraseResult, 'score'>[]): number | null {
  return mean(phraseResults.flatMap((phrase) => phrase.score === null ? [] : [phrase.score]))
}
function clamp01(value: number): number { return Math.max(0, Math.min(1, value)) }

function timingTolerance(position: MusicalTime, plan: ExpectedPerformancePlan, alignment: AlignmentResult, options: PedalAnalysisOptions): number {
  const quarterMs = durationBetweenScorePositionsToMilliseconds(position, addTime(position, musicalTime(1)), plan.tempoTimeline, alignment.practiceSpeedMultiplier) * alignment.timeTransform.scale
  return Math.max(options.minimumTimingToleranceMs, quarterMs * options.timingToleranceQuarterFraction)
}

function timingScore(errorMs: number, toleranceMs: number, poorMultiplier: number): number {
  const magnitude = Math.abs(errorMs)
  if (magnitude <= toleranceMs) return 1
  return clamp01(1 - (magnitude - toleranceMs) / Math.max(1, toleranceMs * (poorMultiplier - 1)))
}

function startScore(errorMs: number, toleranceMs: number, options: PedalAnalysisOptions): number {
  return timingScore(errorMs, toleranceMs, errorMs < 0 ? options.earlyStartPoorMultiplier : options.lateStartPoorMultiplier)
}

function inputMismatch(input: AnalyzePedalInput): string | null {
  const { normalizedScore: score, expectedPlan: plan, recording, alignment, noteGrading: note, expressionAnalysis: expression } = input
  const selected = [...plan.includedPartIds].sort()
  const recorded = [...(recording.practiceContext.includedPartIds ?? [])].sort()
  const partsMatch = selected.length === recorded.length && selected.every((id, index) => id === recorded[index])
  const scopeMatches = expression.scope.type === note.scope.type
    && expression.scope.expectedStartIndex === note.scope.expectedStartIndex
    && expression.scope.expectedEndIndex === note.scope.expectedEndIndex
    && expression.scope.expectedStartGroupId === note.scope.expectedStartGroupId
    && expression.scope.expectedEndGroupId === note.scope.expectedEndGroupId
  return score.id !== plan.scoreId || !partsMatch
    || alignment.expectedPlanId !== plan.id || alignment.recordingId !== recording.id
    || note.expectedPlanId !== plan.id || note.recordingId !== recording.id || note.alignmentId !== alignment.id
    || expression.scoreId !== score.id || expression.expectedPlanId !== plan.id || expression.recordingId !== recording.id
    || expression.alignmentId !== alignment.id || expression.noteGradingId !== note.id || !scopeMatches
    || expression.diagnostics.alignmentEngineVersion !== alignment.diagnostics.alignmentEngineVersion
    || expression.diagnostics.noteGradingEngineVersion !== note.diagnostics.noteGradingEngineVersion
    ? 'The score, plan, recording, alignment, note grading, expression, scope, or included-part identities do not describe the same take.'
    : null
}

interface ReliabilityEvidence {
  readonly fullyAnalyzedPhrases: number
  readonly targetPhrases: number
  readonly eventCoverage: number
  readonly knownStateCoverage: number | null
  readonly usedPredepressed: boolean
  readonly truncatedCount: number
  readonly unavailableCount: number
  readonly localAnchorCoverage: number
  readonly channelAmbiguous: boolean
}

function reliabilityFor(input: AnalyzePedalInput, score: number | null, evidence: ReliabilityEvidence, options: PedalAnalysisOptions): PedalReliability {
  if (score === null) return 'unavailable'
  if (input.alignment.status === 'ambiguous' || input.noteGrading.reliability === 'provisional' || input.expressionAnalysis.status === 'unavailable') return 'provisional'
  const phraseCoverage = evidence.targetPhrases ? evidence.fullyAnalyzedPhrases / evidence.targetPhrases : 0
  if (input.noteGrading.scope.type === 'aligned-span'
    || evidence.fullyAnalyzedPhrases < options.reliableMinimumPhrases
    || phraseCoverage < options.reliableMinimumCoverage
    || evidence.eventCoverage < options.reliableMinimumCoverage
    || (evidence.knownStateCoverage ?? 0) < options.reliableKnownStateCoverage
    || evidence.localAnchorCoverage < options.reliableMinimumLocalAnchorCoverage
    || evidence.usedPredepressed || evidence.truncatedCount > 0 || evidence.unavailableCount > 0 || evidence.channelAmbiguous) return 'limited'
  return 'reliable'
}

function observationAnchor(event: PedalTargetEvent) {
  const anchor = event.timingAnchor
  return {
    timingAnchorSource: anchor?.source ?? 'global-score-clock' as const,
    globalExpectedMs: anchor?.globalPredictedMs ?? event.expectedPerformedMs,
    anchoredExpectedMs: event.expectedPerformedMs,
    anchorOffsetFromGlobalMs: anchor?.anchorOffsetFromGlobalMs ?? 0,
    beforeExpectedGroupId: anchor?.beforeExpectedGroupId ?? null,
    afterExpectedGroupId: anchor?.afterExpectedGroupId ?? null,
    anchorPerformedGroupIds: anchor?.matchedPerformedGroupIds ?? [],
  }
}

function transitionObservation(
  phraseId: string,
  event: PedalTargetEvent,
  match: PedalEventMatch,
  plan: ExpectedPerformancePlan,
  alignment: AlignmentResult,
  options: PedalAnalysisOptions,
): PedalObservation {
  const id = `pedal-observation:${stableHash(`${phraseId}|${event.id}`)}`
  const tolerance = timingTolerance(event.position, plan, alignment, options)
  if (event.kind === 'change' && match.kind === 'match') {
    const [up, down] = match.transitions
    const performedMs = (up!.relativeMs + down!.relativeMs) / 2
    const error = performedMs - event.expectedPerformedMs
    const gap = down!.relativeMs - up!.relativeMs
    const strongGap = Math.max(options.minimumChangeGapStrongMs, tolerance / options.timingToleranceQuarterFraction * options.changeGapStrongQuarterFraction)
    const gapScore = gap <= strongGap ? 1 : clamp01(1 - (gap - strongGap) / Math.max(1, options.changeGapPoorMs - strongGap))
    const score = (timingScore(error, tolerance, options.stopPoorMultiplier) + gapScore) / 2
    return { id, phraseTargetId: phraseId, targetEventId: event.id, kind: event.kind, score, expectedPerformedMs: event.expectedPerformedMs, ...observationAnchor(event), transitionIds: [up!.id, down!.id], performedMs, timingErrorMs: error, releaseRedownGapMs: gap, evidence: 'transition', summary: score >= 0.75 ? 'The re-pedal change coordinated closely with the performed musical arrival.' : 'The re-pedal change was early, late, or remained released too long relative to the performed music.' }
  }
  if (event.kind === 'change' && match.kind === 'partial-change') {
    const up = match.transitions[0]!
    return { id, phraseTargetId: phraseId, targetEventId: event.id, kind: event.kind, score: 0, expectedPerformedMs: event.expectedPerformedMs, ...observationAnchor(event), transitionIds: [up.id], performedMs: up.relativeMs, timingErrorMs: up.relativeMs - event.expectedPerformedMs, releaseRedownGapMs: null, evidence: 'missing', summary: 'The pedal released for this authored change, but no associated re-depression was observed.' }
  }
  if (match.kind === 'match') {
    const transition = match.transitions[0]!
    const error = transition.relativeMs - event.expectedPerformedMs
    const score = event.kind === 'start' ? startScore(error, tolerance, options) : timingScore(error, tolerance, options.stopPoorMultiplier)
    return { id, phraseTargetId: phraseId, targetEventId: event.id, kind: event.kind, score, expectedPerformedMs: event.expectedPerformedMs, ...observationAnchor(event), transitionIds: [transition.id], performedMs: transition.relativeMs, timingErrorMs: error, releaseRedownGapMs: null, evidence: 'transition', summary: score >= 0.75 ? `The pedal ${event.kind} coordinated closely with the performed musical structure.` : `The pedal ${event.kind} was substantially early or late relative to the performed music.` }
  }
  return { id, phraseTargetId: phraseId, targetEventId: event.id, kind: event.kind, score: 0, expectedPerformedMs: event.expectedPerformedMs, ...observationAnchor(event), transitionIds: [], performedMs: null, timingErrorMs: null, releaseRedownGapMs: null, evidence: 'missing', summary: `No performed pedal ${event.kind} was observed for this authored event.` }
}

export function analyzePedal(input: AnalyzePedalInput): PedalAnalysisResult {
  const options = resolvePedalAnalysisOptions(input.options)
  const { normalizedScore: score, expectedPlan: plan, recording, alignment, noteGrading: note, expressionAnalysis: expression } = input
  const scope = pedalScope(note)
  const timelineBase = buildPedalTimeline(recording)
  const built = buildPedalTargets(score, plan, alignment, note, options)
  const mismatch = inputMismatch(input)
  const correspondenceUnavailable = alignment.status === 'failed' || alignment.status === 'insufficient-data' || note.status === 'unavailable'
  const channelAmbiguous = timelineBase.controllerEvidence.channelMode === 'multi-channel-ambiguous'
  const authoritativeChannel = timelineBase.controllerEvidence.authoritativeChannel ?? null
  const hasControllerEvidence = timelineBase.controllerEvidence.mode !== 'unknown' && authoritativeChannel !== null && !channelAmbiguous
  const unavailableReason = mismatch
    ?? (correspondenceUnavailable ? 'The underlying correspondence is unavailable, so pedal notation cannot be mapped safely.' : null)
    ?? (channelAmbiguous ? 'CC64 arrived on multiple MIDI channels, so authored pedal ownership is ambiguous and was not guessed.' : null)
  const warnings: PedalWarning[] = [...built.warnings]
  if (mismatch) warnings.push({ code: 'INPUT_ID_MISMATCH', severity: 'warning', message: mismatch })
  else if (correspondenceUnavailable) warnings.push({ code: 'CORRESPONDENCE_UNAVAILABLE', severity: 'warning', message: 'Pedal analysis requires a usable alignment and note-grading scope.' })
  if (channelAmbiguous) warnings.push({ code: 'MULTI_CHANNEL_CC64_AMBIGUOUS', severity: 'warning', message: 'Independent CC64 channels were preserved, but no authored pedal lane was assigned to one channel.' })
  if (timelineBase.controllerEvidence.mode === 'continuous-evidence') warnings.push({ code: 'CONTINUOUS_CONTROLLER_VALUES', severity: 'info', message: 'Intermediate CC64 values were preserved as controller evidence; no acoustic half-pedal depth was inferred.' })

  const allEvents = built.targets.flatMap((phrase) => phrase.events)
    .sort((left, right) => compareTime(left.position, right.position) || left.id.localeCompare(right.id))
  const truncatedIds = new Set(allEvents.filter((event) => event.kind === 'stop' && event.expectedPerformedMs >= recording.durationMs - options.recordingBoundaryToleranceMs).map((event) => event.id))
  const predepressedIds = new Set(allEvents.filter((event) => {
    const phrase = built.targets.find((candidate) => candidate.events[0]?.id === event.id)
    const globalOpeningMs = event.timingAnchor?.globalPredictedMs ?? event.expectedPerformedMs
    return event.kind === 'start' && phrase !== undefined
      && timelineBase.controllerEvidence.initialStateKnown && timelineBase.controllerEvidence.initialDown === true
      && globalOpeningMs <= alignment.timeTransform.offsetMs + options.initialStartToleranceMs
  }).map((event) => event.id))
  const matchableEvents = unavailableReason || !hasControllerEvidence ? [] : allEvents.filter((event) => !truncatedIds.has(event.id) && !predepressedIds.has(event.id))
  const authoritativeTransitions = authoritativeChannel === null ? [] : timelineBase.transitions.filter((transition) => transition.channel === authoritativeChannel)
  const matches = new Map(matchPedalTransitions(matchableEvents, authoritativeTransitions, plan, alignment, options).map((match) => [match.targetEventId, match]))
  const used = new Set<string>()
  const observations: PedalObservation[] = []
  const phraseResults: PedalPhraseResult[] = []
  const exclusions = [...built.exclusions]
  let truncatedCount = 0
  let unavailableEventCount = 0
  let predepressedCount = 0
  const firstKnownMs = timelineBase.controllerEvidence.initialStateKnown || authoritativeChannel === null ? 0 : timelineBase.rawSamples.find((sample) => sample.channel === authoritativeChannel)?.relativeMs ?? null

  for (const phrase of built.targets) {
    const phraseObservations: PedalObservation[] = []
    let phraseTruncated = 0
    let phraseUnavailable = 0
    for (const event of phrase.events) {
      if (unavailableReason || !hasControllerEvidence) { phraseUnavailable += 1; unavailableEventCount += 1; continue }
      if (truncatedIds.has(event.id)) { phraseTruncated += 1; truncatedCount += 1; continue }
      const observationId = `pedal-observation:${stableHash(`${phrase.id}|${event.id}`)}`
      if (predepressedIds.has(event.id)) {
        const observation: PedalObservation = { id: observationId, phraseTargetId: phrase.id, targetEventId: event.id, kind: 'start', score: 1, expectedPerformedMs: event.expectedPerformedMs, ...observationAnchor(event), transitionIds: [], performedMs: null, timingErrorMs: null, releaseRedownGapMs: null, evidence: 'predepressed', summary: 'Pedal was already down when recording began at the score-opening pedal start.' }
        phraseObservations.push(observation); observations.push(observation); predepressedCount += 1; continue
      }
      const match = matches.get(event.id) ?? { targetEventId: event.id, kind: 'miss' as const, transitions: [] }
      if (event.kind === 'start' && match.kind === 'miss' && !timelineBase.controllerEvidence.initialStateKnown && firstKnownMs !== null && event.expectedPerformedMs < firstKnownMs) {
        exclusions.push({ id: `pedal-exclusion:${stableHash(`${event.sourceEventId}|unknown-initial-state`)}`, sourceEventId: event.sourceEventId, reason: 'The controller state was still unknown at this authored pedal start.', measureNumber: event.measureNumber })
        phraseUnavailable += 1; unavailableEventCount += 1; continue
      }
      const observation = transitionObservation(phrase.id, event, match, plan, alignment, options)
      match.transitions.forEach((transition) => used.add(transition.id))
      phraseObservations.push(observation); observations.push(observation)
    }
    const analyzedEventCount = phraseObservations.length
    const authoredEventCount = phrase.events.length
    const completeness = analyzedEventCount === authoredEventCount ? 'complete' : analyzedEventCount > 0 ? 'partial' : 'unanalyzed'
    phraseResults.push({
      id: `pedal-phrase-result:${stableHash(phrase.id)}`, targetId: phrase.id,
      score: mean(phraseObservations.map((observation) => observation.score)),
      observationIds: phraseObservations.map((observation) => observation.id),
      authoredEventCount, analyzedEventCount, truncatedEventCount: phraseTruncated,
      unavailableEventCount: phraseUnavailable, coverageRatio: authoredEventCount ? analyzedEventCount / authoredEventCount : 0,
      completeness,
    })
  }

  const scoreValue = unavailableReason || !hasControllerEvidence || built.targets.length === 0 ? null : aggregatePedalPhraseScores(phraseResults)
  const metricUnavailableReason = unavailableReason ?? (!built.targets.length ? 'No complete supported authored damper-pedal phrases are present in this grading scope.' : !hasControllerEvidence ? 'No trustworthy single-channel CC64 controller state was observed for this recording.' : scoreValue === null ? 'Authored pedal exists, but no phrase could be analyzed safely.' : null)
  if (!hasControllerEvidence && built.targets.length && !channelAmbiguous) warnings.push({ code: 'NO_CONTROLLER_EVIDENCE', severity: 'info', message: 'Missing historical or live CC64 evidence remains unknown and is not scored as a missed pedal.' })
  if (unavailableEventCount && !unavailableReason && hasControllerEvidence) warnings.push({ code: 'UNKNOWN_INITIAL_STATE', severity: 'info', message: 'An authored start occurred before the recording established a trustworthy same-channel CC64 state and was not scored as pedal-up.' })
  if (truncatedCount) warnings.push({ code: 'RECORDING_END_TRUNCATION', severity: 'info', message: `${truncatedCount} final pedal release target${truncatedCount === 1 ? ' was' : 's were'} too near recording stop to grade safely.` })
  const controllerEvidence = { ...timelineBase.controllerEvidence, extraUnassignedTransitionCount: timelineBase.transitions.filter((transition) => !used.has(transition.id)).length }
  const timeline = { ...timelineBase, controllerEvidence }
  const damperHolds = buildDamperHolds(recording, expression, timeline)
  const interactions = buildPedalInteractions(expression, damperHolds)
  const fullyAnalyzedPhraseCount = phraseResults.filter((phrase) => phrase.completeness === 'complete').length
  const partiallyAnalyzedPhraseCount = phraseResults.filter((phrase) => phrase.completeness === 'partial').length
  const unanalyzedPhraseCount = phraseResults.filter((phrase) => phrase.completeness === 'unanalyzed').length
  const analyzedEventCount = observations.length
  const authoredEventCount = allEvents.length
  const eventCoverageRatio = authoredEventCount ? analyzedEventCount / authoredEventCount : null
  const localTimingAnchorCount = allEvents.filter((event) => event.timingAnchor?.source === 'local-performed').length
  const globalTimingFallbackCount = authoredEventCount - localTimingAnchorCount
  const meanTimingAnchorConfidence = mean(allEvents.flatMap((event) => event.timingAnchor ? [event.timingAnchor.confidence] : []))
  const localAnchorCoverage = authoredEventCount ? localTimingAnchorCount / authoredEventCount : 0
  const reliability = reliabilityFor(input, scoreValue, {
    fullyAnalyzedPhrases: fullyAnalyzedPhraseCount, targetPhrases: built.targets.length,
    eventCoverage: eventCoverageRatio ?? 0, knownStateCoverage: controllerEvidence.knownStateCoverage,
    usedPredepressed: predepressedCount > 0, truncatedCount, unavailableCount: unavailableEventCount,
    localAnchorCoverage, channelAmbiguous,
  }, options)
  const result: PedalAnalysisResult = {
    id: `pedal-analysis:${stableHash(JSON.stringify({ scoreId: score.id, planId: plan.id, recordingId: recording.id, alignmentId: alignment.id, noteId: note.id, expressionId: expression.id, scope, version: PEDAL_ANALYSIS_ENGINE_VERSION, options }))}`,
    status: scoreValue === null ? 'unavailable' : 'ready', reliability, unavailableReason: metricUnavailableReason, score: scoreValue,
    scoreId: score.id, expectedPlanId: plan.id, recordingId: recording.id, alignmentId: alignment.id, noteGradingId: note.id, expressionAnalysisId: expression.id,
    scope,
    coverage: {
      authoredPhraseCount: built.targets.length, analyzedPhraseCount: fullyAnalyzedPhraseCount,
      ratio: built.targets.length ? fullyAnalyzedPhraseCount / built.targets.length : null,
      fullyAnalyzedPhraseCount, partiallyAnalyzedPhraseCount, unanalyzedPhraseCount,
      authoredEventCount, analyzedEventCount, truncatedEventCount: truncatedCount,
      unavailableEventCount, eventCoverageRatio,
    },
    controllerEvidence, targets: built.targets, observations, phraseResults, timeline, damperHolds, interactions, exclusions, warnings,
    diagnostics: {
      pedalAnalysisEngineVersion: PEDAL_ANALYSIS_ENGINE_VERSION,
      musicXmlParserVersion: MUSICXML_PARSER_VERSION,
      expressionAnalysisEngineVersion: expression.diagnostics.expressionAnalysisEngineVersion,
      alignmentEngineVersion: alignment.diagnostics.alignmentEngineVersion,
      noteGradingEngineVersion: note.diagnostics.noteGradingEngineVersion,
      authoredPedalEventCount: score.pedalEvents.filter((event) => plan.includedPartIds.includes(event.partId)).length,
      truncatedTargetCount: truncatedCount,
      predepressedObservationCount: predepressedCount,
      localTimingAnchorCount,
      globalTimingFallbackCount,
      meanTimingAnchorConfidence,
    },
  }
  return deepFreeze(result)
}
