import type { AlignmentResult, PerformedAttack } from '../alignment/types'
import { durationBetweenScorePositionsToMilliseconds } from '../expected-performance/tempoTimeline'
import type { ExpectedPerformancePlan } from '../expected-performance/types'
import { addTime, compareTime, subtractTime, timeToNumber, type MusicalTime } from '../musicxml/musicalTime'
import { MUSICXML_PARSER_VERSION } from '../musicxml/parser'
import type { DynamicEvent, NormalizedNote, NormalizedScore, WedgeEvent } from '../musicxml/types'
import type { ExpectedTargetResult, ExpectedKeyTarget, NoteGradingResult } from '../note-grading/types'
import type { PerformanceRecording, RecordedKeyPress } from '../performance/types'
import { EXPRESSION_ANALYSIS_ENGINE_VERSION, resolveExpressionAnalysisOptions, type ExpressionAnalysisOptions } from './options'
import type {
  ArticulationAnalysis,
  ArticulationObservation,
  ArticulationTarget,
  ArticulationTargetKind,
  DynamicsAnalysis,
  DynamicsDirection,
  DynamicsObservation,
  DynamicsTarget,
  ExpressionAnalysisResult,
  ExpressionCoverage,
  ExpressionExclusion,
  ExpressionReliability,
  ExpressionScope,
  ExpressionWarning,
  MatchedPerformanceObservation,
  VelocityNormalizationDiagnostics,
} from './types'

export interface AnalyzeExpressionInput {
  readonly normalizedScore: NormalizedScore
  readonly expectedPlan: ExpectedPerformancePlan
  readonly recording: PerformanceRecording
  readonly alignment: AlignmentResult
  readonly noteGrading: NoteGradingResult
  readonly options?: Partial<ExpressionAnalysisOptions>
}

const DYNAMIC_LEVEL = { ppp: 0, pp: 1, p: 2, mp: 3, mf: 4, f: 5, ff: 6, fff: 7 } as const

function stableHash(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value
  seen.add(value)
  Object.values(value as Record<string, unknown>).forEach((child) => deepFreeze(child, seen))
  return Object.freeze(value)
}

function clamp01(value: number): number { return Math.min(1, Math.max(0, value)) }

function quantile(values: readonly number[], probability: number): number | null {
  if (!values.length) return null
  const ordered = [...values].sort((left, right) => left - right)
  const index = (ordered.length - 1) * probability
  const lower = Math.floor(index)
  const fraction = index - lower
  return ordered[lower]! + ((ordered[lower + 1] ?? ordered[lower]!) - ordered[lower]!) * fraction
}

function median(values: readonly number[]): number | null { return quantile(values, 0.5) }

function meanScore(values: readonly number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
}

function coverage(targetCount: number, observationCount: number): ExpressionCoverage {
  return { authoredTargetCount: targetCount, analyzedTargetCount: observationCount, ratio: targetCount ? observationCount / targetCount : null }
}

function scopeCopy(noteGrading: NoteGradingResult): ExpressionScope {
  return {
    type: noteGrading.scope.type,
    expectedStartIndex: noteGrading.scope.expectedStartIndex,
    expectedEndIndex: noteGrading.scope.expectedEndIndex,
    expectedStartGroupId: noteGrading.scope.expectedStartGroupId,
    expectedEndGroupId: noteGrading.scope.expectedEndGroupId,
  }
}

function laneKey(partId: string, staff: number | null, voice: string | null, suffix = ''): string {
  return `${partId}|${staff ?? '*'}|${voice ?? '*'}|${suffix}`
}

interface NotationLane {
  readonly partId: string
  readonly staff: number | null
  readonly voice: string | null
}

function notationLaneCompatible(left: NotationLane, right: NotationLane): boolean {
  return left.partId === right.partId
    && (left.staff === null || right.staff === null || left.staff === right.staff)
    && (left.voice === null || right.voice === null || left.voice === right.voice)
}

function observationInLane(observation: MatchedPerformanceObservation, partId: string, staff: number | null, voice: string | null): boolean {
  const staffs: readonly (number | null)[] = observation.staffs.length ? observation.staffs : [null]
  const voices: readonly (string | null)[] = observation.voices.length ? observation.voices : [null]
  return observation.partIds.some((observationPartId) => staffs.some((observationStaff) => voices.some((observationVoice) => notationLaneCompatible(
    { partId: observationPartId, staff: observationStaff, voice: observationVoice },
    { partId, staff, voice },
  ))))
}

function scorePositionInScope(position: MusicalTime, alignment: AlignmentResult, scope: ExpressionScope): boolean {
  if (scope.expectedStartIndex === null || scope.expectedEndIndex === null) return false
  const start = alignment.expectedGroups[scope.expectedStartIndex]?.position
  const end = alignment.expectedGroups[scope.expectedEndIndex]?.position
  return !!start && !!end && compareTime(position, start) >= 0 && compareTime(position, end) <= 0
}

function performedAttackMap(alignment: AlignmentResult): Map<string, PerformedAttack> {
  return new Map(alignment.performedGroups.flatMap((group) => group.attacks.map((attack) => [attack.id, attack] as const)))
}

