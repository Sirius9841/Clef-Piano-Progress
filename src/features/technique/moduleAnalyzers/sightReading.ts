import { continuityObservations, facet, pitchObservations, type ModuleAnalysis, type TechniqueAnalyzerContext } from './shared'
export function analyzeSightReading(context: TechniqueAnalyzerContext): ModuleAnalysis {
  const pitch = pitchObservations(context, 'note-accuracy', () => true), continuity = continuityObservations(context)
  const evidenceContext = context.novelty.firstSavedAttempt ? 'first-pass' as const : 'repeat-practice' as const
  return { observations: [...pitch, ...continuity], findings: [], facets: [
    facet(context, { id: 'note-accuracy', family: 'pitch', context: evidenceContext, observations: pitch, eligibleCount: context.exercise.events.length, minimumEvidence: context.options.minimumNoteEvents, summary: context.novelty.firstSavedAttempt ? 'Pitch accuracy from the first saved encounter with this exact instance.' : 'Pitch accuracy from repeat practice; no first-pass novelty claim.' }),
    facet(context, { id: 'pulse-continuity', family: 'continuity', context: evidenceContext, observations: continuity, eligibleCount: Math.max(0, context.exercise.events.length - 1), minimumEvidence: context.options.minimumRhythmIntervals, summary: context.novelty.firstSavedAttempt ? 'Hesitation-focused continuity from the first saved encounter.' : 'Hesitation-focused continuity from repeat practice.' }),
  ] }
}
