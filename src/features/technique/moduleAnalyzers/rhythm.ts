import { continuityObservations, facet, intervalObservation, type ModuleAnalysis, type TechniqueAnalyzerContext } from './shared'
import { attemptedTransitionCount } from '../prepareEvidence'
export function analyzeRhythm(context: TechniqueAnalyzerContext): ModuleAnalysis {
  const precision = context.evidence.intervals.map((evidence) => intervalObservation('rhythm-precision', { evidence, score: 100 * (1 - evidence.rhythmLoss), value: evidence.ratio }, 'rhythm-loss', 'ratio', 'Symmetric authored-interval precision; compression and expansion can both reduce the score.'))
  const continuity = continuityObservations(context)
  return { observations: [...precision, ...continuity], findings: [], facets: [
    facet(context, { id: 'rhythm-precision', family: 'interval-precision', observations: precision, eligibleCount: attemptedTransitionCount(context.evidence), minimumEvidence: context.options.minimumRhythmIntervals, summary: 'Arithmetic mean of trustworthy observations over attempted authored rhythmic intervals.' }),
    facet(context, { id: 'pulse-continuity', family: 'continuity', observations: continuity, eligibleCount: attemptedTransitionCount(context.evidence), minimumEvidence: context.options.minimumRhythmIntervals, summary: 'Hesitation-focused evidence over attempted transitions after attempt-local tempo centering.' }),
  ] }
}