function buildMatchedObservations(
  plan: ExpectedPerformancePlan,
  recording: PerformanceRecording,
  alignment: AlignmentResult,
  noteGrading: NoteGradingResult,
): MatchedPerformanceObservation[] {
  const expectedAttacks = new Map(plan.attacks.map((attack) => [attack.id, attack]))
  const performed = performedAttackMap(alignment)
  const keyPresses = new Map(recording.keyPresses.map((press) => [press.id, press]))
  return noteGrading.expectedResults.flatMap((result) => {
    if (result.kind !== 'correct') return []
    const performedAttack = performed.get(result.performedAttackId)
    const keyPress = performedAttack ? keyPresses.get(performedAttack.sourceKeyPressId) : undefined
    const attacks = result.target.sourceExpectedAttackIds.flatMap((id) => {
      const attack = expectedAttacks.get(id)
      return attack ? [attack] : []
    })
    const expectedDuration = attacks[0]?.expectedDuration
    if (!performedAttack || !keyPress || !expectedDuration) return []
    return [{
      id: `expression-match:${stableHash(`${result.target.id}|${performedAttack.id}|${keyPress.id}`)}`,
      expectedTargetId: result.target.id,
      expectedAttackIds: [...result.target.sourceExpectedAttackIds],
      sourceNoteIds: [...result.target.sourceNoteIds],
      performedAttackId: performedAttack.id,
      recordedKeyPressId: keyPress.id,
      alignmentGroupId: result.groupAlignmentId,
      partIds: [...result.target.partIds],
      staffs: [...result.target.staffs],
      voices: [...result.target.voices],
      measureIndices: [...result.target.measureIndices],
      measureNumbers: [...result.target.measureNumbers],
      scorePosition: { ...result.target.scorePosition },
      midi: result.target.midi,
      rawVelocity: keyPress.velocity,
      normalizedIntensity: null,
      attackMs: keyPress.attackMs,
      releaseMs: keyPress.releaseMs,
      expectedDuration: { ...expectedDuration },
      expectedDurations: attacks.map((attack) => ({ ...attack.expectedDuration })),
    }]
  }).sort((left, right) => compareTime(left.scorePosition, right.scorePosition) || left.id.localeCompare(right.id))
}

function normalizeVelocities(observations: readonly MatchedPerformanceObservation[], options: ExpressionAnalysisOptions): { observations: MatchedPerformanceObservation[]; diagnostics: VelocityNormalizationDiagnostics } {
  const values = observations.map((observation) => observation.rawVelocity)
  const q10 = quantile(values, options.velocityLowQuantile)
  const q90 = quantile(values, options.velocityHighQuantile)
  const robustRange = q10 === null || q90 === null ? null : q90 - q10
  const evidenceSufficient = values.length >= options.minimumVelocitySamples
    && new Set(values).size >= options.minimumUniqueVelocities
    && robustRange !== null && robustRange >= options.minimumRobustVelocityRange
  const normalized = observations.map((observation) => ({
    ...observation,
    normalizedIntensity: evidenceSufficient ? clamp01((observation.rawVelocity - q10!) / robustRange!) : null,
  }))
  return {
    observations: normalized,
    diagnostics: {
      method: 'attempt-scope-q10-q90', sampleCount: values.length, uniqueVelocityCount: new Set(values).size,
      rawMinimum: values.length ? Math.min(...values) : null, rawMaximum: values.length ? Math.max(...values) : null,
      median: median(values), q10, q90, robustRange, evidenceSufficient,
    },
  }
}

function direction(from: DynamicEvent['marking'], to: DynamicEvent['marking']): DynamicsDirection | null {
  const difference = DYNAMIC_LEVEL[to] - DYNAMIC_LEVEL[from]
  return difference > 0 ? 'increase' : difference < 0 ? 'decrease' : null
}

interface WedgeSpan { start: WedgeEvent; end: WedgeEvent }

function wedgeSpans(events: readonly WedgeEvent[]): { spans: WedgeSpan[]; exclusions: ExpressionExclusion[] } {
  const open = new Map<string, WedgeEvent>()
  const spans: WedgeSpan[] = []
  const exclusions: ExpressionExclusion[] = []
  for (const event of events) {
    const key = laneKey(event.partId, event.staff, event.voice, event.number ?? 'default')
    if (event.type === 'crescendo' || event.type === 'diminuendo') {
      const previous = open.get(key)
      if (previous) exclusions.push({ id: `expression-exclusion:${stableHash(previous.id)}`, sourceId: previous.id, reason: 'A new wedge began before this wedge closed.', measureNumber: previous.measureNumber })
      open.set(key, event)
    } else if (event.type === 'stop') {
      const start = open.get(key)
      if (start && compareTime(event.position, start.position) > 0) spans.push({ start, end: event })
      else exclusions.push({ id: `expression-exclusion:${stableHash(event.id)}`, sourceId: event.id, reason: 'The wedge stop has no unambiguous earlier start in the same notation lane.', measureNumber: event.measureNumber })
      open.delete(key)
    }
  }
  for (const event of open.values()) exclusions.push({ id: `expression-exclusion:${stableHash(event.id)}`, sourceId: event.id, reason: 'The wedge has no unambiguous stop in the same notation lane.', measureNumber: event.measureNumber })
  return { spans, exclusions }
}

function trendSlope(observations: readonly MatchedPerformanceObservation[]): number | null {
  if (observations.length < 2) return null
  const positions = observations.map((observation) => timeToNumber(observation.scorePosition))
  const minimum = Math.min(...positions)
  const span = Math.max(...positions) - minimum
  if (span <= 0) return null
  const slopes: number[] = []
  for (let left = 0; left < observations.length - 1; left += 1) {
    for (let right = left + 1; right < observations.length; right += 1) {
      const run = (positions[right]! - positions[left]!) / span
      if (run > 0) slopes.push((observations[right]!.normalizedIntensity! - observations[left]!.normalizedIntensity!) / run)
    }
  }
  return median(slopes)
}

function directionalScore(change: number, expected: DynamicsDirection, strongScale = 0.35): number {
  const signed = change * (expected === 'increase' ? 1 : -1)
  return clamp01((signed + 0.04) / strongScale)
}

