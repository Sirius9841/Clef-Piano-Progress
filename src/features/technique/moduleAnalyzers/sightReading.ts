import { continuityObservations, facet, pitchObservations, type ModuleAnalysis, type TechniqueAnalyzerContext } from './shared'
import { attemptedEventCount, attemptedTransitionCount } from '../prepareEvidence'
export function analyzeSightReading(context: TechniqueAnalyzerContext): ModuleAnalysis {
  const pitch = pitchObservations(context, 'note-accuracy', () => true), continuity = continuityObservations(context)
  const evidenceContext = context.novelty.firstSavedAttempt ? 'first-pass' as const : 'repeat-practice' as const
  return { observations: [...pitch, ...continuity], findings: [], facets: [
    facet(context, { id: 'note-accuracy', family: 'pitch', context: evidenceContext, observations: pitch, eligibleCount: attemptedEventCount(context.evidence), minimumEvidence: context.options.minimumNoteEvents, summary: context.novelty.firstSavedAttempt ? 'Pitch accuracy from the attempted span of the first saved encounter with this exact instance.' : 'Pitch accuracy from the attempted span of repeat practice; no first-pass novelty claim.' }),
    facet(context, { id: 'pulse-continuity', family: 'continuity', context: evidenceContext, observations: continuity, eligibleCount: attemptedTransitionCount(context.evidence), minimumEvidence: context.options.minimumRhythmIntervals, summary: context.novelty.firstSavedAttempt ? 'Hesitation-focused continuity over attempted transitions in the first saved encounter.' : 'Hesitation-focused continuity over attempted transitions in repeat practice.' }),
  ] }
}
