import type { AlignmentOptions } from './options'
import type { AlignmentTimeTransform, AlignmentWarning } from './types'

export interface TimeFitAnchor {
  readonly referenceMs: number
  readonly performedMs: number
}

export interface TimeFitResult {
  transform: AlignmentTimeTransform
  warnings: AlignmentWarning[]
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2
}

function selectAnchors(anchors: readonly TimeFitAnchor[], limit: number): TimeFitAnchor[] {
  if (anchors.length <= limit) return [...anchors]
  const selected: TimeFitAnchor[] = []
  for (let index = 0; index < limit; index += 1) selected.push(anchors[Math.round(index * (anchors.length - 1) / (limit - 1))]!)
  return selected
}

function leastSquares(anchors: readonly TimeFitAnchor[]): { offset: number; scale: number } | null {
  if (anchors.length < 2) return null
  const meanX = anchors.reduce((sum, anchor) => sum + anchor.referenceMs, 0) / anchors.length
  const meanY = anchors.reduce((sum, anchor) => sum + anchor.performedMs, 0) / anchors.length
  let covariance = 0
  let variance = 0
  for (const anchor of anchors) {
    covariance += (anchor.referenceMs - meanX) * (anchor.performedMs - meanY)
    variance += (anchor.referenceMs - meanX) ** 2
  }
  if (variance === 0) return null
  const scale = covariance / variance
  return Number.isFinite(scale) ? { scale, offset: meanY - scale * meanX } : null
}

/**
 * A median pairwise slope gives a deterministic robust seed. Median intercepts
 * then identify displaced anchors before a least-squares refit on the retained
 * majority. Pair construction is bounded by deterministic anchor subsampling.
 */
export function fitTimeTransform(anchors: readonly TimeFitAnchor[], options: AlignmentOptions): TimeFitResult {
  const warnings: AlignmentWarning[] = []
  if (anchors.length === 0) {
    return {
      transform: { offsetMs: 0, scale: 1, source: 'fallback', anchorCount: 0, retainedAnchorCount: 0, offsetFitted: false, scaleFitted: false, scaleClamped: false },
      warnings: [{ code: 'NO_TIME_ANCHORS', severity: 'warning', message: 'No exact-pitch group correspondences were available for time fitting; neutral fallback timing is used.' }],
    }
  }
  if (anchors.length === 1) {
    return {
      transform: { offsetMs: anchors[0]!.performedMs - anchors[0]!.referenceMs, scale: 1, source: 'single-anchor', anchorCount: 1, retainedAnchorCount: 1, offsetFitted: true, scaleFitted: false, scaleClamped: false },
      warnings: [{ code: 'WEAK_TIME_FIT', severity: 'info', message: 'Only one time anchor is available. Offset is fitted and timeline scale remains at the explicit 1× fallback.' }],
    }
  }

  const fitAnchors = selectAnchors(anchors, options.maxTimeFitAnchors)
  const slopes: number[] = []
  for (let left = 0; left < fitAnchors.length; left += 1) {
    for (let right = left + 1; right < fitAnchors.length; right += 1) {
      const deltaX = fitAnchors[right]!.referenceMs - fitAnchors[left]!.referenceMs
      if (deltaX === 0) continue
      const slope = (fitAnchors[right]!.performedMs - fitAnchors[left]!.performedMs) / deltaX
      if (Number.isFinite(slope) && slope > 0) slopes.push(slope)
    }
  }
  if (slopes.length === 0) {
    const offsetMs = median(fitAnchors.map((anchor) => anchor.performedMs - anchor.referenceMs))
    return {
      transform: { offsetMs, scale: 1, source: 'single-anchor', anchorCount: anchors.length, retainedAnchorCount: fitAnchors.length, offsetFitted: true, scaleFitted: false, scaleClamped: false },
      warnings: [{ code: 'WEAK_TIME_FIT', severity: 'warning', message: 'Time anchors do not span distinct expected positions. Offset is fitted and scale remains at 1×.' }],
    }
  }

  const robustScale = median(slopes)
  const boundedSeed = Math.min(options.maxTimeScale, Math.max(options.minTimeScale, robustScale))
  const seedOffset = median(fitAnchors.map((anchor) => anchor.performedMs - boundedSeed * anchor.referenceMs))
  const seedResiduals = fitAnchors.map((anchor) => anchor.performedMs - (seedOffset + boundedSeed * anchor.referenceMs))
  const residualMedian = median(seedResiduals)
  const medianAbsoluteDeviation = median(seedResiduals.map((residual) => Math.abs(residual - residualMedian)))
  const threshold = Math.max(options.timeFitOutlierThresholdMs, medianAbsoluteDeviation * 3)
  const retained = fitAnchors.filter((_, index) => Math.abs(seedResiduals[index]! - residualMedian) <= threshold)
  const regression = leastSquares(retained)
  const fittedScale = regression?.scale ?? boundedSeed
  const scale = Math.min(options.maxTimeScale, Math.max(options.minTimeScale, fittedScale))
  const scaleClamped = fittedScale < options.minTimeScale || fittedScale > options.maxTimeScale || robustScale < options.minTimeScale || robustScale > options.maxTimeScale
  const offsetMs = regression && !scaleClamped ? regression.offset : median(retained.map((anchor) => anchor.performedMs - scale * anchor.referenceMs))
  if (scaleClamped) warnings.push({ code: 'TIME_SCALE_OUTLIER', severity: 'warning', message: `The fitted timeline scale exceeded configured ${options.minTimeScale}×–${options.maxTimeScale}× bounds and was clamped deterministically.` })
  if (retained.length < Math.max(2, Math.ceil(fitAnchors.length / 2))) warnings.push({ code: 'WEAK_TIME_FIT', severity: 'warning', message: 'Fewer than half of sampled time anchors survived robust outlier filtering.' })
  return {
    transform: {
      offsetMs: Number.isFinite(offsetMs) ? offsetMs : 0,
      scale: Number.isFinite(scale) ? scale : 1,
      source: 'robust-fit',
      anchorCount: anchors.length,
      retainedAnchorCount: retained.length,
      offsetFitted: true,
      scaleFitted: true,
      scaleClamped,
    },
    warnings,
  }
}
