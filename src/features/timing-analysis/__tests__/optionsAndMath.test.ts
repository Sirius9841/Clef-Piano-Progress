import { describe, expect, it } from 'vitest'
import { musicalTime } from '../../musicxml/musicalTime'
import { median, smoothDeviationScore, theilSenSlope, trimmedMean } from '../math'
import { resolveTimingAnalysisOptions } from '../options'
import { buildLocalTempoWindowGeometry } from '../localTempoWindowGeometry'

describe('timing-analysis math and options', () => {
  it('uses robust deterministic statistics', () => {
    expect(median([100, 1, 2, 3, 4])).toBe(3)
    expect(trimmedMean([0, 1, 1, 1, 100], 0.2)).toBe(1)
    expect(theilSenSlope([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }, { x: 4, y: 20 }])).toBe(1)
  })

  it('gives full credit inside a smooth ratio tolerance and stays bounded', () => {
    expect(smoothDeviationScore(Math.log(1.02), 0.03, 0.18)).toBe(1)
    expect(smoothDeviationScore(Math.log(1.2), 0.03, 0.18)).toBeGreaterThanOrEqual(0)
    expect(smoothDeviationScore(Math.log(1.2), 0.03, 0.18)).toBeLessThanOrEqual(1)
  })

  it('validates centralized timing configuration', () => {
    expect(() => resolveTimingAnalysisOptions({ minimumTimingToleranceMs: 0 })).toThrow(RangeError)
    expect(() => resolveTimingAnalysisOptions({ localTempoWindowBeats: musicalTime(0) })).toThrow(RangeError)
    expect(() => resolveTimingAnalysisOptions({ rhythmTrimFraction: 0.5 })).toThrow(RangeError)
    expect(() => resolveTimingAnalysisOptions({ minimumTempoWindowAnchors: 1 })).toThrow(RangeError)
  })

  it('selects deterministic score-side local-tempo window geometry', () => {
    const anchors = [0, 1, 2, 3].map((position) => ({ id: `group:${position}`, position: musicalTime(position) }))
    expect(buildLocalTempoWindowGeometry(anchors, musicalTime(1), 2).map((window) => [window.start.id, window.end.id, window.anchorCount])).toEqual([
      ['group:0', 'group:1', 2], ['group:1', 'group:2', 2], ['group:2', 'group:3', 2],
    ])
    expect(buildLocalTempoWindowGeometry([anchors[0]!, anchors[2]!, anchors[3]!], musicalTime(1), 2).map((window) => [window.start.id, window.end.id])).toEqual([
      ['group:0', 'group:2'], ['group:2', 'group:3'],
    ])
  })
})