function metricReliability(
  alignment: AlignmentResult,
  noteGrading: NoteGradingResult,
  targetCount: number,
  observationCount: number,
  options: ExpressionAnalysisOptions,
): ExpressionReliability {
  if (!observationCount) return 'unavailable'
  if (alignment.status === 'ambiguous' || noteGrading.reliability === 'provisional') return 'provisional'
  if (noteGrading.scope.type === 'aligned-span') return 'limited'
  const ratio = observationCount / Math.max(1, targetCount)
  return observationCount >= options.reliableMinimumTargets && ratio >= options.reliableMinimumCoverage ? 'reliable' : 'limited'
}

function buildDynamics(
  score: NormalizedScore,
  alignment: AlignmentResult,
  noteGrading: NoteGradingResult,
  observations: readonly MatchedPerformanceObservation[],
  normalization: VelocityNormalizationDiagnostics,
  scope: ExpressionScope,
  options: ExpressionAnalysisOptions,
): DynamicsAnalysis {
  const selectedParts = new Set(noteGrading.expectedTargets.flatMap((target) => target.partIds))
  const dynamicEvents = score.dynamicEvents.filter((event) => selectedParts.has(event.partId) && scorePositionInScope(event.position, alignment, scope))
  const wedgeEvents = score.wedgeEvents.filter((event) => selectedParts.has(event.partId) && scorePositionInScope(event.position, alignment, scope))
  const pairedWedges = wedgeSpans(wedgeEvents)
  const targets: DynamicsTarget[] = []
  const exclusions: ExpressionExclusion[] = [...pairedWedges.exclusions]
  const dynamicLanes = new Map<string, DynamicEvent[]>()
  for (const event of dynamicEvents) {
    const key = laneKey(event.partId, event.staff, event.voice)
    const lane = dynamicLanes.get(key)
    if (lane) lane.push(event)
    else dynamicLanes.set(key, [event])
  }
  for (const lane of dynamicLanes.values()) {
    lane.sort((left, right) => compareTime(left.position, right.position) || left.id.localeCompare(right.id))
    if (lane.length === 1) exclusions.push({ id: `expression-exclusion:${stableHash(lane[0]!.id)}`, sourceId: lane[0]!.id, reason: 'An isolated dynamic marking has no relative contrast that MIDI velocity can grade honestly.', measureNumber: lane[0]!.measureNumber })
    for (let index = 1; index < lane.length; index += 1) {
      const from = lane[index - 1]!
      const to = lane[index]!
      const expectedDirection = direction(from.marking, to.marking)
      if (!expectedDirection) continue
      const overlapsWedge = pairedWedges.spans.some(({ start, end }) => notationLaneCompatible(start, to)
        && compareTime(start.position, from.position) <= 0 && compareTime(end.position, to.position) >= 0)
      if (overlapsWedge) {
        exclusions.push({ id: `expression-exclusion:${stableHash(`${from.id}|${to.id}`)}`, sourceId: to.id, reason: 'This dynamic transition is owned by an overlapping authored wedge to prevent double-counting.', measureNumber: to.measureNumber })
        continue
      }
      targets.push({
        id: `dynamics-target:${stableHash(`${from.id}|${to.id}`)}`, kind: 'dynamic-change', sourceEventIds: [from.id, to.id], expectedTargetIds: [],
        partId: to.partId, staff: to.staff, voice: to.voice, measureIndex: to.measureIndex, measureNumber: to.measureNumber,
        position: { ...from.position }, endPosition: { ...to.position }, expectedDirection, fromMarking: from.marking, toMarking: to.marking, emphasis: null,
      })
    }
  }
  for (const { start, end } of pairedWedges.spans) targets.push({
    id: `dynamics-target:${stableHash(`${start.id}|${end.id}`)}`, kind: 'wedge', sourceEventIds: [start.id, end.id], expectedTargetIds: [],
    partId: start.partId, staff: start.staff, voice: start.voice, measureIndex: start.measureIndex, measureNumber: start.measureNumber,
    position: { ...start.position }, endPosition: { ...end.position }, expectedDirection: start.type === 'crescendo' ? 'increase' : 'decrease',
    fromMarking: null, toMarking: null, emphasis: null,
  })

  const targetBySource = new Map(noteGrading.expectedTargets.flatMap((target) => target.sourceNoteIds.map((id) => [id, target] as const)))
  const accentGroups = new Map<string, { notes: NormalizedNote[]; target: ExpectedKeyTarget; partId: string }[]>()
  for (const part of score.parts.filter((part) => selectedParts.has(part.id))) for (const measure of part.measures) for (const event of measure.events) {
    if (event.type !== 'note' || !scorePositionInScope(event.absoluteOnset, alignment, scope)) continue
    const emphasis = event.articulations.includes('strong-accent') ? 'strong-accent' : event.articulations.includes('accent') ? 'accent' : null
    const target = targetBySource.get(event.id)
    if (!emphasis || !target) continue
    const key = `${target.onsetGroupId}|${part.id}`
    const group = accentGroups.get(key)
    const item = { notes: [event], target, partId: part.id }
    if (group) group.push(item)
    else accentGroups.set(key, [item])
  }
  for (const group of accentGroups.values()) {
    const emphases = new Set(group.flatMap((item) => item.notes.flatMap((note) => note.articulations.filter((mark) => mark === 'accent' || mark === 'strong-accent'))))
    const first = group[0]!
    if (emphases.size !== 1) {
      exclusions.push({ id: `expression-exclusion:${stableHash(first.target.id)}`, sourceId: first.target.id, reason: 'Collapsed simultaneous notation voices disagree about accent strength.', measureNumber: first.target.measureNumbers[0] ?? null })
      continue
    }
    const emphasis = [...emphases][0] as 'accent' | 'strong-accent'
    targets.push({
      id: `dynamics-target:${stableHash(`${first.target.onsetGroupId}|${emphasis}|${first.partId}`)}`, kind: 'accent',
      sourceEventIds: group.flatMap((item) => item.notes.map((note) => note.id)), expectedTargetIds: [...new Set(group.map((item) => item.target.id))],
      partId: first.partId,
      staff: new Set(group.map((item) => item.notes[0]!.staff)).size === 1 ? first.notes[0]!.staff : null,
      voice: new Set(group.map((item) => item.notes[0]!.voice)).size === 1 ? first.notes[0]!.voice : null,
      measureIndex: first.notes[0]!.measureIndex, measureNumber: first.notes[0]!.measureNumber, position: { ...first.notes[0]!.absoluteOnset }, endPosition: null,
      expectedDirection: 'increase', fromMarking: null, toMarking: null, emphasis,
    })
  }

  const allAccentExpectedTargetIds = new Set(targets
    .filter((target) => target.kind === 'accent')
    .flatMap((target) => target.expectedTargetIds))
  const dynamicsObservations: DynamicsObservation[] = []
  if (normalization.evidenceSufficient) for (const target of targets) {
    const lane = observations.filter((observation) => observation.normalizedIntensity !== null && observationInLane(observation, target.partId, target.staff, target.voice))
    if (target.kind === 'dynamic-change') {
      const before = lane.filter((item) => compareTime(item.scorePosition, target.position) >= 0 && compareTime(item.scorePosition, target.endPosition!) < 0).slice(-options.dynamicContextNotes)
      const after = lane.filter((item) => compareTime(item.scorePosition, target.endPosition!) >= 0).slice(0, options.dynamicContextNotes)
      if (before.length < options.minimumDynamicWindowNotes || after.length < options.minimumDynamicWindowNotes) {
        exclusions.push({ id: `expression-exclusion:${stableHash(`${target.id}|evidence`)}`, sourceId: target.id, reason: 'The dynamic change lacks enough correctly matched notes on both sides.', measureNumber: target.measureNumber })
        continue
      }
      const beforeMedian = median(before.map((item) => item.normalizedIntensity!))!
      const afterMedian = median(after.map((item) => item.normalizedIntensity!))!
      const change = afterMedian - beforeMedian
      const resultScore = directionalScore(change, target.expectedDirection)
      dynamicsObservations.push({ id: `dynamics-observation:${stableHash(target.id)}`, targetId: target.id, score: resultScore, matchedObservationIds: [...before, ...after].map((item) => item.id), beforeMedian, afterMedian, normalizedChange: change, trend: null, summary: resultScore >= 0.75 ? 'The authored dynamic contrast was clearly present.' : resultScore >= 0.4 ? 'The contrast was present but restrained.' : 'The authored dynamic direction was flat or reversed.' })
    } else if (target.kind === 'wedge') {
      const span = lane.filter((item) => compareTime(item.scorePosition, target.position) >= 0 && compareTime(item.scorePosition, target.endPosition!) <= 0)
      if (span.length < options.minimumWedgeNotes || new Set(span.map((item) => `${item.scorePosition.numerator}/${item.scorePosition.denominator}`)).size < 3) {
        exclusions.push({ id: `expression-exclusion:${stableHash(`${target.id}|evidence`)}`, sourceId: target.id, reason: 'The wedge needs at least four correct attacks across three score positions.', measureNumber: target.measureNumber })
        continue
      }
      const windowSize = Math.max(1, Math.ceil(span.length / 3))
      const beforeMedian = median(span.slice(0, windowSize).map((item) => item.normalizedIntensity!))!
      const afterMedian = median(span.slice(-windowSize).map((item) => item.normalizedIntensity!))!
      const change = afterMedian - beforeMedian
      const slope = trendSlope(span)!
      const endpointScore = directionalScore(change, target.expectedDirection)
      const trendScore = directionalScore(slope, target.expectedDirection, 0.8)
      const resultScore = clamp01(0.55 * endpointScore + 0.45 * trendScore)
      dynamicsObservations.push({ id: `dynamics-observation:${stableHash(target.id)}`, targetId: target.id, score: resultScore, matchedObservationIds: span.map((item) => item.id), beforeMedian, afterMedian, normalizedChange: change, trend: slope, summary: resultScore >= 0.75 ? 'The hairpin showed a convincing relative shape.' : resultScore >= 0.4 ? 'The hairpin moved in the expected direction with limited clarity.' : 'The hairpin was flat or moved against the authored direction.' })
    } else {
      const accented = lane.filter((item) => target.expectedTargetIds.includes(item.expectedTargetId))
      const nearby = lane.filter((item) => !allAccentExpectedTargetIds.has(item.expectedTargetId)).sort((left, right) => Math.abs(timeToNumber(subtractTime(left.scorePosition, target.position))) - Math.abs(timeToNumber(subtractTime(right.scorePosition, target.position)))).slice(0, options.dynamicContextNotes)
      if (!accented.length || nearby.length < options.minimumAccentBaselineNotes) {
        exclusions.push({ id: `expression-exclusion:${stableHash(`${target.id}|baseline`)}`, sourceId: target.id, reason: 'The accent lacks a correct attack or enough nearby non-accent notes in the same lane.', measureNumber: target.measureNumber })
        continue
      }
      const beforeMedian = median(nearby.map((item) => item.normalizedIntensity!))!
      const afterMedian = median(accented.map((item) => item.normalizedIntensity!))!
      const change = afterMedian - beforeMedian
      const resultScore = clamp01((change + 0.03) / (target.emphasis === 'strong-accent' ? 0.38 : 0.3))
      dynamicsObservations.push({ id: `dynamics-observation:${stableHash(target.id)}`, targetId: target.id, score: resultScore, matchedObservationIds: [...accented, ...nearby].map((item) => item.id), beforeMedian, afterMedian, normalizedChange: change, trend: null, summary: resultScore >= 0.75 ? 'The attack carried clear local emphasis.' : resultScore >= 0.4 ? 'The attack was only moderately emphasized.' : 'The authored accent had little local contrast.' })
    }
  }
  if (targets.length && !normalization.evidenceSufficient) exclusions.push({ id: `expression-exclusion:${stableHash('velocity-normalization')}`, sourceId: 'velocity-normalization', reason: 'Velocity evidence is too sparse or compressed for trustworthy relative dynamics.', measureNumber: null })
  const dynamicsCoverage = coverage(targets.length, dynamicsObservations.length)
  const resultScore = meanScore(dynamicsObservations.map((observation) => observation.score))
  const unavailableReason = !targets.length ? 'No supported authored dynamics are present in this grading scope.' : resultScore === null ? 'Supported dynamics exist, but the correct matched velocity evidence is insufficient.' : null
  const reliability = metricReliability(alignment, noteGrading, targets.length, dynamicsObservations.length, options)
  const warnings: ExpressionWarning[] = []
  if (!normalization.evidenceSufficient && targets.length) warnings.push({ code: 'LOW_VELOCITY_EVIDENCE', severity: 'warning', message: 'The performance did not provide enough robust velocity range for relative dynamics scoring.' })
  if (reliability === 'provisional') warnings.push({ code: 'PROVISIONAL_CORRESPONDENCE', severity: 'warning', message: 'Dynamics are provisional because the underlying note correspondence is ambiguous.' })
  return {
    status: unavailableReason ? 'unavailable' : 'ready', reliability, unavailableReason, score: resultScore, coverage: dynamicsCoverage,
    targets, observations: dynamicsObservations, exclusions, warnings,
    diagnostics: { normalization, explicitChangeCount: targets.filter((target) => target.kind === 'dynamic-change').length, wedgeCount: targets.filter((target) => target.kind === 'wedge').length, accentCount: targets.filter((target) => target.kind === 'accent').length },
  }
}

