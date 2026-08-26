import { facet, observationId, pitchObservations, mean, type ModuleAnalysis, type TechniqueAnalyzerContext } from './shared'
import type { TechniqueObservationV2 } from '../types'
import { attemptedEventCount } from '../prepareEvidence'
export function analyzeChords(context: TechniqueAnalyzerContext): ModuleAnalysis {
  const accuracy = pitchObservations(context, 'chord-accuracy', () => true)
  const complete = new Set(context.evidence.eventGroups.filter((entry) => entry.participation === 'attempted' && entry.noteResult?.classification === 'perfect').map((entry) => entry.expectedGroupId))
  const synchronization: TechniqueObservationV2[] = context.timingAnalysis.rhythm.chordSpreadDiagnostics.filter((item) => complete.has(item.expectedGroupId)).map((item) => {
    const score = item.spreadMs <= context.options.chordTightSpreadMs ? 100 : 100 * Math.max(0, 1 - (item.spreadMs - context.options.chordTightSpreadMs) / (context.options.chordMaximumSpreadMs - context.options.chordTightSpreadMs))
    const event = context.evidence.eventGroups.find((entry) => entry.expectedGroupId === item.expectedGroupId)
    return { id: observationId('chord-synchronization', item.id), facetId: 'chord-synchronization', expectedEventIds: event ? [event.eventId] : [], expectedGroupIds: [item.expectedGroupId], performedGroupIds: [item.performedGroupId], sourceTimingObservationIds: [item.id], sourceNoteResultIds: event?.noteResult?.expectedResultIds ?? [], score, value: item.spreadMs, unit: 'milliseconds', method: 'chord-spread', summary: 'Attack spread for one complete correct chord; chord size does not change its weight.' }
  })
  const widest = synchronization.reduce<TechniqueObservationV2 | null>((current, item) => !current || item.value > current.value ? item : current, null)
  return { observations: [...accuracy, ...synchronization], findings: widest && mean(synchronization.map((item) => item.score))! < context.options.chordFindingScore ? [`The widest complete-chord attack spread was ${Math.round(widest.value)} ms.`] : [], facets: [
    facet(context, { id: 'chord-accuracy', family: 'pitch', observations: accuracy, eligibleCount: attemptedEventCount(context.evidence), minimumEvidence: context.options.minimumChordEvents, summary: 'One attempted authored chord event is one complete-or-incomplete accuracy vote.' }),
    facet(context, { id: 'chord-synchronization', family: 'synchronization', observations: synchronization, eligibleCount: attemptedEventCount(context.evidence), minimumEvidence: context.options.minimumChordSynchronizationEvents, summary: 'Trustworthy complete-chord spread observations divided by attempted authored chords, independent of chord size.' }),
  ] }
}
