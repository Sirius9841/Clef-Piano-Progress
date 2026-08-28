import type { PracticePresentationIntent } from './PracticeSessionContext'

export function practiceIntentLabel(intent: PracticePresentationIntent): string {
  if (intent.type === 'section') return intent.section.displayRange
  if (intent.type === 'full-run') return 'Full score'
  if (intent.type === 'wider-context') return 'Wider score context'
  return 'Current arrangement'
}