function inScopeExpectedResults(noteGrading: NoteGradingResult): ExpectedTargetResult[] {
  return noteGrading.expectedResults.filter((result) => result.kind !== 'unattempted' && result.kind !== 'excluded')
}

function sustainAt(recording: PerformanceRecording, channel: number, relativeMs: number): boolean {
  let down = false
  for (const item of recording.events) {
    if (item.relativeMs <= relativeMs && item.event.type === 'sustain' && item.event.channel === channel) down = item.event.down
  }
  return down
}

function gateScore(kind: Exclude<ArticulationTargetKind, 'legato-transition'>, ratio: number, options: ExpressionAnalysisOptions): number {
  if (kind === 'staccato') return ratio <= options.staccatoStrongGateRatio ? 1 : clamp01(1 - (ratio - options.staccatoStrongGateRatio) / (options.staccatoPoorGateRatio - options.staccatoStrongGateRatio))
  if (kind === 'staccatissimo') return ratio <= options.staccatissimoStrongGateRatio ? 1 : clamp01(1 - (ratio - options.staccatissimoStrongGateRatio) / (options.staccatissimoPoorGateRatio - options.staccatissimoStrongGateRatio))
  if (ratio < options.tenutoMinimumGateRatio) return clamp01((ratio - options.tenutoLowPoorGateRatio) / (options.tenutoMinimumGateRatio - options.tenutoLowPoorGateRatio))
  if (ratio <= options.tenutoMaximumStrongGateRatio) return 1
  return clamp01(1 - (ratio - options.tenutoMaximumStrongGateRatio) / (options.tenutoHighPoorGateRatio - options.tenutoMaximumStrongGateRatio))
}

