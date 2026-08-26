import { clamp01 } from '../../timing-analysis/math'
import type { GroupNoteResult } from '../../note-grading/types'
import type { TechniqueAnalysisOptions } from '../options'
import type { PreparedTechniqueEvidence } from '../prepareEvidence'
import type { TechniqueEvidenceContext, TechniqueEvidenceFamily, TechniqueExerciseSnapshotV2, TechniqueFacetId, TechniqueFacetResultV2, TechniqueNovelty, TechniqueObservationV2, TechniqueReliability } from '../types'

export interface TechniqueAnalyzerContext { readonly exercise: TechniqueExerciseSnapshotV2; readonly evidence: PreparedTechniqueEvidence; readonly novelty: TechniqueNovelty; readonly provisional: boolean; readonly options: TechniqueAnalysisOptions; readonly timingAnalysis: import('../../timing-analysis/types').TimingAnalysisResult }
export interface ModuleAnalysis { readonly facets: readonly TechniqueFacetResultV2[]; readonly observations: readonly TechniqueObservationV2[]; readonly findings: readonly string[] }
export const FACET_LABELS: Readonly<Record<TechniqueFacetId, string>> = { 'note-accuracy': 'Note accuracy', 'rhythm-precision': 'Rhythm precision', 'pulse-continuity': 'Pulse continuity', 'onset-evenness': 'Onset evenness', 'chord-accuracy': 'Chord accuracy', 'chord-synchronization': 'Chord synchronization', 'arpeggio-transition-consistency': 'Arpeggio transition consistency', 'direction-change-continuity': 'Direction-change continuity', 'octave-integrity': 'Octave integrity', 'landing-accuracy': 'Landing accuracy', 'jump-timing-consistency': 'Jump timing consistency', 'recovery-continuity': 'Recovery continuity', 'target-tempo-control': 'Target-tempo control', 'tempo-stability': 'Tempo stability', 'tempo-transition-control': 'Tempo-transition control' }

export function mean(values: readonly number[]): number | null { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null }
export function eventScore(result: GroupNoteResult | null): number | null { if (!result) return null; if (result.classification === 'perfect') return 100; if (result.classification === 'partial' || result.classification === 'wrong-only' || result.classification === 'missed-group') return 0; return null }
export function observationId(facetId: TechniqueFacetId, source: string): string { return `technique-observation:${facetId}:${source}` }
export function facet(context: TechniqueAnalyzerContext, input: { id: TechniqueFacetId; family: TechniqueEvidenceFamily; observations: readonly TechniqueObservationV2[]; eligibleCount: number; minimumEvidence: number; summary: string; context?: TechniqueEvidenceContext; allowLowCompletion?: boolean; reliabilityCap?: 'limited' }): TechniqueFacetResultV2 {
  const score = mean(input.observations.map((item) => item.score)), enough = input.observations.length >= input.minimumEvidence && (input.allowLowCompletion || context.evidence.completion.completeEnoughForEvidence)
  const status = enough && score !== null ? 'ready' as const : 'unavailable' as const
  const coverage = input.eligibleCount === 0 ? 0 : clamp01(input.observations.length / input.eligibleCount)
  let reliability: TechniqueReliability = 'unavailable'
  if (status === 'ready') reliability = context.provisional ? 'provisional' : input.reliabilityCap === 'limited' || input.observations.length < input.minimumEvidence * 2 || context.evidence.completion.eventCoverageRatio < context.options.reliableCoverageRatio || coverage < context.options.minimumReliableFacetCoverage ? 'limited' : 'reliable'
  return { id: input.id, label: FACET_LABELS[input.id], status, score: status === 'ready' ? Math.round(clamp01(score! / 100) * 1000) / 10 : null, reliability,
    evidenceCount: input.observations.length, eligibleCount: input.eligibleCount, coverage,
    evidenceFamily: input.family, evidenceContext: input.context ?? 'technical-drill', observationIds: input.observations.map((item) => item.id), minimumEvidence: input.minimumEvidence,
    summary: status === 'ready' ? input.summary : `Unavailable: ${input.observations.length}/${input.minimumEvidence} trustworthy observations; ${Math.round(context.evidence.completion.eventCoverageRatio * 100)}% actual event coverage.`, challengeEvidence: context.exercise.challenge }
}
export function pitchObservations(context: TechniqueAnalyzerContext, facetId: TechniqueFacetId, selector: (eventIndex: number) => boolean): TechniqueObservationV2[] {
  return context.evidence.eventGroups.filter((entry) => entry.participation === 'attempted' && selector(entry.index)).flatMap((entry) => { const score = eventScore(entry.noteResult); if (score === null) return []; return [{ id: observationId(facetId, entry.eventId), facetId, expectedEventIds: [entry.eventId], expectedGroupIds: [entry.expectedGroupId], performedGroupIds: entry.performedGroupId ? [entry.performedGroupId] : [], sourceTimingObservationIds: [], sourceNoteResultIds: entry.noteResult?.expectedResultIds ?? [], score, value: score === 100 ? 1 : 0, unit: 'count' as const, method: 'event-pitch' as const, summary: score === 100 ? 'The authored event was complete and pitch-correct.' : 'The authored event contained a wrong or missed physical-key target.' }] })
}
export function intervalObservation(facetId: TechniqueFacetId, item: { evidence: import('../types').TechniqueIntervalEvidence; score: number; value: number }, method: TechniqueObservationV2['method'], unit: TechniqueObservationV2['unit'], summary: string): TechniqueObservationV2 {
  const e = item.evidence; return { id: observationId(facetId, e.timingObservationId), facetId, expectedEventIds: [e.previousEventId, e.currentEventId], expectedGroupIds: [e.previousExpectedGroupId, e.currentExpectedGroupId], performedGroupIds: [e.previousPerformedGroupId, e.currentPerformedGroupId], sourceTimingObservationIds: [e.timingObservationId], sourceNoteResultIds: e.sourceNoteResultIds, score: clamp01(item.score / 100) * 100, value: item.value, unit, method, summary }
}
export function continuityObservations(context: TechniqueAnalyzerContext, intervals = context.evidence.intervals): TechniqueObservationV2[] {
  const logs = intervals.map((item) => item.logRatio).sort((left, right) => left - right), center = logs.length ? logs[Math.floor(logs.length / 2)]! : 0
  return intervals.map((evidence) => {
    const centeredRatio = Math.exp(evidence.logRatio - center), grace = context.options.pulseExpansionGraceRatio, extreme = context.options.pulseExtremePauseRatio
    const score = centeredRatio <= grace ? 100 : 100 * clamp01(1 - (centeredRatio - grace) / (extreme - grace))
    return intervalObservation('pulse-continuity', { evidence, score, value: centeredRatio }, 'hesitation-expansion', 'ratio', 'Expansion beyond the attempt-local technical pulse reduces continuity; compressed intervals are not mislabeled as hesitation.')
  })
}
