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

function alignmentFor(plan: ReturnType<typeof makePlan>, times: readonly number[], speed = 1, scale = 1) {
  const recording = makeRecording(plan.attacks.map((attack, index) => ({ midi: attack.midi, ms: times[index]! })), { planId: plan.id, speed })
  const base = alignPerformance(plan, recording)
  const alignment = {
    ...base,
    timeTransform: { ...base.timeTransform, offsetMs: 1_000, scale },
    groupAlignments: base.groupAlignments.map((step) => step.kind === 'correspondence' ? {
      ...step,
      predictedPerformedMs: 1_000 + scale * step.expectedGroup.referenceMs,
      timingResidualMs: step.performedGroup.representativeMs - (1_000 + scale * step.expectedGroup.referenceMs),
    } : step),
  }
  return { plan, alignment }
}

function alignmentAt(times: readonly number[]) {
  return alignmentFor(makePlan([[60], [62], [64]]), times)
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

  it('transfers the final onset residual to a later pedal release instead of snapping to the note', () => {
    const { plan, alignment } = alignmentAt([1_000, 1_500, 2_500])
    const anchor = buildPedalTimingAnchor(pedalEvent(4), plan, alignment, DEFAULT_PEDAL_ANALYSIS_OPTIONS)
    expect(anchor).toMatchObject({
      source: 'local-performed', globalPredictedMs: 3_000, anchoredPerformedMs: 3_500,
      anchorOffsetFromGlobalMs: 500, beforeExpectedGroupId: 'expected-group:2', afterExpectedGroupId: null,
    })
    expect(anchor.anchoredPerformedMs).not.toBe(2_500)
  })

  it('transfers a later onset residual backward to an earlier pedal target', () => {
    const plan = makePlan([[60], [62], [64]], { positions: [1, 2, 3] })
    const { alignment } = alignmentFor(plan, [1_800, 2_300, 2_800])
    const anchor = buildPedalTimingAnchor(pedalEvent(0), plan, alignment, DEFAULT_PEDAL_ANALYSIS_OPTIONS)
    expect(anchor).toMatchObject({
      source: 'local-performed', globalPredictedMs: 1_000, anchoredPerformedMs: 1_300,
      anchorOffsetFromGlobalMs: 300, beforeExpectedGroupId: null, afterExpectedGroupId: 'expected-group:0',
    })
    expect(anchor.anchoredPerformedMs).not.toBe(1_800)
  })

  it('interpolates by canonical elapsed time across authored tempo changes', () => {
    const plan = makePlan([[60], [62]], {
      positions: [0, 4],
      tempoPoints: [{ position: 0, bpm: 120 }, { position: 1, bpm: 60 }],
    })
    const { alignment } = alignmentFor(plan, [1_500, 8_500], 0.5, 1.25)
    const anchor = buildPedalTimingAnchor(pedalEvent(2), plan, alignment, DEFAULT_PEDAL_ANALYSIS_OPTIONS)
    expect(anchor.globalPredictedMs).toBe(4_750)
    expect(anchor.anchoredPerformedMs).toBe(4_500)
    expect(anchor.anchoredPerformedMs).not.toBe(5_000)
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
