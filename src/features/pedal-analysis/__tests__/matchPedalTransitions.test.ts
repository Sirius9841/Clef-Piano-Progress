import { describe, expect, it } from 'vitest'
import { alignPerformance } from '../../alignment/alignPerformance'
import { makePlan, makeRecording } from '../../alignment/__tests__/fixtures'
import { musicalTime } from '../../musicxml/musicalTime'
import { DEFAULT_PEDAL_ANALYSIS_OPTIONS } from '../options'
import { matchPedalTransitions } from '../matchPedalTransitions'
import type { PedalTargetEvent, PedalTransition } from '../types'

function event(id: string, kind: PedalTargetEvent['kind'], position: number, expectedPerformedMs: number): PedalTargetEvent {
  return { id, kind, sourceEventId: id, position: musicalTime(position), expectedPerformedMs, measureIndex: 0, measureNumber: '1' }
}

function transition(id: string, kind: PedalTransition['kind'], relativeMs: number, sequence: number): PedalTransition {
  return { id, kind, relativeMs, sequence, value: kind === 'down' ? 127 : 0, channel: 0, sourceSampleId: `sample:${id}` }
}

function context() {
  const plan = makePlan(Array.from({ length: 13 }, (_, index) => [60 + index]))
  const recording = makeRecording(plan.attacks.map((attack, index) => ({ midi: attack.midi, ms: 1_000 + index * 500 })), { planId: plan.id })
  return { plan, alignment: alignPerformance(plan, recording) }
}

describe('non-cascading pedal transition matching', () => {
  it('misses an early phrase without stealing the correctly performed later phrase', () => {
    const { plan, alignment } = context()
    const events = [event('p1-start', 'start', 0, 1_000), event('p1-stop', 'stop', 2, 2_000), event('p2-start', 'start', 8, 5_000), event('p2-stop', 'stop', 10, 6_000)]
    const matches = matchPedalTransitions(events, [transition('later-down', 'down', 5_000, 0), transition('later-up', 'up', 6_000, 1)], plan, alignment, DEFAULT_PEDAL_ANALYSIS_OPTIONS)
    expect(matches.map((match) => [match.targetEventId, match.kind, match.transitions.map((item) => item.id)])).toEqual([
      ['p1-start', 'miss', []], ['p1-stop', 'miss', []],
      ['p2-start', 'match', ['later-down']], ['p2-stop', 'match', ['later-up']],
    ])
  })

  it('skips an extra micro-pedal gesture and keeps later correspondence intact', () => {
    const { plan, alignment } = context()
    const matches = matchPedalTransitions(
      [event('start', 'start', 8, 5_000), event('stop', 'stop', 10, 6_000)],
      [transition('extra-down', 'down', 500, 0), transition('extra-up', 'up', 700, 1), transition('down', 'down', 5_000, 2), transition('up', 'up', 6_000, 3)],
      plan, alignment, DEFAULT_PEDAL_ANALYSIS_OPTIONS,
    )
    expect(matches.flatMap((match) => match.transitions.map((item) => item.id))).toEqual(['down', 'up'])
  })

  it('treats a change pair atomically and does not cascade a missed earlier change', () => {
    const { plan, alignment } = context()
    const matches = matchPedalTransitions(
      [event('early-change', 'change', 0, 1_000), event('later-change', 'change', 8, 5_000)],
      [transition('up', 'up', 4_980, 0), transition('down', 'down', 5_030, 1)],
      plan, alignment, DEFAULT_PEDAL_ANALYSIS_OPTIONS,
    )
    expect(matches[0]).toMatchObject({ targetEventId: 'early-change', kind: 'miss', transitions: [] })
    expect(matches[1]?.transitions.map((item) => item.id)).toEqual(['up', 'down'])
    expect(new Set(matches.flatMap((match) => match.transitions.map((item) => item.id))).size).toBe(2)
  })

  it('rejects far-away transitions and resolves equal-cost ties by stable arrival order', () => {
    const { plan, alignment } = context()
    expect(matchPedalTransitions([event('far', 'start', 0, 1_000)], [transition('far-down', 'down', 12_000, 0)], plan, alignment, DEFAULT_PEDAL_ANALYSIS_OPTIONS)[0]).toMatchObject({ kind: 'miss', transitions: [] })
    const tied = matchPedalTransitions([event('tie', 'start', 0, 1_000)], [transition('earlier', 'down', 900, 0), transition('later', 'down', 1_100, 1)], plan, alignment, DEFAULT_PEDAL_ANALYSIS_OPTIONS)
    expect(tied[0]?.transitions[0]?.id).toBe('earlier')
  })
})
