import type { AlignmentResult } from '../alignment/types'
import { durationBetweenScorePositionsToMilliseconds } from '../expected-performance/tempoTimeline'
import type { ExpectedPerformancePlan } from '../expected-performance/types'
import type { ExpressionAnalysisResult } from '../expression-analysis/types'
import { addTime, musicalTime, type MusicalTime } from '../musicxml/musicalTime'
import { MUSICXML_PARSER_VERSION } from '../musicxml/parser'
import type { NormalizedScore } from '../musicxml/types'
import type { NoteGradingResult } from '../note-grading/types'
import type { PerformanceRecording } from '../performance/types'
import { buildPedalTargets, pedalScope } from './buildPedalTargets'
import { buildPedalTimeline } from './buildPedalTimeline'
import { buildDamperHolds, buildPedalInteractions } from './damperHold'
import { PEDAL_ANALYSIS_ENGINE_VERSION, resolvePedalAnalysisOptions, type PedalAnalysisOptions } from './options'
import type { PedalAnalysisResult, PedalObservation, PedalPhraseResult, PedalReliability, PedalTransition, PedalWarning } from './types'

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
export function aggregatePedalPhraseScores(phraseResults: readonly Pick<PedalPhraseResult, 'score'>[]): number | null { return mean(phraseResults.map((phrase) => phrase.score)) }
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

