import type { AlignmentResult } from '../alignment/types'
import type { ExpectedNoteAttack, ExpectedPerformancePlan } from '../expected-performance/types'
import type { ExpressionAnalysisResult, MatchedPerformanceObservation } from '../expression-analysis/types'
import { compareTime, type MusicalTime } from '../musicxml/musicalTime'
import type { DynamicEvent, NormalizedNote, NormalizedScore, WedgeEvent } from '../musicxml/types'
import type { NoteGradingResult } from '../note-grading/types'
import type { PerformanceRecording } from '../performance/types'
import { resolveVoicingAnalysisOptions, VOICING_ANALYSIS_ENGINE_VERSION, type VoicingAnalysisOptions } from './options'
import type { VoiceLane, VoicingAnalysisResult, VoicingExclusion, VoicingIntentProfile, VoicingObservation, VoicingTarget } from './types'
import { buildVoiceLanes, voiceLaneId } from './voiceLanes'
import { validateVoicingIntentProfile } from './voicingIntent'

export interface AnalyzeVoicingInput {
  readonly normalizedScore: NormalizedScore
  readonly scoreVersionId: string
  readonly expectedPlan: ExpectedPerformancePlan
  readonly recording: PerformanceRecording
  readonly alignment: AlignmentResult
  readonly noteGrading: NoteGradingResult
  readonly expressionAnalysis: ExpressionAnalysisResult
  readonly intentProfile: VoicingIntentProfile | null
  readonly options?: Partial<VoicingAnalysisOptions>
}

function stableHash(value: string): string { let hash = 0x811c9dc5; for (let i = 0; i < value.length; i += 1) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 0x01000193) } return (hash >>> 0).toString(16).padStart(8, '0') }
function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T { if (value === null || typeof value !== 'object' || seen.has(value)) return value; seen.add(value); Object.values(value as Record<string, unknown>).forEach((child) => deepFreeze(child, seen)); return Object.freeze(value) }
function median(values: readonly number[]): number | null { if (!values.length) return null; const sorted = [...values].sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2 }
function timeKey(time: MusicalTime): string { return `${time.numerator}/${time.denominator}` }
function mean(values: readonly number[]): number | null { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null }

function laneForAttack(attack: ExpectedNoteAttack): string { return voiceLaneId(attack.partId, attack.staff, attack.voice) }
function ordinal(marking: DynamicEvent['marking']): number { return ['ppp', 'pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff'].indexOf(marking) }
function laneMatches(item: { partId: string; staff: number | null; voice: string | null }, lane: VoiceLane): boolean { return item.partId === lane.partId && (item.staff === null || item.staff === lane.staff) && (item.voice === null || item.voice === lane.voice) }

function activeSpecificDynamic(events: readonly DynamicEvent[], lane: VoiceLane, position: MusicalTime): DynamicEvent | null {
  return events.filter((event) => (event.staff !== null || event.voice !== null) && laneMatches(event, lane) && compareTime(event.position, position) <= 0)
    .sort((a, b) => compareTime(a.position, b.position) || a.id.localeCompare(b.id)).at(-1) ?? null
}

function activeSpecificWedge(events: readonly WedgeEvent[], lane: VoiceLane, position: MusicalTime): boolean {
  const relevant = events.filter((event) => (event.staff !== null || event.voice !== null) && laneMatches(event, lane) && compareTime(event.position, position) <= 0)
    .sort((a, b) => compareTime(a.position, b.position) || a.id.localeCompare(b.id))
  const active = new Map<string, boolean>()
  for (const event of relevant) active.set(event.number ?? 'default', event.type !== 'stop')
  return [...active.values()].some(Boolean)
}

function buildNoteMap(score: NormalizedScore): Map<string, NormalizedNote> {
  const map = new Map<string, NormalizedNote>()
  score.parts.forEach((part) => part.measures.forEach((measure) => measure.events.forEach((event) => { if (event.type === 'note') map.set(event.id, event) })))
  return map
}

