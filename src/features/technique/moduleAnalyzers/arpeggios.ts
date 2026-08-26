import { attemptedEventCount, attemptedTransitionCount, centeredIntervalScores } from '../prepareEvidence'
import { facet, intervalObservation, pitchObservations, mean, type ModuleAnalysis, type TechniqueAnalyzerContext } from './shared'
export function analyzeArpeggios(context: TechniqueAnalyzerContext): ModuleAnalysis {
  const pitch = pitchObservations(context, 'note-accuracy', () => true), centered = centeredIntervalScores(context.evidence.intervals, context.options.evennessLogTolerance)
  const transitions = centered.map((item) => intervalObservation('arpeggio-transition-consistency', { ...item, value: item.centeredRatio }, 'median-centered-interval', 'ratio', item.evidence.transitionKind === 'register-boundary' ? 'Normalized inter-note transition across an octave/register boundary.' : 'Normalized inter-note transition within the generated arpeggio.'))
  const boundaries = transitions.filter((_, index) => centered[index]?.evidence.transitionKind === 'register-boundary'), findings = mean(boundaries.map((item) => item.score)) !== null && mean(boundaries.map((item) => item.score))! < context.options.weakFindingScore ? ['Transitions across octave boundaries were less consistent in this take.'] : []
  return { observations: [...pitch, ...transitions], findings, facets: [
    facet(context, { id: 'note-accuracy', family: 'pitch', observations: pitch, eligibleCount: attemptedEventCount(context.evidence), minimumEvidence: context.options.minimumNoteEvents, summary: 'One attempted authored arpeggio event is one pitch vote.' }),
    facet(context, { id: 'arpeggio-transition-consistency', family: 'interval-precision', observations: transitions, eligibleCount: attemptedTransitionCount(context.evidence), minimumEvidence: context.options.minimumEvennessIntervals, summary: 'Median-centered consistency across trustworthy observations from attempted broken-chord transitions, including identified register boundaries.' }),
  ] }
}