function matchingTransition(transitions: readonly PedalTransition[], kind: PedalTransition['kind'], expectedMs: number, used: Set<string>, afterMs = -Infinity): PedalTransition | null {
  return transitions.filter((transition) => transition.kind === kind && !used.has(transition.id) && transition.relativeMs >= afterMs)
    .sort((left, right) => Math.abs(left.relativeMs - expectedMs) - Math.abs(right.relativeMs - expectedMs) || left.relativeMs - right.relativeMs || left.sequence - right.sequence)[0] ?? null
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

function reliabilityFor(input: AnalyzePedalInput, score: number | null, analyzedPhrases: number, targetPhrases: number, knownCoverage: number | null, usedPredepressed: boolean, truncatedCount: number, options: PedalAnalysisOptions): PedalReliability {
  if (score === null) return 'unavailable'
  if (input.alignment.status === 'ambiguous' || input.noteGrading.reliability === 'provisional' || input.expressionAnalysis.status === 'unavailable') return 'provisional'
  const coverage = targetPhrases ? analyzedPhrases / targetPhrases : 0
  if (input.noteGrading.scope.type === 'aligned-span' || analyzedPhrases < options.reliableMinimumPhrases || coverage < options.reliableMinimumCoverage || (knownCoverage ?? 0) < options.reliableKnownStateCoverage || usedPredepressed || truncatedCount > 0) return 'limited'
  return 'reliable'
}

export function analyzePedal(input: AnalyzePedalInput): PedalAnalysisResult {
  const options = resolvePedalAnalysisOptions(input.options)
  const { normalizedScore: score, expectedPlan: plan, recording, alignment, noteGrading: note, expressionAnalysis: expression } = input
  const scope = pedalScope(note)
  const timelineBase = buildPedalTimeline(recording)
  const built = buildPedalTargets(score, plan, alignment, note)
  const mismatch = inputMismatch(input)
  const correspondenceUnavailable = alignment.status === 'failed' || alignment.status === 'insufficient-data' || note.status === 'unavailable'
  const hasControllerEvidence = timelineBase.controllerEvidence.mode !== 'unknown'
  const unavailableReason = mismatch ?? (correspondenceUnavailable ? 'The underlying correspondence is unavailable, so pedal notation cannot be mapped safely.' : null)
  const warnings: PedalWarning[] = [...built.warnings]
  if (mismatch) warnings.push({ code: 'INPUT_ID_MISMATCH', severity: 'warning', message: mismatch })
  else if (correspondenceUnavailable) warnings.push({ code: 'CORRESPONDENCE_UNAVAILABLE', severity: 'warning', message: 'Pedal analysis requires a usable alignment and note-grading scope.' })
  if (timelineBase.controllerEvidence.mode === 'continuous-evidence') warnings.push({ code: 'CONTINUOUS_CONTROLLER_VALUES', severity: 'info', message: 'Intermediate CC64 values were preserved as controller evidence; no acoustic half-pedal depth was inferred.' })

  const used = new Set<string>()
  const observations: PedalObservation[] = []
  const phraseResults: PedalPhraseResult[] = []
  const exclusions = [...built.exclusions]
  let truncatedCount = 0
  let predepressedCount = 0
  if (!unavailableReason && hasControllerEvidence) {
    let transitionCursorMs = -Infinity
    for (const phrase of built.targets) {
      const phraseObservations: PedalObservation[] = []
      let phraseInitialStateUnknown = false
      for (const event of phrase.events) {
        const tolerance = timingTolerance(event.position, plan, alignment, options)
        if (event.kind === 'stop' && event.expectedPerformedMs >= recording.durationMs - options.recordingBoundaryToleranceMs) {
          truncatedCount += 1
          continue
        }
        const observationId = `pedal-observation:${stableHash(`${phrase.id}|${event.id}`)}`
        if (event.kind === 'start' && phrase.events[0]?.id === event.id && timelineBase.controllerEvidence.initialStateKnown && timelineBase.controllerEvidence.initialDown === true && event.expectedPerformedMs <= alignment.timeTransform.offsetMs + options.initialStartToleranceMs) {
          const observation: PedalObservation = { id: observationId, phraseTargetId: phrase.id, targetEventId: event.id, kind: 'start', score: 1, expectedPerformedMs: event.expectedPerformedMs, transitionIds: [], performedMs: null, timingErrorMs: null, releaseRedownGapMs: null, evidence: 'predepressed', summary: 'Pedal was already down when recording began at the score-opening pedal start.' }
          phraseObservations.push(observation); observations.push(observation); predepressedCount += 1; transitionCursorMs = Math.max(transitionCursorMs, 0); continue
        }
        if (event.kind === 'change') {
          const up = matchingTransition(timelineBase.transitions, 'up', event.expectedPerformedMs, used, transitionCursorMs)
          const down = up ? matchingTransition(timelineBase.transitions, 'down', event.expectedPerformedMs, used, up.relativeMs) : null
          if (up && down) {
            used.add(up.id); used.add(down.id); transitionCursorMs = down.relativeMs
            const error = ((up.relativeMs + down.relativeMs) / 2) - event.expectedPerformedMs
            const gap = down.relativeMs - up.relativeMs
            const strongGap = Math.max(options.minimumChangeGapStrongMs, tolerance / options.timingToleranceQuarterFraction * options.changeGapStrongQuarterFraction)
            const gapScore = gap <= strongGap ? 1 : clamp01(1 - (gap - strongGap) / Math.max(1, options.changeGapPoorMs - strongGap))
            const scoreValue = (timingScore(error, tolerance, options.stopPoorMultiplier) + gapScore) / 2
            const observation: PedalObservation = { id: observationId, phraseTargetId: phrase.id, targetEventId: event.id, kind: 'change', score: scoreValue, expectedPerformedMs: event.expectedPerformedMs, transitionIds: [up.id, down.id], performedMs: (up.relativeMs + down.relativeMs) / 2, timingErrorMs: error, releaseRedownGapMs: gap, evidence: 'transition', summary: scoreValue >= 0.75 ? 'The re-pedal change was coordinated near its authored position.' : 'The authored re-pedal change was late, early, or remained released too long.' }
            phraseObservations.push(observation); observations.push(observation); continue
          }
          if (up) {
            used.add(up.id); transitionCursorMs = up.relativeMs
            const missingRedown: PedalObservation = { id: observationId, phraseTargetId: phrase.id, targetEventId: event.id, kind: 'change', score: 0, expectedPerformedMs: event.expectedPerformedMs, transitionIds: [up.id], performedMs: up.relativeMs, timingErrorMs: up.relativeMs - event.expectedPerformedMs, releaseRedownGapMs: null, evidence: 'missing', summary: 'The pedal released for this authored change, but no subsequent re-depression was observed.' }
            phraseObservations.push(missingRedown); observations.push(missingRedown)
            continue
          }
        } else {
          const transition = matchingTransition(timelineBase.transitions, event.kind === 'start' ? 'down' : 'up', event.expectedPerformedMs, used, transitionCursorMs)
          if (transition) {
            used.add(transition.id); transitionCursorMs = transition.relativeMs
            const error = transition.relativeMs - event.expectedPerformedMs
            const scoreValue = event.kind === 'start' ? startScore(error, tolerance, options) : timingScore(error, tolerance, options.stopPoorMultiplier)
            const observation: PedalObservation = { id: observationId, phraseTargetId: phrase.id, targetEventId: event.id, kind: event.kind, score: scoreValue, expectedPerformedMs: event.expectedPerformedMs, transitionIds: [transition.id], performedMs: transition.relativeMs, timingErrorMs: error, releaseRedownGapMs: null, evidence: 'transition', summary: scoreValue >= 0.75 ? `The pedal ${event.kind} aligned closely with its authored position.` : `The pedal ${event.kind} was substantially early or late.` }
            phraseObservations.push(observation); observations.push(observation); continue
          }
        }
        const firstKnownMs = timelineBase.controllerEvidence.initialStateKnown ? 0 : timelineBase.rawSamples[0]?.relativeMs ?? null
        if (event.kind === 'start' && !timelineBase.controllerEvidence.initialStateKnown && firstKnownMs !== null && event.expectedPerformedMs < firstKnownMs) {
          exclusions.push({ id: `pedal-exclusion:${stableHash(`${event.sourceEventId}|unknown-initial-state`)}`, sourceEventId: event.sourceEventId, reason: 'The controller state was still unknown at this authored pedal start.', measureNumber: event.measureNumber })
          phraseInitialStateUnknown = true
          break
        }
        const missing: PedalObservation = { id: observationId, phraseTargetId: phrase.id, targetEventId: event.id, kind: event.kind, score: 0, expectedPerformedMs: event.expectedPerformedMs, transitionIds: [], performedMs: null, timingErrorMs: null, releaseRedownGapMs: null, evidence: 'missing', summary: `No performed pedal ${event.kind} was observed for this authored event.` }
        phraseObservations.push(missing); observations.push(missing)
        transitionCursorMs = Math.max(transitionCursorMs, event.expectedPerformedMs)
      }
      if (phraseInitialStateUnknown) continue
      const phraseScore = mean(phraseObservations.map((observation) => observation.score))
      if (phraseScore !== null) phraseResults.push({ id: `pedal-phrase-result:${stableHash(phrase.id)}`, targetId: phrase.id, score: phraseScore, observationIds: phraseObservations.map((observation) => observation.id) })
    }
  }
  const scoreValue = unavailableReason || !hasControllerEvidence || built.targets.length === 0 ? null : aggregatePedalPhraseScores(phraseResults)
  const metricUnavailableReason = unavailableReason ?? (!built.targets.length ? 'No complete supported authored damper-pedal phrases are present in this grading scope.' : !hasControllerEvidence ? 'No trustworthy CC64 controller state was observed for this recording.' : scoreValue === null ? 'Authored pedal exists, but no phrase could be analyzed safely.' : null)
  if (!hasControllerEvidence && built.targets.length) warnings.push({ code: 'NO_CONTROLLER_EVIDENCE', severity: 'info', message: 'Missing historical or live CC64 evidence remains unknown and is not scored as a missed pedal.' })
  if (exclusions.length > built.exclusions.length) warnings.push({ code: 'UNKNOWN_INITIAL_STATE', severity: 'info', message: 'An authored start occurred before the recording established a trustworthy CC64 state and was not scored as pedal-up.' })
  if (truncatedCount) warnings.push({ code: 'RECORDING_END_TRUNCATION', severity: 'info', message: `${truncatedCount} final pedal release target${truncatedCount === 1 ? ' was' : 's were'} too near recording stop to grade safely.` })
  const controllerEvidence = { ...timelineBase.controllerEvidence, extraUnassignedTransitionCount: timelineBase.transitions.filter((transition) => !used.has(transition.id)).length }
  const timeline = { ...timelineBase, controllerEvidence }
  const damperHolds = buildDamperHolds(recording, expression, timeline)
  const interactions = buildPedalInteractions(expression, damperHolds)
  const reliability = reliabilityFor(input, scoreValue, phraseResults.length, built.targets.length, controllerEvidence.knownStateCoverage, predepressedCount > 0, truncatedCount, options)
  const result: PedalAnalysisResult = {
    id: `pedal-analysis:${stableHash(JSON.stringify({ scoreId: score.id, planId: plan.id, recordingId: recording.id, alignmentId: alignment.id, noteId: note.id, expressionId: expression.id, scope, version: PEDAL_ANALYSIS_ENGINE_VERSION, options }))}`,
    status: scoreValue === null ? 'unavailable' : 'ready', reliability, unavailableReason: metricUnavailableReason, score: scoreValue,
    scoreId: score.id, expectedPlanId: plan.id, recordingId: recording.id, alignmentId: alignment.id, noteGradingId: note.id, expressionAnalysisId: expression.id,
    scope,
    coverage: { authoredPhraseCount: built.targets.length, analyzedPhraseCount: phraseResults.length, ratio: built.targets.length ? phraseResults.length / built.targets.length : null },
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
    },
  }
  return deepFreeze(result)
}
