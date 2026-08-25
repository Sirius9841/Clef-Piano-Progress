import { durationBetweenScorePositionsToMilliseconds } from '../expected-performance/tempoTimeline'
import type { ExpectedPerformancePlan } from '../expected-performance/types'
import { addTime, musicalTime } from '../musicxml/musicalTime'
import type { AlignmentResult } from '../alignment/types'
import type { PedalAnalysisOptions } from './options'
import type { PedalTargetEvent, PedalTransition } from './types'

export type PedalEventMatchKind = 'match' | 'partial-change' | 'miss'

export interface PedalEventMatch {
  readonly targetEventId: string
  readonly kind: PedalEventMatchKind
  readonly transitions: readonly PedalTransition[]
}

interface MatchPath {
  readonly cost: number
  readonly actions: readonly PedalEventMatch[]
  readonly priorityKey: string
}

export function pedalAssociationWindowMs(
  event: PedalTargetEvent,
  plan: ExpectedPerformancePlan,
  alignment: AlignmentResult,
  options: PedalAnalysisOptions,
): number {
  const quarterMs = durationBetweenScorePositionsToMilliseconds(
    event.position,
    addTime(event.position, musicalTime(1)),
    plan.tempoTimeline,
    alignment.practiceSpeedMultiplier,
  ) * alignment.timeTransform.scale
  return Math.max(options.minimumAssociationWindowMs, quarterMs * options.associationWindowQuarterMultiplier)
}

function choose(paths: readonly MatchPath[]): MatchPath {
  return [...paths].sort((left, right) => left.cost - right.cost || left.priorityKey.localeCompare(right.priorityKey))[0]!
}

function prepend(path: MatchPath, action: PedalEventMatch, cost: number, priority: number): MatchPath {
  return { cost: path.cost + cost, actions: [action, ...path.actions], priorityKey: `${priority}${path.priorityKey}` }
}

export function matchPedalTransitions(
  events: readonly PedalTargetEvent[],
  transitions: readonly PedalTransition[],
  plan: ExpectedPerformancePlan,
  alignment: AlignmentResult,
  options: PedalAnalysisOptions,
): readonly PedalEventMatch[] {
  const rows = events.length + 1
  const columns = transitions.length + 1
  const table: MatchPath[][] = Array.from({ length: rows }, () => Array<MatchPath>(columns))
  table[events.length]![transitions.length] = { cost: 0, actions: [], priorityKey: '' }
  for (let transitionIndex = transitions.length - 1; transitionIndex >= 0; transitionIndex -= 1) {
    const next = table[events.length]![transitionIndex + 1]!
    table[events.length]![transitionIndex] = { cost: next.cost + options.extraTransitionCost, actions: next.actions, priorityKey: `1${next.priorityKey}` }
  }

  for (let eventIndex = events.length - 1; eventIndex >= 0; eventIndex -= 1) {
    const event = events[eventIndex]!
    for (let transitionIndex = transitions.length; transitionIndex >= 0; transitionIndex -= 1) {
      const candidates: MatchPath[] = []
      const missTail = table[eventIndex + 1]![transitionIndex]!
      candidates.push(prepend(missTail, { targetEventId: event.id, kind: 'miss', transitions: [] }, options.missingEventCost, 2))
      if (transitionIndex >= transitions.length) {
        table[eventIndex]![transitionIndex] = choose(candidates)
        continue
      }

      const transition = transitions[transitionIndex]!
      const skipTail = table[eventIndex]![transitionIndex + 1]!
      candidates.push({ cost: skipTail.cost + options.extraTransitionCost, actions: skipTail.actions, priorityKey: `1${skipTail.priorityKey}` })
      const windowMs = pedalAssociationWindowMs(event, plan, alignment, options)
      if (event.kind === 'change') {
        const redown = transitions[transitionIndex + 1]
        if (transition.kind === 'up' && redown?.kind === 'down') {
          const performedMs = (transition.relativeMs + redown.relativeMs) / 2
          const gapMs = redown.relativeMs - transition.relativeMs
          if (Math.abs(performedMs - event.expectedPerformedMs) <= windowMs && gapMs <= Math.max(options.changeGapPoorMs, windowMs)) {
            const tail = table[eventIndex + 1]![transitionIndex + 2]!
            const timingCost = Math.abs(performedMs - event.expectedPerformedMs) / windowMs
            const gapCost = Math.min(1, gapMs / Math.max(options.changeGapPoorMs, 1)) * 0.2
            candidates.push(prepend(tail, { targetEventId: event.id, kind: 'match', transitions: [transition, redown] }, timingCost + gapCost, 0))
          }
        }
        if (transition.kind === 'up' && Math.abs(transition.relativeMs - event.expectedPerformedMs) <= windowMs) {
          const tail = table[eventIndex + 1]![transitionIndex + 1]!
          const timingCost = Math.abs(transition.relativeMs - event.expectedPerformedMs) / windowMs
          candidates.push(prepend(tail, { targetEventId: event.id, kind: 'partial-change', transitions: [transition] }, options.missingEventCost * 0.45 + timingCost, 0))
        }
      } else {
        const requiredKind = event.kind === 'start' ? 'down' : 'up'
        if (transition.kind === requiredKind && Math.abs(transition.relativeMs - event.expectedPerformedMs) <= windowMs) {
          const tail = table[eventIndex + 1]![transitionIndex + 1]!
          const timingCost = Math.abs(transition.relativeMs - event.expectedPerformedMs) / windowMs
          candidates.push(prepend(tail, { targetEventId: event.id, kind: 'match', transitions: [transition] }, timingCost, 0))
        }
      }
      table[eventIndex]![transitionIndex] = choose(candidates)
    }
  }
  return table[0]![0]!.actions
}
