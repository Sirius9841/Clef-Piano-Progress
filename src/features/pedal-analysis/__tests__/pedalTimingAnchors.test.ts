import { describe, expect, it } from 'vitest'
import { alignPerformance } from '../../alignment/alignPerformance'
import { makePlan, makeRecording } from '../../alignment/__tests__/fixtures'
import { musicalTime } from '../../musicxml/musicalTime'
import type { PedalEvent } from '../../musicxml/types'
import { DEFAULT_PEDAL_ANALYSIS_OPTIONS } from '../options'
import { buildPedalTimingAnchor } from '../pedalTimingAnchors'

function pedalEvent(position: number, denominator = 1): PedalEvent {
  return { id: `pedal:${position}/${denominator}`, type: 'change', position: musicalTime(position, denominator), measureOnset: musicalTime(0), partId: 'P1', measureIndex: 0, measureNumber: '1', staff: null, voice: null }
}

function alignmentAt(times: readonly number[]) {
  const plan = makePlan([[60], [62], [64]])
  const recording = makeRecording(plan.attacks.map((attack, index) => ({ midi: attack.midi, ms: times[index]! })), { planId: plan.id })
  const base = alignPerformance(plan, recording)
  const alignment = {
    ...base,
    timeTransform: { ...base.timeTransform, offsetMs: 1_000, scale: 1 },
    groupAlignments: base.groupAlignments.map((step) => step.kind === 'correspondence' ? {
      ...step,
      predictedPerformedMs: 1_000 + step.expectedGroup.referenceMs,
      timingResidualMs: step.performedGroup.representativeMs - (1_000 + step.expectedGroup.referenceMs),
    } : step),
  }
  return { plan, alignment }
}

describe('rubato-aware pedal timing anchors', () => {
  it('prefers an exact performed onset over the global affine score clock', () => {
    const { plan, alignment } = alignmentAt([1_000, 1_700, 2_600])
    expect(buildPedalTimingAnchor(pedalEvent(2), plan, alignment, DEFAULT_PEDAL_ANALYSIS_OPTIONS)).toMatchObject({
      source: 'local-performed', globalPredictedMs: 2_000, anchoredPerformedMs: 2_600,
      anchorOffsetFromGlobalMs: 600, beforeExpectedGroupId: 'expected-group:2',
      matchedPerformedGroupIds: ['performed-group:recording:test:2-2'],
    })
  })

  it('interpolates between immediate trustworthy performed onsets through gradual rubato', () => {
    const { plan, alignment } = alignmentAt([1_000, 1_700, 2_600])
    const anchor = buildPedalTimingAnchor(pedalEvent(3, 2), plan, alignment, DEFAULT_PEDAL_ANALYSIS_OPTIONS)
    expect(anchor).toMatchObject({
      source: 'local-performed', globalPredictedMs: 1_750, anchoredPerformedMs: 2_150,
      beforeExpectedGroupId: 'expected-group:1', afterExpectedGroupId: 'expected-group:2',
    })
  })

  it('follows a locally accelerated musical arrival', () => {
    const { plan, alignment } = alignmentAt([1_000, 1_400, 1_700])
    expect(buildPedalTimingAnchor(pedalEvent(2), plan, alignment, DEFAULT_PEDAL_ANALYSIS_OPTIONS)).toMatchObject({
      source: 'local-performed', globalPredictedMs: 2_000, anchoredPerformedMs: 1_700,
    })
  })

  it('falls back deterministically when local correspondence is not trustworthy', () => {
    const { plan, alignment } = alignmentAt([1_000, 1_700, 2_600])
    const ambiguous = { ...alignment, status: 'ambiguous' as const }
    expect(buildPedalTimingAnchor(pedalEvent(2), plan, ambiguous, DEFAULT_PEDAL_ANALYSIS_OPTIONS)).toMatchObject({
      source: 'global-score-clock', globalPredictedMs: 2_000, anchoredPerformedMs: 2_000,
      matchedPerformedGroupIds: [],
    })
  })
})
