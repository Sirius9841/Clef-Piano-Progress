import { centeredIntervalScores } from '../prepareEvidence'
import { facet, intervalObservation, pitchObservations, mean, type ModuleAnalysis, type TechniqueAnalyzerContext } from './shared'
export function analyzeScales(context: TechniqueAnalyzerContext): ModuleAnalysis {
  const pitch = pitchObservations(context, 'note-accuracy', () => true)
  const centered = centeredIntervalScores(context.evidence.intervals, context.options.evennessLogTolerance)
  const evenness = centered.map((item) => intervalObservation('onset-evenness', { ...item, value: item.centeredRatio }, 'median-centered-interval', 'ratio', 'Inter-note ratio centered on this scale attempt, so global speed offset is removed.'))
  const turnIndex = context.exercise.events.findIndex((event) => event.role === 'turn')
  const turn = centered.filter((item) => { const current = context.exercise.events.findIndex((event) => event.id === item.evidence.currentEventId); return turnIndex >= 0 && current >= turnIndex && current <= turnIndex + context.options.turnNeighborhoodRadius }).map((item) => intervalObservation('direction-change-continuity', { ...item, value: item.centeredRatio }, 'turn-neighborhood', 'ratio', 'Transition in the deterministic neighborhood of the actual scale direction change.'))
  const findings = mean(turn.map((item) => item.score)) !== null && mean(turn.map((item) => item.score))! < context.options.weakFindingScore ? ['Timing changed noticeably around the authored scale direction change.'] : []
  return { observations: [...pitch, ...evenness, ...turn], findings, facets: [
    facet(context, { id: 'note-accuracy', family: 'pitch', observations: pitch, eligibleCount: context.exercise.events.length, minimumEvidence: context.options.minimumNoteEvents, summary: 'One authored scale event is one pitch vote.' }),
    facet(context, { id: 'onset-evenness', family: 'interval-precision', observations: evenness, eligibleCount: Math.max(0, context.exercise.events.length - 1), minimumEvidence: context.options.minimumEvennessIntervals, summary: 'Median-centered consistency across all safe consecutive scale transitions.' }),
    facet(context, { id: 'direction-change-continuity', family: 'continuity', observations: turn, eligibleCount: turnIndex < 0 ? 0 : 2, minimumEvidence: 2, reliabilityCap: 'limited', allowLowCompletion: false, summary: 'Only the transition into and out of the actual scale turning event.' }),
  ] }
}
