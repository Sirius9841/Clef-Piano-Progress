import { TECHNIQUE_MODULES } from '../features/technique/catalog'
import type { PracticeRecommendation } from '../features/practice-planning'

const kindLabels: Readonly<Record<PracticeRecommendation['kind'], string>> = {
  'focus-section': 'Focus section', 'verify-section': 'Verify section', 'increase-speed': 'Advance speed', 'hold-speed': 'Hold speed', 'reduce-speed': 'Reduce speed',
  'widen-scope': 'Widen context', 'full-run': 'Full run', 'technique-drill': 'Technique target', 'refresh-technique-evidence': 'Refresh Technique evidence',
}

const reasonLabels: Readonly<Record<PracticeRecommendation['reasons'][number]['code'], string>> = {
  'single-session-section-weakness': 'One recent session indicates a section worth checking.',
  'supported-section-weakness': 'Independent recent sessions support this section weakness.',
  'strong-section-control-at-speed': 'Notes, Rhythm, and Tempo show repeated control at this exact speed.',
  'supported-section-weakness-at-speed': 'Repeated evidence supports a weakness at the current speed frontier.',
  'frontier-needs-verification': 'A higher attempted speed needs another trustworthy take before progression.',
  'mastery-needs-repetition': 'Current full-score evidence needs independent repetition.',
  'mastery-needs-current-support': 'The current-score evidence needs a more recent full run.',
  'supported-technique-opportunity': 'Independent Technique evidence suggests a transferable exercise opportunity; it is not claimed as the cause of a repertoire issue.',
  'technique-evidence-needs-refresh': 'Technique evidence is too old or limited to establish a current state.',
}

export function recommendationWhat(recommendation: PracticeRecommendation): string {
  if (recommendation.target.type === 'section') return `${kindLabels[recommendation.kind]} · ${recommendation.target.section.displayRange}`
  if (recommendation.target.type === 'technique') {
    const moduleId = recommendation.target.moduleId
    return `${kindLabels[recommendation.kind]} · ${TECHNIQUE_MODULES.find((module) => module.id === moduleId)?.name ?? moduleId}`
  }
  return kindLabels[recommendation.kind]
}

export function recommendationWhy(recommendation: PracticeRecommendation): string {
  return recommendation.reasons[0] ? reasonLabels[recommendation.reasons[0].code] : 'Current qualified evidence supports this next action.'
}
