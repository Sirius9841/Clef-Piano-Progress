import { describe, expect, it } from 'vitest'
import { DEFAULT_ALIGNMENT_OPTIONS, resolveAlignmentOptions } from '../options'
import { fitTimeTransform } from '../timeFit'

describe('robust affine time fitting', () => {
  it('uses explicit fallback semantics for zero and one anchor', () => {
    expect(fitTimeTransform([], DEFAULT_ALIGNMENT_OPTIONS).transform).toMatchObject({ source: 'fallback', offsetMs: 0, scale: 1, anchorCount: 0, scaleFitted: false })
    expect(fitTimeTransform([{ referenceMs: 500, performedMs: 1_750 }], DEFAULT_ALIGNMENT_OPTIONS).transform).toMatchObject({ source: 'single-anchor', offsetMs: 1_250, scale: 1, anchorCount: 1, scaleFitted: false })
  })

  it('fits global offset and scale from multiple anchors', () => {
    const result = fitTimeTransform([
      { referenceMs: 0, performedMs: 1_000 },
      { referenceMs: 500, performedMs: 1_600 },
      { referenceMs: 1_000, performedMs: 2_200 },
      { referenceMs: 1_500, performedMs: 2_800 },
    ], DEFAULT_ALIGNMENT_OPTIONS)

    expect(result.transform.offsetMs).toBeCloseTo(1_000)
    expect(result.transform.scale).toBeCloseTo(1.2)
    expect(result.transform.scaleFitted).toBe(true)
  })

  it('rejects a large single timing outlier before refitting', () => {
    const result = fitTimeTransform([
      { referenceMs: 0, performedMs: 1_000 },
      { referenceMs: 500, performedMs: 1_500 },
      { referenceMs: 1_000, performedMs: 12_000 },
      { referenceMs: 1_500, performedMs: 2_500 },
      { referenceMs: 2_000, performedMs: 3_000 },
    ], DEFAULT_ALIGNMENT_OPTIONS)

    expect(result.transform.offsetMs).toBeCloseTo(1_000)
    expect(result.transform.scale).toBeCloseTo(1)
    expect(result.transform.retainedAnchorCount).toBe(4)
  })

  it('clamps pathological scale without NaN or Infinity and reports it', () => {
    const options = resolveAlignmentOptions({ minTimeScale: 0.5, maxTimeScale: 2 })
    const result = fitTimeTransform([
      { referenceMs: 0, performedMs: 100 },
      { referenceMs: 1_000, performedMs: 100.1 },
      { referenceMs: 2_000, performedMs: 100.2 },
    ], options)

    expect(result.transform.scale).toBe(0.5)
    expect(result.transform.scaleClamped).toBe(true)
    expect(Number.isFinite(result.transform.offsetMs)).toBe(true)
    expect(result.warnings.map((warning) => warning.code)).toContain('TIME_SCALE_OUTLIER')
  })
})
