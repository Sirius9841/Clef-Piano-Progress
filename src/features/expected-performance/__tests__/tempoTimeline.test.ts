import { describe, expect, it } from 'vitest'
import { musicalTime } from '../../musicxml/musicalTime'
import type { TempoEvent } from '../../musicxml/types'
import { buildTempoTimeline, durationBetweenScorePositionsToMilliseconds, scoreTimeToMilliseconds } from '../tempoTimeline'

function tempo(id: string, position: number, quarterBpm: number): TempoEvent {
  return {
    id,
    position: musicalTime(position),
    measureOnset: musicalTime(0),
    partId: 'P1',
    measureIndex: 0,
    staff: 1,
    voice: null,
    quarterBpm,
    source: 'metronome',
    display: null,
  }
}

describe('tempo timeline', () => {
  it.each([
    [120, 2_000],
    [60, 4_000],
  ])('maps four quarter units at %s BPM to %s milliseconds', (quarterBpm, expectedMs) => {
    const { timeline } = buildTempoTimeline([tempo('start', 0, quarterBpm)], 100)
    expect(scoreTimeToMilliseconds(musicalTime(4), timeline)).toBe(expectedMs)
  })

  it('uses an explicit fallback before the first authored tempo', () => {
    const result = buildTempoTimeline([tempo('later', 2, 90)], 120)

    expect(result.timeline.usesFallback).toBe(true)
    expect(result.timeline.points.map((point) => [point.position.numerator, point.quarterBpm, point.source])).toEqual([
      [0, 120, 'fallback'],
      [2, 90, 'authored'],
    ])
    expect(result.warnings.map((warning) => warning.code)).toContain('MISSING_TEMPO_BEFORE_FIRST_EVENT')
  })

  it('integrates piecewise tempo exactly before converting to milliseconds', () => {
    const { timeline } = buildTempoTimeline([tempo('start', 0, 120), tempo('change', 2, 60)], 100)

    expect(scoreTimeToMilliseconds(musicalTime(4), timeline)).toBe(3_000)
    expect(durationBetweenScorePositionsToMilliseconds(musicalTime(1), musicalTime(3), timeline)).toBe(1_500)
    expect(scoreTimeToMilliseconds(musicalTime(1, 3), timeline)).toBeCloseTo(166.666_666, 5)
  })

  it.each([
    [0.5, 6_000],
    [0.75, 4_000],
    [1, 3_000],
    [1.25, 2_400],
  ])('applies a %s speed multiplier only at the millisecond boundary', (speed, expected) => {
    const { timeline } = buildTempoTimeline([tempo('start', 0, 120), tempo('change', 2, 60)], 100)
    expect(scoreTimeToMilliseconds(musicalTime(4), timeline, speed)).toBe(expected)
  })

  it('resolves same-position conflicts deterministically using authored order', () => {
    const result = buildTempoTimeline([tempo('first', 0, 80), tempo('second', 0, 110)], 100)

    expect(result.timeline.points).toHaveLength(1)
    expect(result.timeline.points[0]?.quarterBpm).toBe(110)
    expect(result.timeline.points[0]?.sourceEventIds).toEqual(['first', 'second'])
    expect(result.warnings.map((warning) => warning.code)).toContain('CONFLICTING_TEMPO_EVENTS')
  })

  it('rejects invalid timing inputs', () => {
    const { timeline } = buildTempoTimeline([], 100)
    expect(() => scoreTimeToMilliseconds(musicalTime(-1), timeline)).toThrow(RangeError)
    expect(() => scoreTimeToMilliseconds(musicalTime(1), timeline, 0)).toThrow(RangeError)
  })
})