function expectedTargetMap(noteGrading: NoteGradingResult): Map<string, ExpectedKeyTarget> {
  return new Map(inScopeExpectedResults(noteGrading).flatMap((result) => result.target.sourceNoteIds.map((sourceId) => [sourceId, result.target] as const)))
}

function buildArticulationTargets(score: NormalizedScore, noteGrading: NoteGradingResult): { targets: ArticulationTarget[]; exclusions: ExpressionExclusion[] } {
  const sourceTargets = expectedTargetMap(noteGrading)
  const included = new Set(noteGrading.expectedTargets.flatMap((target) => target.partIds))
  const targets: ArticulationTarget[] = []
  const exclusions: ExpressionExclusion[] = []
  const gateGroups = new Map<string, { kind: Exclude<ArticulationTargetKind, 'legato-transition'>; note: NormalizedNote; partId: string; target: ExpectedKeyTarget }[]>()
  const laneNotes: { note: NormalizedNote; partId: string; target: ExpectedKeyTarget }[] = []
  const noteById = new Map(score.parts.flatMap((part) => part.measures.flatMap((measure) => measure.events.flatMap((event) => event.type === 'note' ? [[event.id, event] as const] : []))))
  const conflictingTargets = new Set<string>()
  for (const result of inScopeExpectedResults(noteGrading)) {
    const kinds = new Set(result.target.sourceNoteIds.map((id) => {
      const note = noteById.get(id)
      const supported = note?.articulations.filter((mark) => mark === 'staccato' || mark === 'staccatissimo' || mark === 'tenuto') ?? []
      return supported.length === 1 ? supported[0]! : supported.length > 1 ? 'conflict' : 'none'
    }))
    if (kinds.has('conflict') || (kinds.size > 1 && [...kinds].some((kind) => kind !== 'none'))) {
      conflictingTargets.add(result.target.id)
      exclusions.push({ id: `expression-exclusion:${stableHash(`${result.target.id}|conflict`)}`, sourceId: result.target.id, reason: 'Notation sources collapsed to one physical key disagree about key articulation, or a tie chain carries an ambiguous articulation.', measureNumber: result.target.measureNumbers[0] ?? null })
    }
  }
  for (const part of score.parts.filter((part) => included.has(part.id))) for (const measure of part.measures) for (const event of measure.events) {
    if (event.type !== 'note') continue
    const target = sourceTargets.get(event.id)
    if (!target) continue
    laneNotes.push({ note: event, partId: part.id, target })
    if (conflictingTargets.has(target.id)) continue
    const marks = [...new Set(event.articulations.filter((mark): mark is Exclude<ArticulationTargetKind, 'legato-transition'> => mark === 'staccato' || mark === 'staccatissimo' || mark === 'tenuto'))]
    if (marks.length > 1) {
      exclusions.push({ id: `expression-exclusion:${stableHash(event.id)}`, sourceId: event.id, reason: 'This note has conflicting supported key-articulation instructions.', measureNumber: event.measureNumber })
      continue
    }
    if (!marks.length) continue
    const key = `${target.onsetGroupId}|${marks[0]}|${part.id}`
    const group = gateGroups.get(key)
    const item = { kind: marks[0]!, note: event, partId: part.id, target }
    if (group) group.push(item)
    else gateGroups.set(key, [item])
  }
  for (const group of gateGroups.values()) {
    const first = group[0]!
    targets.push({
      id: `articulation-target:${stableHash(`${first.target.onsetGroupId}|${first.kind}|${first.partId}`)}`, kind: first.kind,
      sourceNoteIds: [...new Set(group.map((item) => item.note.id))], expectedTargetIds: [...new Set(group.map((item) => item.target.id))],
      partId: first.partId,
      staff: new Set(group.map((item) => item.note.staff)).size === 1 ? first.note.staff : null,
      voice: new Set(group.map((item) => item.note.voice)).size === 1 ? first.note.voice : null,
      measureIndex: first.note.measureIndex, measureNumber: first.note.measureNumber,
      position: { ...first.note.absoluteOnset }, nextPosition: null, repeatedPitch: false,
    })
  }

  laneNotes.sort((left, right) => compareTime(left.note.absoluteOnset, right.note.absoluteOnset) || left.note.xmlOrder - right.note.xmlOrder || left.note.id.localeCompare(right.note.id))
  const active = new Map<string, typeof laneNotes[number]>()
  for (const current of laneNotes) {
    const slurs = current.note.slurs
    if ((current.note.staff === null || current.note.voice === null || current.note.chordId !== null) && slurs.length) {
      exclusions.push({ id: `expression-exclusion:${stableHash(`${current.note.id}|slur-lane`)}`, sourceId: current.note.id, reason: 'This slur lacks one unambiguous non-chord part/staff/voice lane.', measureNumber: current.note.measureNumber })
      continue
    }
    const numbers = new Set(slurs.map((slur) => slur.number ?? '1'))
    if (numbers.size > 1) {
      exclusions.push({ id: `expression-exclusion:${stableHash(`${current.note.id}|slur`)}`, sourceId: current.note.id, reason: 'Multiple simultaneous slur numbers make transition ownership ambiguous.', measureNumber: current.note.measureNumber })
      continue
    }
    const lanePrefix = laneKey(current.partId, current.note.staff, current.note.voice)
    const activeInLane = [...active.entries()].filter(([key]) => key.startsWith(lanePrefix))
    if (activeInLane.length > 1 || (activeInLane.length && current.note.chordId !== null)) {
      exclusions.push({ id: `expression-exclusion:${stableHash(`${current.note.id}|active-slur`)}`, sourceId: current.note.id, reason: 'Overlapping slurs or chord membership make the next connected voice ambiguous.', measureNumber: current.note.measureNumber })
      continue
    }
    for (const [key, previous] of activeInLane) if (previous.target.id !== current.target.id) {
      if (compareTime(current.note.absoluteOnset, previous.note.absoluteOnset) <= 0) {
        exclusions.push({ id: `expression-exclusion:${stableHash(`${previous.note.id}|${current.note.id}`)}`, sourceId: current.note.id, reason: 'A chord or non-forward slur transition cannot be assigned to one melodic lane safely.', measureNumber: current.note.measureNumber })
      } else {
        targets.push({
          id: `articulation-target:${stableHash(`${previous.note.id}|${current.note.id}|${key}`)}`, kind: 'legato-transition',
          sourceNoteIds: [previous.note.id, current.note.id], expectedTargetIds: [previous.target.id, current.target.id],
          partId: current.partId, staff: current.note.staff, voice: current.note.voice, measureIndex: current.note.measureIndex, measureNumber: current.note.measureNumber,
          position: { ...previous.note.absoluteOnset }, nextPosition: { ...current.note.absoluteOnset }, repeatedPitch: previous.target.midi === current.target.midi,
        })
      }
      active.set(key, current)
    }
    for (const slur of slurs) {
      const key = laneKey(current.partId, current.note.staff, current.note.voice, slur.number ?? '1')
      if (slur.type === 'stop') active.delete(key)
      else active.set(key, current)
    }
  }
  return { targets, exclusions }
}