function projectionScore(advantage: number, options: VoicingAnalysisOptions): number {
  if (advantage <= options.poorAdvantage) return 0
  if (advantage >= options.clearAdvantage) return 1
  if (advantage < 0) return 0.5 * (advantage - options.poorAdvantage) / -options.poorAdvantage
  return 0.5 + 0.5 * advantage / options.clearAdvantage
}

export function analyzeVoicing(input: AnalyzeVoicingInput): VoicingAnalysisResult {
  const options = resolveVoicingAnalysisOptions(input.options)
  const { normalizedScore: score, expectedPlan: plan, recording, alignment, noteGrading: note, expressionAnalysis: expression, intentProfile: intent } = input
  const lanes = buildVoiceLanes(score, plan.includedPartIds)
  const scope = { type: note.scope.type, expectedStartIndex: note.scope.expectedStartIndex, expectedEndIndex: note.scope.expectedEndIndex, expectedStartGroupId: note.scope.expectedStartGroupId, expectedEndGroupId: note.scope.expectedEndGroupId }
  const identityMismatch = score.id !== plan.scoreId || recording.id !== expression.recordingId || expression.expectedPlanId !== plan.id || expression.alignmentId !== alignment.id || expression.noteGradingId !== note.id
  const intentErrors = intent ? validateVoicingIntentProfile(intent, lanes, input.scoreVersionId) : []
  const observationByTarget = new Map(expression.matchedObservations.map((item) => [item.expectedTargetId, item]))
  const laneStatistics = lanes.map((lane) => {
    const samples = expression.matchedObservations.filter((observation) => observation.normalizedIntensity !== null && observation.partIds.includes(lane.partId) && observation.staffs.includes(lane.staff!) && observation.voices.includes(lane.voice!)).map((item) => item.normalizedIntensity!)
    return { laneId: lane.id, sampleCount: samples.length, medianNormalizedIntensity: median(samples) }
  })
  const base = { scoreId: score.id, scoreVersionId: input.scoreVersionId, expectedPlanId: plan.id, recordingId: recording.id, alignmentId: alignment.id, noteGradingId: note.id, expressionAnalysisId: expression.id, scope, lanes, laneStatistics }
  const finish = (partial: Omit<VoicingAnalysisResult, keyof typeof base | 'id' | 'diagnostics'>): VoicingAnalysisResult => deepFreeze({
    id: `voicing-analysis:${stableHash(JSON.stringify({ score: score.id, version: input.scoreVersionId, recording: recording.id, note: note.id, expression: expression.id, intent, engine: VOICING_ANALYSIS_ENGINE_VERSION, options }))}`,
    ...base, ...partial,
    diagnostics: { voicingAnalysisEngineVersion: VOICING_ANALYSIS_ENGINE_VERSION, normalizationMethod: expression.dynamics.diagnostics.normalization.method, configuredRegionCount: intent?.regions.length ?? 0, targetCount: partial.targets.length, analyzedTargetCount: partial.observations.length },
  })
  if (identityMismatch || intentErrors.length) return finish({ status: 'unavailable', mode: intent ? 'configured' : 'descriptive', score: null, reliability: 'unavailable', unavailableReason: identityMismatch ? 'The Voicing inputs do not describe the same take.' : intentErrors.join(' '), intentProfileSnapshot: intent, targets: [], observations: [], regionResults: [], coverage: { configuredTargetCount: 0, analyzedTargetCount: 0, ratio: null }, exclusions: [], warnings: intentErrors.map((message) => ({ code: 'INVALID_VOICING_INTENT', message })) })
  if (!intent) return finish({ status: 'ready', mode: 'descriptive', score: null, reliability: expression.status === 'unavailable' ? 'unavailable' : 'limited', unavailableReason: 'Configure foreground and support voices to enable projection scoring.', intentProfileSnapshot: null, targets: [], observations: [], regionResults: [], coverage: { configuredTargetCount: 0, analyzedTargetCount: 0, ratio: null }, exclusions: [], warnings: [] })

  const attackById = new Map(plan.attacks.map((attack) => [attack.id, attack]))
  const laneById = new Map(lanes.map((lane) => [lane.id, lane]))
  const noteById = buildNoteMap(score)
  const eligibleResults = note.expectedResults.filter((result) => result.kind !== 'unattempted' && result.kind !== 'excluded')
  const targets: VoicingTarget[] = []
  const exclusions: VoicingExclusion[] = []
  for (const region of intent.regions) {
    const byOnset = new Map<string, typeof eligibleResults>()
    for (const result of eligibleResults) {
      const measureIndex = Math.min(...result.target.measureIndices)
      if (measureIndex < region.startMeasureIndex || measureIndex > region.endMeasureIndex) continue
      const group = byOnset.get(timeKey(result.target.scorePosition)) ?? []
      byOnset.set(timeKey(result.target.scorePosition), [...group, result])
    }
    for (const results of byOnset.values()) {
      const foreground: string[] = []; const support: string[] = []; const sourceNoteIds = new Set<string>(); let ambiguous = false
      for (const result of results) {
        const targetLaneIds = new Set(result.target.sourceExpectedAttackIds.flatMap((id) => { const attack = attackById.get(id); return attack ? [laneForAttack(attack)] : [] }))
        const isForeground = [...targetLaneIds].some((id) => region.foregroundLaneIds.includes(id))
        const isSupport = [...targetLaneIds].some((id) => region.supportLaneIds.includes(id))
        if (isForeground && isSupport) ambiguous = true
        else if (isForeground) foreground.push(result.target.id)
        else if (isSupport) support.push(result.target.id)
        if (isForeground || isSupport) result.target.sourceNoteIds.forEach((id) => sourceNoteIds.add(id))
      }
      if (!foreground.length || !support.length) continue
      const first = results[0]!.target
      const sourceId = `${region.id}:${timeKey(first.scorePosition)}`
      const foregroundLanes = region.foregroundLaneIds.map((id) => laneById.get(id)!).filter(Boolean)
      const supportLanes = region.supportLaneIds.map((id) => laneById.get(id)!).filter(Boolean)
      const foregroundDynamics = foregroundLanes.map((lane) => activeSpecificDynamic(score.dynamicEvents, lane, first.scorePosition)).filter((event): event is DynamicEvent => event !== null)
      const supportDynamics = supportLanes.map((lane) => activeSpecificDynamic(score.dynamicEvents, lane, first.scorePosition)).filter((event): event is DynamicEvent => event !== null)
      const dynamicConflict = foregroundDynamics.length > 0 && supportDynamics.length > 0 && Math.max(...foregroundDynamics.map((event) => ordinal(event.marking))) < Math.min(...supportDynamics.map((event) => ordinal(event.marking)))
      const foregroundAccent = foreground.some((id) => results.find((result) => result.target.id === id)!.target.sourceNoteIds.some((source) => noteById.get(source)?.articulations.some((item) => item === 'accent' || item === 'strong-accent')))
      const supportAccent = support.some((id) => results.find((result) => result.target.id === id)!.target.sourceNoteIds.some((source) => noteById.get(source)?.articulations.some((item) => item === 'accent' || item === 'strong-accent')))
      const foregroundWedge = foregroundLanes.some((lane) => activeSpecificWedge(score.wedgeEvents, lane, first.scorePosition))
      const supportWedge = supportLanes.some((lane) => activeSpecificWedge(score.wedgeEvents, lane, first.scorePosition))
      if (ambiguous || dynamicConflict || foregroundAccent !== supportAccent || foregroundWedge !== supportWedge) {
        const reason = ambiguous ? 'One physical key carries both foreground and support provenance.' : dynamicConflict ? 'Lane-specific authored dynamics conflict with simple foreground projection.' : foregroundAccent !== supportAccent ? 'Asymmetric authored accent emphasis belongs to Dynamics.' : 'A lane-specific wedge makes generic relative projection ambiguous.'
        exclusions.push({ id: `voicing-exclusion:${stableHash(`${sourceId}:${reason}`)}`, sourceId, measureNumber: first.measureNumbers[0] ?? null, reason }); continue
      }
      targets.push({ id: `voicing-target:${stableHash(sourceId)}`, regionId: region.id, position: { ...first.scorePosition }, measureIndex: Math.min(...first.measureIndices), measureNumber: first.measureNumbers[0] ?? String(Math.min(...first.measureIndices) + 1), foregroundLaneIds: [...region.foregroundLaneIds], supportLaneIds: [...region.supportLaneIds], foregroundExpectedTargetIds: foreground.sort(), supportExpectedTargetIds: support.sort(), sourceNoteIds: [...sourceNoteIds].sort() })
    }
  }
  targets.sort((a, b) => compareTime(a.position, b.position) || a.regionId.localeCompare(b.regionId) || a.id.localeCompare(b.id))
  const observations: VoicingObservation[] = []
  for (const target of targets) {
    const foreground = target.foregroundExpectedTargetIds.map((id) => observationByTarget.get(id)).filter((item): item is MatchedPerformanceObservation => item !== undefined)
    const support = target.supportExpectedTargetIds.map((id) => observationByTarget.get(id)).filter((item): item is MatchedPerformanceObservation => item !== undefined)
    if (foreground.length !== target.foregroundExpectedTargetIds.length || support.length !== target.supportExpectedTargetIds.length || [...foreground, ...support].some((item) => item.normalizedIntensity === null)) continue
    const foregroundIntensity = median(foreground.map((item) => item.normalizedIntensity!))!
    const supportIntensity = median(support.map((item) => item.normalizedIntensity!))!
    const focusAdvantage = foregroundIntensity - supportIntensity
    const scoreValue = projectionScore(focusAdvantage, options)
    observations.push({ id: `voicing-observation:${stableHash(target.id)}`, targetId: target.id, regionId: target.regionId, position: { ...target.position }, measureIndex: target.measureIndex, measureNumber: target.measureNumber, foregroundObservationIds: foreground.map((item) => item.id), supportObservationIds: support.map((item) => item.id), foregroundIntensity, supportIntensity, focusAdvantage, score: scoreValue, summary: focusAdvantage >= options.clearAdvantage ? 'The configured foreground remained clearly projected.' : focusAdvantage <= options.poorAdvantage ? 'Support attacks overtook the configured foreground.' : 'Foreground and support remained relatively balanced.' })
  }
  const scoreValue = mean(observations.map((item) => item.score))
  const ratio = targets.length ? observations.length / targets.length : null
  const reliability = scoreValue === null ? 'unavailable' : alignment.status !== 'aligned' || note.reliability === 'provisional' ? 'provisional' : note.scope.type === 'aligned-span' || observations.length < options.reliableMinimumTargets || (ratio ?? 0) < options.reliableMinimumCoverage ? 'limited' : 'reliable'
  const regionResults = intent.regions.map((region) => { const regionTargets = targets.filter((target) => target.regionId === region.id); const regionObservations = observations.filter((item) => item.regionId === region.id); return { regionId: region.id, targetCount: regionTargets.length, analyzedTargetCount: regionObservations.length, score: mean(regionObservations.map((item) => item.score)) } })
  return finish({ status: scoreValue === null ? 'unavailable' : 'ready', mode: 'configured', score: scoreValue, reliability, unavailableReason: scoreValue === null ? targets.length ? 'Configured events lack complete correct-note normalized velocity evidence.' : 'No simultaneous foreground/support events are eligible in the configured regions.' : null, intentProfileSnapshot: intent, targets, observations, regionResults, coverage: { configuredTargetCount: targets.length, analyzedTargetCount: observations.length, ratio }, exclusions, warnings: expression.dynamics.diagnostics.normalization.evidenceSufficient ? [] : [{ code: 'NORMALIZATION_UNAVAILABLE', message: 'Attempt-wide velocity evidence is insufficient for scored Voicing.' }] })
}
