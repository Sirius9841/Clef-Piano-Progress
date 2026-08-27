import type { PracticePlanningOptions } from './options'
import type { FullRunDurationEvidence, PracticeRecommendation, PracticeSessionBlockKind, PracticeSessionPlan, PracticeSessionPlanBlock } from './types'

function blockKind(recommendation: PracticeRecommendation, sectionIndex: number): PracticeSessionBlockKind {
  if (recommendation.target.type === 'technique') return 'technique-target'
  if (recommendation.kind === 'full-run') return 'full-run'
  if (recommendation.kind === 'widen-scope') return 'wider-context'
  return sectionIndex === 0 ? 'primary-section' : 'secondary-section'
}

function minimumMinutes(recommendation: PracticeRecommendation, fullRun: FullRunDurationEvidence, options: PracticePlanningOptions): number | null {
  if (recommendation.kind === 'full-run') return fullRun.estimatedMinutes
  return options.minimumNonRunBlockMinutes
}

export function composePracticeSessionPlan(
  recommendations: readonly PracticeRecommendation[],
  availableMinutes: number,
  fullRun: FullRunDurationEvidence,
  options: PracticePlanningOptions,
): PracticeSessionPlan {
  if (!Number.isInteger(availableMinutes) || availableMinutes <= 0) throw new RangeError('Session-plan availableMinutes must be a positive integer.')
  const selected: { recommendation: PracticeRecommendation; minutes: number }[] = []
  let committed = 0
  for (const recommendation of recommendations) {
    if (selected.length >= options.maximumSessionPlanBlocks) break
    const minimum = minimumMinutes(recommendation, fullRun, options)
    if (minimum === null || minimum <= 0 || committed + minimum > availableMinutes) continue
    selected.push({ recommendation, minutes: minimum })
    committed += minimum
  }
  if (selected.length > 0) {
    let remainder = availableMinutes - committed
    const weightedOrder = selected.flatMap((item, index) => item.recommendation.kind === 'full-run' ? [] : Array.from({ length: Math.max(1, selected.length - index) }, () => index))
    let cursor = 0
    while (remainder > 0 && weightedOrder.length > 0) {
      const index = weightedOrder[cursor % weightedOrder.length]!
      selected[index]!.minutes += 1
      remainder -= 1
      cursor += 1
    }
  }
  let sectionIndex = 0
  const blocks: PracticeSessionPlanBlock[] = selected.map(({ recommendation, minutes }, index) => {
    const kind = blockKind(recommendation, sectionIndex)
    if (recommendation.target.type === 'section') sectionIndex += 1
    return { order: index + 1, kind, suggestedMinutes: minutes, recommendationId: recommendation.id, target: recommendation.target }
  })
  return {
    availableMinutes,
    totalSuggestedMinutes: blocks.reduce((sum, block) => sum + block.suggestedMinutes, 0),
    blocks,
    heuristic: 'product-heuristic-not-universal-pedagogy',
  }
}