function buildArticulation(
  score: NormalizedScore,
  plan: ExpectedPerformancePlan,
  recording: PerformanceRecording,
  alignment: AlignmentResult,
  noteGrading: NoteGradingResult,
  observations: readonly MatchedPerformanceObservation[],
  options: ExpressionAnalysisOptions,
): ArticulationAnalysis {
  const built = buildArticulationTargets(score, noteGrading)
  const byTarget = new Map(observations.map((observation) => [observation.expectedTargetId, observation]))
  const keyPresses = new Map(recording.keyPresses.map((press) => [press.id, press]))
  const articulationObservations: ArticulationObservation[] = []
  let missingReleaseCount = 0
  for (const target of built.targets) {
    const matched = target.expectedTargetIds.flatMap((id) => {
      const observation = byTarget.get(id)
      return observation ? [observation] : []
    })
    if (matched.length !== target.expectedTargetIds.length) {
      built.exclusions.push({ id: `expression-exclusion:${stableHash(`${target.id}|incomplete-evidence`)}`, sourceId: target.id, reason: 'This articulation target lacks complete correct key-release evidence.', measureNumber: target.measureNumber })
      continue
    }
    if (target.kind !== 'legato-transition') {
      const scored: { observation: MatchedPerformanceObservation; keyPress: RecordedKeyPress; nominal: number; ratio: number; score: number }[] = []
      let incompleteReason: string | null = null
      for (const observation of matched) {
        if (new Set(observation.expectedDurations.map((duration) => `${duration.numerator}/${duration.denominator}`)).size > 1) {
          incompleteReason = 'Collapsed simultaneous notation voices disagree about expected physical key duration.'
          continue
        }
        const keyPress = keyPresses.get(observation.recordedKeyPressId)
        if (!keyPress || keyPress.releaseMs === null) {
          if (keyPress?.releaseMs === null) missingReleaseCount += 1
          incompleteReason = 'This articulation target lacks complete correct key-release evidence.'
          continue
        }
        const reference = durationBetweenScorePositionsToMilliseconds(observation.scorePosition, addTime(observation.scorePosition, observation.expectedDuration), plan.tempoTimeline, alignment.practiceSpeedMultiplier)
        const nominal = reference * alignment.timeTransform.scale
        if (nominal <= 0) {
          incompleteReason = 'This articulation target has no safe positive nominal duration.'
          continue
        }
        const ratio = (keyPress.releaseMs - keyPress.attackMs) / nominal
        scored.push({ observation, keyPress, nominal, ratio, score: gateScore(target.kind, ratio, options) })
      }
      if (incompleteReason || scored.length !== target.expectedTargetIds.length) {
        built.exclusions.push({ id: `expression-exclusion:${stableHash(`${target.id}|incomplete-evidence`)}`, sourceId: target.id, reason: incompleteReason ?? 'This articulation target lacks complete correct key-release evidence.', measureNumber: target.measureNumber })
        continue
      }
      const resultScore = median(scored.map((item) => item.score))!
      const gateRatio = median(scored.map((item) => item.ratio))!
      const nominal = median(scored.map((item) => item.nominal))!
      const duration = median(scored.map((item) => item.keyPress.releaseMs! - item.keyPress.attackMs))!
      const pedalAffected = scored.some((item) => sustainAt(recording, item.keyPress.channel, item.keyPress.releaseMs!))
      articulationObservations.push({ id: `articulation-observation:${stableHash(target.id)}`, targetId: target.id, score: resultScore, matchedObservationIds: scored.map((item) => item.observation.id), keyDownDurationMs: duration, predictedNominalDurationMs: nominal, gateRatio, transitionGapMs: null, transitionToleranceMs: null, pedalAffected, summary: resultScore >= 0.75 ? 'The physical key duration matched the authored articulation.' : resultScore >= 0.4 ? 'The key duration was near the intended articulation range.' : 'The physical key duration contrasted with the authored articulation.' })
    } else {
      const current = matched[0]!
      const next = matched[1]!
      const currentPress = keyPresses.get(current.recordedKeyPressId)
      const nextPress = keyPresses.get(next.recordedKeyPressId)
      if (!currentPress || !nextPress || currentPress.releaseMs === null || !target.nextPosition) {
        if (currentPress?.releaseMs === null) missingReleaseCount += 1
        built.exclusions.push({ id: `expression-exclusion:${stableHash(`${target.id}|incomplete-evidence`)}`, sourceId: target.id, reason: 'This legato transition lacks complete correct attack and physical-release evidence.', measureNumber: target.measureNumber })
        continue
      }
      const expectedIoi = durationBetweenScorePositionsToMilliseconds(target.position, target.nextPosition, plan.tempoTimeline, alignment.practiceSpeedMultiplier) * alignment.timeTransform.scale
      if (expectedIoi <= 0) continue
      const tolerance = Math.max(options.legatoMinimumToleranceMs, expectedIoi * options.legatoRelativeTolerance)
      const gap = nextPress.attackMs - currentPress.releaseMs
      const resultScore = target.repeatedPitch
        ? gap < 0 ? clamp01(1 + gap / tolerance) : clamp01(1 - Math.max(0, gap - tolerance) / (3 * tolerance))
        : gap <= tolerance ? 1 : clamp01(1 - (gap - tolerance) / (3 * tolerance))
      const pedalAffected = sustainAt(recording, currentPress.channel, currentPress.releaseMs) || sustainAt(recording, nextPress.channel, nextPress.attackMs)
      articulationObservations.push({ id: `articulation-observation:${stableHash(target.id)}`, targetId: target.id, score: resultScore, matchedObservationIds: matched.map((item) => item.id), keyDownDurationMs: null, predictedNominalDurationMs: expectedIoi, gateRatio: null, transitionGapMs: gap, transitionToleranceMs: tolerance, pedalAffected, summary: resultScore >= 0.75 ? target.repeatedPitch ? 'The repeated pitch used a short, controlled re-articulation.' : 'The physical key transition remained connected.' : resultScore >= 0.4 ? 'The transition had a small audible-risk separation.' : 'The physical key transition opened beyond the tempo-aware tolerance.' })
    }
  }
  const articulationCoverage = coverage(built.targets.length, articulationObservations.length)
  const resultScore = meanScore(articulationObservations.map((observation) => observation.score))
  const unavailableReason = !built.targets.length ? 'No supported authored key-articulation targets are present in this grading scope.' : resultScore === null ? 'Supported articulation exists, but correct matched attacks and key releases are insufficient.' : null
  const pedalAffectedCount = articulationObservations.filter((observation) => observation.pedalAffected).length
  let reliability = metricReliability(alignment, noteGrading, built.targets.length, articulationObservations.length, options)
  if (reliability === 'reliable' && pedalAffectedCount > 0) reliability = 'limited'
  const warnings: ExpressionWarning[] = []
  if (missingReleaseCount) warnings.push({ code: 'MISSING_KEY_RELEASE', severity: 'info', message: `${missingReleaseCount} physical key${missingReleaseCount === 1 ? '' : 's'} required by articulation targets lacked a release and were not scored.` })
  if (pedalAffectedCount) warnings.push({ code: 'PEDAL_AFFECTED', severity: 'info', message: 'Sustain was active around some physical key releases. Pedal may change the audible articulation and is not graded in Phase 9.' })
  if (reliability === 'provisional') warnings.push({ code: 'PROVISIONAL_CORRESPONDENCE', severity: 'warning', message: 'Articulation is provisional because the underlying note correspondence is ambiguous.' })
  return {
    status: unavailableReason ? 'unavailable' : 'ready', reliability, unavailableReason, score: resultScore, coverage: articulationCoverage,
    targets: built.targets, observations: articulationObservations, exclusions: built.exclusions, warnings,
    diagnostics: { gateTargetCount: built.targets.filter((target) => target.kind !== 'legato-transition').length, legatoTargetCount: built.targets.filter((target) => target.kind === 'legato-transition').length, missingReleaseCount, pedalAffectedCount },
  }
}

