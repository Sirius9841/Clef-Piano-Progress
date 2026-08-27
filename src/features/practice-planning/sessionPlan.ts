import type { PracticePlanningOptions } from './options'
import type { FullRunDurationEvidence, PracticeRecommendation, PracticeSessionBlockKind, PracticeSessionPlan, PracticeSessionPlanBlock } from './types'
import { deepFreeze } from './utils'

interface PlanCandidate {
  readonly recommendations: PracticeRecommendation[]
}

function groupRecommendations(recommendations: readonly PracticeRecommendation[]): readonly PlanCandidate[] {
  const groups: PlanCandidate[] = []
  const sectionGroups = new Map<string, PlanCandidate>()
  for (const recommendation of recommendations) {
    if (recommendation.target.type !== 'section') {
      groups.push({ recommendations: [recommendation] })
      continue
    }
    const existing = sectionGroups.get(recommendation.target.section.id)
    if (existing) {
      existing.recommendations.push(recommendation)
      continue
    }
    const created = { recommendations: [recommendation] }
    sectionGroups.set(recommendation.target.section.id, created)
    groups.push(created)
  }
  return groups
}

function blockKind(candidate: PlanCandidate, sectionIndex: number): PracticeSessionBlockKind {
  const recommendation = candidate.recommendations[0]!
  if (recommendation.target.type === 'technique') return 'technique-target'
  if (recommendation.kind === 'full-run') return 'full-run'
  if (recommendation.kind === 'widen-scope') return 'wider-context'
  return sectionIndex === 0 ? 'primary-section' : 'secondary-section'
}

function minimumMinutes(candidate: PlanCandidate, fullRun: FullRunDurationEvidence, options: PracticePlanningOptions): number | null {
  if (candidate.recommendations[0]!.kind === 'full-run') return fullRun.estimatedMinutes
  return options.minimumNonRunBlockMinutes
}

export function composePracticeSessionPlan(
  recommendations: readonly PracticeRecommendation[],
  availableMinutes: number,
  fullRun: FullRunDurationEvidence,
  options: PracticePlanningOptions,
): PracticeSessionPlan {
  if (!Number.isInteger(availableMinutes) || availableMinutes <= 0) throw new RangeError('Session-plan availableMinutes must be a positive integer.')
  const selected: { candidate: PlanCandidate; minutes: number }[] = []
  let committed = 0
  for (const candidate of groupRecommendations(recommendations)) {
    if (selected.length >= options.maximumSessionPlanBlocks) break
    const minimum = minimumMinutes(candidate, fullRun, options)
    if (minimum === null || minimum <= 0 || committed + minimum > availableMinutes) continue
    selected.push({ candidate, minutes: minimum })
    committed += minimum
  }
  if (selected.length > 0) {
    let remainder = availableMinutes - committed
    const weightedOrder = selected.flatMap((item, index) => item.candidate.recommendations[0]!.kind === 'full-run' ? [] : Array.from({ length: Math.max(1, selected.length - index) }, () => index))
    let cursor = 0
    while (remainder > 0 && weightedOrder.length > 0) {
      const index = weightedOrder[cursor % weightedOrder.length]!
      selected[index]!.minutes += 1
      remainder -= 1
      cursor += 1
    }
  }
  let sectionIndex = 0
  const blocks: PracticeSessionPlanBlock[] = selected.map(({ candidate, minutes }, index) => {
    const recommendation = candidate.recommendations[0]!
    const kind = blockKind(candidate, sectionIndex)
    if (recommendation.target.type === 'section') sectionIndex += 1
    return {
      order: index + 1,
      kind,
      suggestedMinutes: minutes,
      recommendationIds: candidate.recommendations.map((item) => item.id),
      target: recommendation.target,
      suggestedPracticeSpeedMultiplier: candidate.recommendations.find((item) => item.suggestedPracticeSpeedMultiplier !== null)?.suggestedPracticeSpeedMultiplier ?? null,
    }
  })
  return deepFreeze({
    availableMinutes,
    totalSuggestedMinutes: blocks.reduce((sum, block) => sum + block.suggestedMinutes, 0),
    blocks,
    heuristic: 'product-heuristic-not-universal-pedagogy',
  })
}
