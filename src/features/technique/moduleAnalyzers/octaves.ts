import { attemptedEventCount, attemptedTransitionCount, centeredIntervalScores } from '../prepareEvidence'
import { facet, intervalObservation, pitchObservations, type ModuleAnalysis, type TechniqueAnalyzerContext } from './shared'
export function analyzeOctaves(context: TechniqueAnalyzerContext): ModuleAnalysis {
  const pitch = pitchObservations(context, 'octave-integrity', () => true), centered = centeredIntervalScores(context.evidence.intervals, context.options.evennessLogTolerance)
  const evenness = centered.map((item) => intervalObservation('onset-evenness', { ...item, value: item.centeredRatio }, 'median-centered-interval', 'ratio', 'Attempt-local repetition interval consistency; no anatomical technique is inferred.'))
  return { observations: [...pitch, ...evenness], findings: [], facets: [facet(context, { id: 'octave-integrity', family: 'pitch', observations: pitch, eligibleCount: attemptedEventCount(context.evidence), minimumEvidence: context.options.minimumNoteEvents, summary: 'Each attempted authored octave pair is one vote.' }), facet(context, { id: 'onset-evenness', family: 'interval-precision', observations: evenness, eligibleCount: attemptedTransitionCount(context.evidence), minimumEvidence: context.options.minimumEvennessIntervals, summary: 'Median-centered spacing across trustworthy observations from attempted octave transitions.' })] }
}
