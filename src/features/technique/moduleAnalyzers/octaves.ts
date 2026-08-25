import { centeredIntervalScores } from '../prepareEvidence'
import { facet, intervalObservation, pitchObservations, type ModuleAnalysis, type TechniqueAnalyzerContext } from './shared'
export function analyzeOctaves(context: TechniqueAnalyzerContext): ModuleAnalysis {
  const pitch = pitchObservations(context, 'octave-integrity', () => true), centered = centeredIntervalScores(context.evidence.intervals, context.options.evennessLogTolerance)
  const evenness = centered.map((item) => intervalObservation('onset-evenness', { ...item, value: item.centeredRatio }, 'median-centered-interval', 'ratio', 'Attempt-local repetition interval consistency; no anatomical technique is inferred.'))
  return { observations: [...pitch, ...evenness], findings: [], facets: [facet(context, { id: 'octave-integrity', family: 'pitch', observations: pitch, eligibleCount: context.exercise.events.length, minimumEvidence: context.options.minimumNoteEvents, summary: 'Each complete authored octave pair is one vote.' }), facet(context, { id: 'onset-evenness', family: 'interval-precision', observations: evenness, eligibleCount: Math.max(0, context.exercise.events.length - 1), minimumEvidence: context.options.minimumEvennessIntervals, summary: 'Median-centered spacing across correct octave-pair repetitions.' })] }
}
