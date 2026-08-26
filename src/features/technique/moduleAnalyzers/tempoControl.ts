import { clamp01, median } from '../../timing-analysis/math'
import { facet, observationId, type ModuleAnalysis, type TechniqueAnalyzerContext } from './shared'
import type { LocalTempoSample } from '../../timing-analysis/types'
import type { TechniqueObservationV2, TechniqueTempoOpportunity } from '../types'

interface MappedTempoSample { readonly opportunity: TechniqueTempoOpportunity; readonly sample: LocalTempoSample }

function opportunityKey(startExpectedGroupId: string, endExpectedGroupId: string): string { return `${startExpectedGroupId}\u0000${endExpectedGroupId}` }
function tempoObservation(facetId: TechniqueObservationV2['facetId'], mapped: MappedTempoSample, score: number, value: number, method: TechniqueObservationV2['method'], summary: string): TechniqueObservationV2 {
  const { opportunity, sample } = mapped
  return { id: observationId(facetId, opportunity.id), facetId, expectedEventIds: [opportunity.startEventId, opportunity.endEventId], expectedGroupIds: [opportunity.startExpectedGroupId, opportunity.endExpectedGroupId], performedGroupIds: [], sourceTimingObservationIds: [sample.id], sourceNoteResultIds: [], score, value, unit: 'ratio', method, summary }
}
export function analyzeTempoControl(context: TechniqueAnalyzerContext): ModuleAnalysis {
  const opportunities = context.evidence.tempoOpportunities
  const opportunitiesByKey = new Map(opportunities.map((opportunity) => [opportunityKey(opportunity.startExpectedGroupId, opportunity.endExpectedGroupId), opportunity]))
  const mapped = context.timingAnalysis.tempo.localSamples.flatMap((sample): readonly MappedTempoSample[] => {
    const opportunity = opportunitiesByKey.get(opportunityKey(sample.startExpectedGroupId, sample.endExpectedGroupId))
    return opportunity ? [{ opportunity, sample }] : []
  })
  const samplesByOpportunityId = new Map(mapped.map((item) => [item.opportunity.id, item.sample]))
  const target = mapped.map((item) => { const error = Math.abs(Math.log(item.sample.tempoRatio)); const score = 100 * clamp01(1 - error / context.options.tempoTargetLogTolerance); return tempoObservation('target-tempo-control', item, score, item.sample.tempoRatio, 'target-tempo-ratio', 'Local performed tempo against its authored numeric target.') })
  const center = median(mapped.map((item) => Math.log(item.sample.tempoRatio))) ?? 0
  const stability = mapped.map((item) => { const centered = Math.log(item.sample.tempoRatio) - center; const score = 100 * clamp01(1 - Math.abs(centered) / context.options.tempoStabilityLogTolerance); return tempoObservation('tempo-stability', item, score, Math.exp(centered), 'local-tempo-stability', 'Variation around the player’s own attempt-local technical tempo.') })
  const transition: TechniqueObservationV2[] = []
  let transitionOpportunityCount = 0
  for (let index = 1; index < opportunities.length; index += 1) {
    const previousOpportunity = opportunities[index - 1]!, currentOpportunity = opportunities[index]!
    const targetDelta = Math.log(currentOpportunity.targetQuarterBpm / previousOpportunity.targetQuarterBpm)
    if (Math.abs(targetDelta) < context.options.minimumAuthoredTempoDelta) continue
    transitionOpportunityCount += 1
    const previous = samplesByOpportunityId.get(previousOpportunity.id), current = samplesByOpportunityId.get(currentOpportunity.id)
    if (!previous || !current) continue
    const performedDelta = Math.log(current.performedQuarterBpm / previous.performedQuarterBpm)
    const score = 100 * clamp01(1 - Math.abs(performedDelta - targetDelta) / context.options.tempoTrajectoryLogTolerance)
    transition.push({ id: observationId('tempo-transition-control', `${previousOpportunity.id}:${currentOpportunity.id}`), facetId: 'tempo-transition-control', expectedEventIds: [previousOpportunity.startEventId, previousOpportunity.endEventId, currentOpportunity.endEventId], expectedGroupIds: [previousOpportunity.startExpectedGroupId, previousOpportunity.endExpectedGroupId, currentOpportunity.endExpectedGroupId], performedGroupIds: [], sourceTimingObservationIds: [previous.id, current.id], sourceNoteResultIds: [], score, value: performedDelta - targetDelta, unit: 'log-ratio', method: 'authored-tempo-trajectory', summary: 'Performed local tempo change compared with the actual authored numeric progression.' })
  }
  return { observations: [...target, ...stability, ...transition], findings: [], facets: [facet(context, { id: 'target-tempo-control', family: 'tempo', observations: target, eligibleCount: opportunities.length, minimumEvidence: context.options.minimumTempoSamples, summary: 'Accuracy against requested numeric tempo; steady but off-target playing can score lower.' }), facet(context, { id: 'tempo-stability', family: 'tempo', observations: stability, eligibleCount: opportunities.length, minimumEvidence: context.options.minimumTempoStabilitySamples, summary: 'Variation around the performed local tempo, independent of target accuracy.' }), facet(context, { id: 'tempo-transition-control', family: 'tempo', observations: transition, eligibleCount: transitionOpportunityCount, minimumEvidence: context.options.minimumTempoTransitionSamples, summary: 'Agreement between performed and authored local numeric tempo progression; never the overall Tempo score.' })] }
}
