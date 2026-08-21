import { describe, expect, it } from 'vitest'
import { musicalTime } from '../../musicxml/musicalTime'
import { median, smoothDeviationScore, theilSenSlope, trimmedMean } from '../math'
import { resolveTimingAnalysisOptions } from '../options'

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
})