function emptyDynamics(reason: string): DynamicsAnalysis {
  return { status: 'unavailable', reliability: 'unavailable', unavailableReason: reason, score: null, coverage: coverage(0, 0), targets: [], observations: [], exclusions: [], warnings: [], diagnostics: { normalization: { method: 'attempt-scope-q10-q90', sampleCount: 0, uniqueVelocityCount: 0, rawMinimum: null, rawMaximum: null, median: null, q10: null, q90: null, robustRange: null, evidenceSufficient: false }, explicitChangeCount: 0, wedgeCount: 0, accentCount: 0 } }
}

function emptyArticulation(reason: string): ArticulationAnalysis {
  return { status: 'unavailable', reliability: 'unavailable', unavailableReason: reason, score: null, coverage: coverage(0, 0), targets: [], observations: [], exclusions: [], warnings: [], diagnostics: { gateTargetCount: 0, legatoTargetCount: 0, missingReleaseCount: 0, pedalAffectedCount: 0 } }
}

export function analyzeExpression({ normalizedScore, expectedPlan, recording, alignment, noteGrading, options: partialOptions = {} }: AnalyzeExpressionInput): ExpressionAnalysisResult {
  const options = resolveExpressionAnalysisOptions(partialOptions)
  const scope = scopeCopy(noteGrading)
  const includedPartsMatch = expectedPlan.includedPartIds.length === recording.practiceContext.includedPartIds?.length
    && [...expectedPlan.includedPartIds].sort().every((id, index) => id === [...(recording.practiceContext.includedPartIds ?? [])].sort()[index])
  const inputMatches = normalizedScore.id === expectedPlan.scoreId
    && alignment.expectedPlanId === expectedPlan.id && noteGrading.expectedPlanId === expectedPlan.id
    && alignment.recordingId === recording.id && noteGrading.recordingId === recording.id
    && noteGrading.alignmentId === alignment.id && includedPartsMatch
  const unavailableReason = !inputMatches
    ? 'The score, plan, recording, alignment, note grading, or included-part identities do not describe the same take.'
    : alignment.status === 'failed' || alignment.status === 'insufficient-data' || noteGrading.status === 'unavailable'
      ? 'The underlying correspondence is unavailable, so expression cannot be mapped safely.'
      : null
  const warnings: ExpressionWarning[] = unavailableReason ? [{ code: inputMatches ? 'ALIGNMENT_UNAVAILABLE' : 'INPUT_ID_MISMATCH', severity: 'warning', message: unavailableReason }] : []
  const rawMatches = unavailableReason ? [] : buildMatchedObservations(expectedPlan, recording, alignment, noteGrading)
  const normalized = normalizeVelocities(rawMatches, options)
  const dynamics = unavailableReason ? emptyDynamics(unavailableReason) : buildDynamics(normalizedScore, alignment, noteGrading, normalized.observations, normalized.diagnostics, scope, options)
  const articulation = unavailableReason ? emptyArticulation(unavailableReason) : buildArticulation(normalizedScore, expectedPlan, recording, alignment, noteGrading, normalized.observations, options)
  const result: ExpressionAnalysisResult = {
    id: `expression-analysis:${stableHash(JSON.stringify({ scoreId: normalizedScore.id, planId: expectedPlan.id, recordingId: recording.id, alignmentId: alignment.id, noteGradingId: noteGrading.id, scope, version: EXPRESSION_ANALYSIS_ENGINE_VERSION, options }))}`,
    status: unavailableReason ? 'unavailable' : 'ready', unavailableReason, scoreId: normalizedScore.id, expectedPlanId: expectedPlan.id,
    recordingId: recording.id, alignmentId: alignment.id, noteGradingId: noteGrading.id, scope,
    matchedObservations: normalized.observations, dynamics, articulation, warnings,
    diagnostics: {
      expressionAnalysisEngineVersion: EXPRESSION_ANALYSIS_ENGINE_VERSION,
      musicXmlParserVersion: MUSICXML_PARSER_VERSION,
      alignmentEngineVersion: alignment.diagnostics.alignmentEngineVersion,
      noteGradingEngineVersion: noteGrading.diagnostics.noteGradingEngineVersion,
      correctlyMatchedObservationCount: normalized.observations.length,
    },
  }
  return deepFreeze(result)
}
