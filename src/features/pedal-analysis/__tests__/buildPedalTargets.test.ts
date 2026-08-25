import { describe, expect, it } from 'vitest'
import { alignPerformance } from '../../alignment/alignPerformance'
import { makePlan, makeRecording } from '../../alignment/__tests__/fixtures'
import { musicalTime } from '../../musicxml/musicalTime'
import type { PedalEvent } from '../../musicxml/types'
import { gradeNotes } from '../../note-grading/gradeNotes'
import { makeScore } from '../../performance-results/__tests__/fixtures'
import { buildPedalTargets } from '../buildPedalTargets'

function event(id: string, type: PedalEvent['type'], position: number, staff: number | null = 1, voice: string | null = '1'): PedalEvent {
  return { id, type, position: musicalTime(position), measureOnset: musicalTime(position), partId: 'P1', measureIndex: 0, measureNumber: '1', staff, voice }
}

function build(events: PedalEvent[]) {
  const plan = makePlan([[60], [62], [64], [65]])
  const recording = makeRecording(plan.attacks.map((attack, index) => ({ midi: attack.midi, ms: 1_000 + index * 500 })), { planId: plan.id })
  const alignment = alignPerformance(plan, recording)
  const note = gradeNotes({ expectedPlan: plan, recording, alignment, options: { gradingScope: 'full-plan' } })
  return buildPedalTargets({ ...makeScore(plan), pedalEvents: events }, plan, alignment, note)
}

describe('authored pedal phrase targets', () => {
  it('pairs start, structural continue, change, and stop into one deterministic phrase', () => {
    const result = build([event('start', 'start', 0), event('continue', 'continue', 1), event('change', 'change', 2), event('stop', 'stop', 3)])
    expect(result.targets).toHaveLength(1)
    expect(result.targets[0]?.sourceEventIds).toEqual(['start', 'continue', 'change', 'stop'])
    expect(result.targets[0]?.events.map((item) => item.kind)).toEqual(['start', 'change', 'stop'])
    expect(result.targets[0]?.events.map((item) => item.expectedPerformedMs)).toEqual([1_000, 2_000, 2_500])
  })

  it('uses null staff/voice as wildcards but refuses explicitly incompatible lanes', () => {
    expect(build([event('start', 'start', 0, null, null), event('stop', 'stop', 3, 2, '2')]).targets).toHaveLength(1)
    const incompatible = build([event('start', 'start', 0, 1, '1'), event('stop', 'stop', 3, 2, '2')])
    expect(incompatible.targets).toHaveLength(0)
    expect(incompatible.exclusions).toHaveLength(2)
  })

  it('excludes a wildcard stop when more than one explicit active lane is compatible', () => {
    const result = build([event('voice-1', 'start', 0, 1, '1'), event('voice-2', 'start', 0, 1, '2'), event('wild-stop', 'stop', 3, null, null)])
    expect(result.targets).toHaveLength(0)
    expect(result.exclusions.map((item) => item.sourceEventId)).toContain('wild-stop')
  })

  it('excludes orphan changes, stops, overlapping starts, and unclosed phrases deterministically', () => {
    const result = build([event('change', 'change', 0), event('stop', 'stop', 0), event('a', 'start', 1), event('b', 'start', 2)])
    expect(result.targets).toHaveLength(0)
    expect(result.exclusions.map((item) => item.sourceEventId)).toEqual(['change', 'stop', 'a', 'b'])
    expect(build([event('start', 'start', 0), event('stop', 'stop', 3)]).targets[0]?.id).toBe(build([event('start', 'start', 0), event('stop', 'stop', 3)]).targets[0]?.id)
  })
})
