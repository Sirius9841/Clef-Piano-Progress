import { compareTime, type MusicalTime } from '../musicxml/musicalTime'
import type { InterpretationProfile, InterpretationProfileInput } from './types'

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T { if (value === null || typeof value !== 'object' || seen.has(value)) return value; seen.add(value); Object.values(value as Record<string, unknown>).forEach((child) => deepFreeze(child, seen)); return Object.freeze(value) }
function median(values: readonly number[]): number | null { if (!values.length) return null; const sorted = [...values].sort((a, b) => a - b); const i = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[i]! : (sorted[i - 1]! + sorted[i]!) / 2 }
function timeKey(value: MusicalTime): string { return `${value.numerator}/${value.denominator}` }

export function buildInterpretationProfile(input: InterpretationProfileInput): InterpretationProfile {
  const scopeSource = input.timingAnalysis.scope
  const groupById = new Map(input.expectedGroupPositions.map((group) => [group.id, group.position]))
  const first = input.expectedGroupPositions[0]?.position ?? null
  const last = input.expectedGroupPositions.at(-1)?.position ?? null
  const start = scopeSource.type === 'full-plan' ? first : scopeSource.expectedStartGroupId ? groupById.get(scopeSource.expectedStartGroupId) ?? null : null
  const end = scopeSource.type === 'full-plan' ? last : scopeSource.expectedEndGroupId ? groupById.get(scopeSource.expectedEndGroupId) ?? null : null
  const ratios = input.timingAnalysis.tempo.localSamples.map((sample) => sample.tempoRatio).filter((value) => value > 0)
  const center = median(ratios.map(Math.log))
  const tempoShape = center === null ? [] : input.timingAnalysis.tempo.localSamples.filter((sample) => sample.tempoRatio > 0).map((sample) => ({ key: `${timeKey(sample.position)}:${timeKey(sample.windowScoreDuration)}`, position: { ...sample.position }, measureNumbers: [...sample.measureNumbers], centeredLogShape: Math.log(sample.tempoRatio) - center, performedQuarterBpm: sample.performedQuarterBpm }))
  const expression = input.expressionAnalysis
  const dynamicsGestures = expression ? expression.dynamics.observations.flatMap((observation) => {
    const target = expression.dynamics.targets.find((candidate) => candidate.id === observation.targetId)
    const value = observation.normalizedChange ?? observation.trend
    return target && value !== null ? [{ key: `${target.kind}:${[...target.sourceEventIds].sort().join('|')}`, position: { ...target.position }, measureNumber: target.measureNumber, kind: target.kind, value }] : []
  }) : null
  const articulationGestures = expression ? expression.articulation.observations.flatMap((observation) => {
    const target = expression.articulation.targets.find((candidate) => candidate.id === observation.targetId)
    const value = observation.gateRatio ?? (observation.transitionGapMs !== null && observation.transitionToleranceMs ? observation.transitionGapMs / observation.transitionToleranceMs : null)
    return target && value !== null ? [{ key: `${target.kind}:${[...target.sourceNoteIds].sort().join('|')}`, position: { ...target.position }, measureNumber: target.measureNumber, kind: target.kind, value }] : []
  }) : null
  const pedal = input.pedalAnalysis
  const pedalGestures = pedal ? pedal.observations.flatMap((observation) => {
    const target = pedal.targets.flatMap((phrase) => phrase.events).find((candidate) => candidate.id === observation.targetEventId)
    return target && observation.timingErrorMs !== null ? [{ key: `${target.kind}:${target.sourceEventId}`, position: { ...target.position }, measureNumber: target.measureNumber, kind: target.kind, relativeTimingMs: observation.timingErrorMs, engineVersion: pedal.diagnostics.pedalAnalysisEngineVersion }] : []
  }) : null
  const voicing = input.voicingAnalysis
  const voicingGestures = voicing ? voicing.observations.map((observation) => {
    const target = voicing.targets.find((candidate) => candidate.id === observation.targetId)!
    return { key: `${timeKey(target.position)}:${[...target.foregroundLaneIds].sort().join(',')}:${[...target.supportLaneIds].sort().join(',')}:${[...target.sourceNoteIds].sort().join(',')}`, position: { ...target.position }, measureNumber: target.measureNumber, focusAdvantage: observation.focusAdvantage }
  }) : null
  const profile: InterpretationProfile = {
    attemptId: input.attemptId, arrangementId: input.arrangementId, scoreVersionId: input.scoreVersionId, includedPartIds: [...input.includedPartIds].sort(), performedAt: input.performedAt, practiceSpeed: input.practiceSpeed, schemaVersion: input.schemaVersion, recordingId: input.recordingId,
    scope: { type: scopeSource.type, start: start ? { ...start } : null, end: end ? { ...end } : null, expectedStartGroupId: scopeSource.expectedStartGroupId, expectedEndGroupId: scopeSource.expectedEndGroupId },
    tempoShape: tempoShape.sort((a, b) => compareTime(a.position, b.position) || a.key.localeCompare(b.key)), dynamicsGestures, articulationGestures, pedalGestures, voicingGestures,
    reliability: { tempo: input.timingAnalysis.reliability, dynamics: expression?.dynamics.reliability ?? null, articulation: expression?.articulation.reliability ?? null, pedal: pedal?.reliability ?? null, voicing: voicing?.reliability ?? null },
    evidenceVersions: { ...input.engineVersions },
  }
  return deepFreeze(profile)
}
