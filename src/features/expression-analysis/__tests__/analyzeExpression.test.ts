import { describe, expect, it } from 'vitest'
import { alignPerformance } from '../../alignment/alignPerformance'
import { makePlan, makeRecording } from '../../alignment/__tests__/fixtures'
import { buildExpectedPerformancePlan } from '../../expected-performance/builder'
import { musicalTime } from '../../musicxml/musicalTime'
import { parseMusicXml } from '../../musicxml/parser'
import { tiesFixture } from '../../musicxml/__tests__/fixtures'
import type { NormalizedNote, NormalizedScore } from '../../musicxml/types'
import { gradeNotes } from '../../note-grading/gradeNotes'
import type { PerformanceRecording } from '../../performance/types'
import { makeScore } from '../../performance-results/__tests__/fixtures'
import { analyzeExpression } from '../analyzeExpression'
import type { ExpressionAnalysisOptions } from '../options'

function expressionScore(plan = makePlan(Array.from({ length: 8 }, (_, index) => [60 + index]))) {
  return makeScore(plan)
}

function withNotation(score: NormalizedScore, update: (note: NormalizedNote, index: number) => NormalizedNote): NormalizedScore {
  let noteIndex = 0
  return {
    ...score,
    parts: score.parts.map((part) => ({
      ...part,
      measures: part.measures.map((measure) => ({
        ...measure,
        events: measure.events.map((event) => event.type === 'note' ? update(event, noteIndex++) : event),
      })),
    })),
  }
}

function performance(
  plan: ReturnType<typeof makePlan>,
  velocities: readonly number[],
  gateRatios: readonly number[] = velocities.map(() => 0.6),
  pitches = plan.attacks.map((attack) => attack.midi),
  sustain = false,
  intervalMs = 500,
): PerformanceRecording {
  const base = makeRecording(pitches.map((midi, index) => ({ midi, ms: 1_000 + index * intervalMs, velocity: velocities[index] ?? 64 })), { planId: plan.id })
  const keyPresses = base.keyPresses.map((press, index) => ({ ...press, releaseMs: press.attackMs + intervalMs * (gateRatios[index] ?? 0.6), releaseSequence: velocities.length + index }))
  return {
    ...base,
    keyPresses,
    events: sustain ? [{ sequence: 0, relativeMs: 1_050, event: { type: 'sustain', channel: 0, down: true, value: 127, timestampMs: 1_050 } }] : [],
    statistics: { ...base.statistics, noteReleaseCount: keyPresses.length, openNoteCount: 0, sustainChangeCount: sustain ? 1 : 0 },
  }
}

function analyze(score: NormalizedScore, plan: ReturnType<typeof makePlan>, recording: PerformanceRecording, options?: Partial<ExpressionAnalysisOptions>) {
  const alignment = alignPerformance(plan, recording)
  const noteGrading = gradeNotes({ expectedPlan: plan, recording, alignment, options: { gradingScope: 'full-plan' } })
  return analyzeExpression({ normalizedScore: score, expectedPlan: plan, recording, alignment, noteGrading, options })
}

function wedgeScore(plan: ReturnType<typeof makePlan>): NormalizedScore {
  const score = expressionScore(plan)
  return {
    ...score,
    wedgeEvents: [
      { id: 'wedge:start', position: musicalTime(0), measureOnset: musicalTime(0), partId: 'P1', measureIndex: 0, measureNumber: '1', staff: null, voice: null, type: 'crescendo', number: '1' },
      { id: 'wedge:stop', position: musicalTime(7), measureOnset: musicalTime(3), partId: 'P1', measureIndex: 1, measureNumber: '2', staff: null, voice: null, type: 'stop', number: '1' },
    ],
  }
}

function dynamicsAggregation(scores: readonly number[]) {
  const lowContextCount = 3
  const highContextCount = 3
  const basePlan = makePlan(Array.from({ length: lowContextCount + scores.length * 2 + highContextCount }, (_, index) => [48 + index]))
  const plan = {
    ...basePlan,
    attacks: basePlan.attacks.map((attack, index) => ({
      ...attack,
      staff: 1,
      voice: index < lowContextCount || index >= lowContextCount + scores.length * 2 ? 'context' : `target-${Math.floor((index - lowContextCount) / 2)}`,
    })),
  }
  const dynamicEvents = scores.flatMap((_, index) => {
    const startIndex = lowContextCount + index * 2
    const voice = `target-${index}`
    return [
      { id: `dynamic:${index}:p`, position: musicalTime(startIndex), measureOnset: musicalTime(0), partId: 'P1', measureIndex: startIndex, measureNumber: String(startIndex + 1), staff: 1, voice, marking: 'p' as const },
      { id: `dynamic:${index}:f`, position: musicalTime(startIndex + 1), measureOnset: musicalTime(0), partId: 'P1', measureIndex: startIndex + 1, measureNumber: String(startIndex + 2), staff: 1, voice, marking: 'f' as const },
    ]
  })
  const targetVelocities = scores.flatMap((score) => [70, 70 + (score * 0.35 - 0.04) * 100])
  const velocities = [...Array(lowContextCount).fill(20), ...targetVelocities, ...Array(highContextCount).fill(120)]
  return analyze(
    { ...expressionScore(plan), dynamicEvents },
    plan,
    performance(plan, velocities),
    { dynamicContextNotes: 1, minimumDynamicWindowNotes: 1 },
  )
}

function articulationAggregation(scores: readonly number[]) {
  const plan = makePlan(Array.from({ length: Math.max(6, scores.length) }, (_, index) => [60 + index]))
  const score = withNotation(expressionScore(plan), (note, index) => index < scores.length ? { ...note, articulations: ['staccato'] } : note)
  const gateRatios = plan.attacks.map((_, index) => index < scores.length ? 0.65 + (1 - scores[index]!) * 0.4 : 0.6)
  return analyze(score, plan, performance(plan, plan.attacks.map((_, index) => 40 + index * 10), gateRatios))
}

function voiceAwareScore(plan: ReturnType<typeof makePlan>, wedgeVoice: string | null, dynamicVoice: string | null): NormalizedScore {
  return {
    ...expressionScore(plan),
    dynamicEvents: [
      { id: 'dynamic:p', position: musicalTime(0), measureOnset: musicalTime(0), partId: 'P1', measureIndex: 0, measureNumber: '1', staff: 1, voice: dynamicVoice, marking: 'p' },
      { id: 'dynamic:f', position: musicalTime(4), measureOnset: musicalTime(0), partId: 'P1', measureIndex: 4, measureNumber: '5', staff: 1, voice: dynamicVoice, marking: 'f' },
    ],
    wedgeEvents: [
      { id: 'wedge:start', position: musicalTime(0), measureOnset: musicalTime(0), partId: 'P1', measureIndex: 0, measureNumber: '1', staff: 1, voice: wedgeVoice, type: 'crescendo', number: '1' },
      { id: 'wedge:stop', position: musicalTime(7), measureOnset: musicalTime(0), partId: 'P1', measureIndex: 7, measureNumber: '8', staff: 1, voice: wedgeVoice, type: 'stop', number: '1' },
    ],
  }
}

describe('expression analysis', () => {
  it.each([
    ['five targets', [1, 1, 1, 0, 0], 0.6],
    ['one target', [0.8], 0.8],
    ['four targets', [0.2, 0.4, 0.6, 0.8], 0.5],
  ] as const)('uses an equal authored-event arithmetic mean for %s in both dimensions', (_label, scores, expected) => {
    const dynamics = dynamicsAggregation(scores)
    const articulation = articulationAggregation(scores)
    expect(dynamics.dynamics.observations.map((observation) => observation.score)).toEqual(scores.map((score) => expect.closeTo(score, 8)))
    expect(dynamics.dynamics.score).toBeCloseTo(expected, 8)
    expect(articulation.articulation.observations.map((observation) => observation.score)).toEqual(scores.map((score) => expect.closeTo(score, 8)))
    expect(articulation.articulation.score).toBeCloseTo(expected, 8)
  })

  it('scores a clear authored crescendo above a flat/reversed shape without using absolute velocity', () => {
    const plan = makePlan(Array.from({ length: 8 }, (_, index) => [60 + index]))
    const score = wedgeScore(plan)
    const rising = analyze(score, plan, performance(plan, [40, 44, 48, 54, 61, 67, 73, 80]))
    const shifted = analyze(score, plan, performance(plan, [60, 64, 68, 74, 81, 87, 93, 100]))
    const flatShape = analyze(score, plan, performance(plan, [40, 72, 42, 70, 70, 42, 72, 40]))
    const reversed = analyze(score, plan, performance(plan, [80, 74, 68, 62, 56, 50, 44, 38]))
    expect(rising.dynamics.score).toBeGreaterThan(0.8)
    expect(shifted.dynamics.score).toBeCloseTo(rising.dynamics.score!, 8)
    expect(flatShape.dynamics.score).toBeLessThan(rising.dynamics.score!)
    expect(reversed.dynamics.score).toBeLessThan(0.2)
  })

  it('does not stretch compressed velocity evidence into a confident dynamics score', () => {
    const plan = makePlan(Array.from({ length: 8 }, (_, index) => [60 + index]))
    const result = analyze(wedgeScore(plan), plan, performance(plan, [63, 64, 63, 65, 64, 65, 64, 65]))
    expect(result.dynamics).toMatchObject({ status: 'unavailable', reliability: 'unavailable', score: null })
    expect(result.dynamics.diagnostics.normalization.evidenceSufficient).toBe(false)
  })

  it('treats an isolated dynamic marking as ungradeable absolute notation', () => {
    const plan = makePlan(Array.from({ length: 8 }, (_, index) => [60 + index]))
    const score = { ...expressionScore(plan), dynamicEvents: [{ id: 'dynamic:p', position: musicalTime(0), measureOnset: musicalTime(0), partId: 'P1', measureIndex: 0, measureNumber: '1', staff: 1, voice: '1', marking: 'p' as const }] }
    const result = analyze(score, plan, performance(plan, [40, 50, 60, 70, 80, 90, 75, 55]))
    expect(result.dynamics.score).toBeNull()
    expect(result.dynamics.exclusions[0]?.reason).toContain('isolated')
  })

  it('grades explicit ordinal changes and suppresses an overlapping wedge endpoint change', () => {
    const plan = makePlan(Array.from({ length: 8 }, (_, index) => [60 + index]))
    const dynamicEvents = [
      { id: 'dynamic:p', position: musicalTime(0), measureOnset: musicalTime(0), partId: 'P1', measureIndex: 0, measureNumber: '1', staff: null, voice: null, marking: 'p' as const },
      { id: 'dynamic:f', position: musicalTime(4), measureOnset: musicalTime(0), partId: 'P1', measureIndex: 4, measureNumber: '5', staff: null, voice: null, marking: 'f' as const },
    ]
    const explicit = analyze({ ...expressionScore(plan), dynamicEvents }, plan, performance(plan, [40, 44, 48, 50, 70, 74, 78, 82]))
    const overlapping = analyze({ ...wedgeScore(plan), dynamicEvents }, plan, performance(plan, [40, 44, 48, 52, 60, 68, 74, 82]))
    expect(explicit.dynamics.targets).toContainEqual(expect.objectContaining({ kind: 'dynamic-change', expectedDirection: 'increase', fromMarking: 'p', toMarking: 'f' }))
    expect(explicit.dynamics.score).toBeGreaterThan(0.8)
    expect(overlapping.dynamics.targets).toHaveLength(1)
    expect(overlapping.dynamics.targets[0]?.kind).toBe('wedge')
    expect(overlapping.dynamics.exclusions.some((item) => item.reason.includes('double-counting'))).toBe(true)
  })

  it('assigns accents only to Dynamics and responds monotonically to local emphasis', () => {
    const plan = makePlan(Array.from({ length: 8 }, (_, index) => [60 + index]))
    const score = withNotation(expressionScore(plan), (note, index) => index === 3 ? { ...note, articulations: ['accent'] } : note)
    const clear = analyze(score, plan, performance(plan, [50, 55, 58, 100, 56, 60, 65, 70]))
    const weak = analyze(score, plan, performance(plan, [50, 55, 58, 60, 56, 65, 75, 85]))
    const reversed = analyze(score, plan, performance(plan, [55, 60, 65, 40, 70, 75, 80, 85]))
    expect(clear.dynamics.targets).toContainEqual(expect.objectContaining({ kind: 'accent', emphasis: 'accent' }))
    expect(clear.dynamics.score).toBeGreaterThanOrEqual(weak.dynamics.score!)
    expect(weak.dynamics.score).toBeGreaterThan(reversed.dynamics.score!)
    expect(clear.articulation).toMatchObject({ status: 'unavailable', score: null })
  })

  it('excludes every authored accent target from every other accent baseline', () => {
    const plan = makePlan(Array.from({ length: 8 }, (_, index) => [60 + index]))
    const score = withNotation(expressionScore(plan), (note, index) => index === 1 || index === 3 ? { ...note, articulations: ['accent'] } : note)
    const result = analyze(score, plan, performance(plan, [55, 78, 57, 80, 56, 60, 65, 70]))
    const accentTargets = result.dynamics.targets.filter((target) => target.kind === 'accent')
    const allAccentIds = new Set(accentTargets.flatMap((target) => target.expectedTargetIds))
    expect(accentTargets).toHaveLength(2)
    for (const observation of result.dynamics.observations) {
      const target = accentTargets.find((candidate) => candidate.id === observation.targetId)!
      const matchedExpectedIds = observation.matchedObservationIds.map((id) => result.matchedObservations.find((match) => match.id === id)!.expectedTargetId)
      expect(matchedExpectedIds.filter((id) => allAccentIds.has(id))).toEqual(target.expectedTargetIds)
    }
  })

  it('leaves dense accents ungraded when too little non-accent local evidence remains', () => {
    const plan = makePlan(Array.from({ length: 8 }, (_, index) => [60 + index]))
    const score = withNotation(expressionScore(plan), (note, index) => index < 6 ? { ...note, articulations: ['accent'] } : note)
    const result = analyze(score, plan, performance(plan, [60, 75, 62, 78, 64, 80, 58, 59]))
    expect(result.dynamics.targets.filter((target) => target.kind === 'accent')).toHaveLength(6)
    expect(result.dynamics.observations).toEqual([])
    expect(result.dynamics.exclusions.filter((item) => item.reason.includes('enough nearby non-accent'))).toHaveLength(6)
  })

  it('suppresses wedge endpoint transitions only in a compatible notation voice lane', () => {
    const basePlan = makePlan(Array.from({ length: 8 }, (_, index) => [60 + index]))
    const plan = { ...basePlan, attacks: basePlan.attacks.map((attack, index) => ({ ...attack, staff: 1, voice: index < 4 ? '1' : '2' })) }
    const recording = performance(plan, [40, 45, 50, 55, 65, 70, 75, 80])
    const sameVoice = analyze(voiceAwareScore(plan, '1', '1'), plan, recording)
    const differentVoice = analyze(voiceAwareScore(plan, '1', '2'), plan, recording)
    const unknownVoice = analyze(voiceAwareScore(plan, null, '2'), plan, recording)
    expect(sameVoice.dynamics.targets.map((target) => target.kind)).toEqual(['wedge'])
    expect(differentVoice.dynamics.targets.map((target) => target.kind).sort()).toEqual(['dynamic-change', 'wedge'])
    expect(unknownVoice.dynamics.targets.map((target) => target.kind)).toEqual(['wedge'])
  })

  it('uses only correct note correspondences and reports lost expression coverage instead of a second penalty', () => {
    const plan = makePlan(Array.from({ length: 8 }, (_, index) => [60 + index]))
    const recording = performance(plan, [40, 45, 50, 55, 60, 65, 70, 75], undefined, [60, 61, 62, 63, 80, 65, 66, 67])
    const result = analyze(wedgeScore(plan), plan, recording)
    expect(result.matchedObservations).toHaveLength(7)
    expect(result.matchedObservations.some((item) => item.midi === 64)).toBe(false)
    expect(result.dynamics.coverage.analyzedTargetCount).toBeLessThanOrEqual(result.dynamics.coverage.authoredTargetCount)
  })

  it('scores physical staccato gate ratios continuously and excludes open keys', () => {
    const plan = makePlan(Array.from({ length: 8 }, (_, index) => [60 + index]))
    const score = withNotation(expressionScore(plan), (note) => ({ ...note, articulations: ['staccato'] }))
    const short = analyze(score, plan, performance(plan, [40, 50, 60, 70, 80, 90, 75, 55], Array(8).fill(0.45)))
    const long = analyze(score, plan, performance(plan, [40, 50, 60, 70, 80, 90, 75, 55], Array(8).fill(0.95)))
    const openRecording = { ...performance(plan, [40, 50, 60, 70, 80, 90, 75, 55]), keyPresses: performance(plan, [40, 50, 60, 70, 80, 90, 75, 55]).keyPresses.map((press, index) => index === 0 ? { ...press, releaseMs: null, releaseSequence: null } : press) }
    const open = analyze(score, plan, openRecording)
    expect(short.articulation.score).toBeGreaterThan(long.articulation.score!)
    expect(short.articulation.score).toBe(1)
    expect(open.articulation.diagnostics.missingReleaseCount).toBe(1)
    expect(open.articulation.coverage.analyzedTargetCount).toBe(7)
  })

  it('handles repeated-pitch slur transitions with a short controlled re-articulation gap', () => {
    const plan = makePlan([[60], [60], [62], [64], [65], [67]])
    const score = withNotation(expressionScore(plan), (note, index) => ({ ...note, slurs: index === 0 ? [{ type: 'start', number: '1' }] : index === 1 ? [{ type: 'stop', number: '1' }] : [] }))
    const recording = performance(plan, [40, 50, 60, 70, 80, 90], [0.96, 0.6, 0.6, 0.6, 0.6, 0.6])
    const result = analyze(score, plan, recording)
    const transition = result.articulation.observations.find((item) => result.articulation.targets.find((target) => target.id === item.targetId)?.kind === 'legato-transition')
    expect(result.articulation.targets).toContainEqual(expect.objectContaining({ kind: 'legato-transition', repeatedPitch: true }))
    expect(transition).toMatchObject({ transitionGapMs: 20, score: 1 })
  })

  it('keeps slur scoring tempo-aware and distinguishes connected from separated transitions', () => {
    const plan = makePlan([[60], [62], [64], [65], [67], [69]])
    const score = withNotation(expressionScore(plan), (note, index) => ({ ...note, slurs: index === 0 ? [{ type: 'start', number: '1' }] : index === 1 ? [{ type: 'stop', number: '1' }] : [] }))
    const overlap = analyze(score, plan, performance(plan, [40, 50, 60, 70, 80, 90], [1.05, 0.6, 0.6, 0.6, 0.6, 0.6]))
    const connected = analyze(score, plan, performance(plan, [40, 50, 60, 70, 80, 90], [0.96, 0.6, 0.6, 0.6, 0.6, 0.6]))
    const separated = analyze(score, plan, performance(plan, [40, 50, 60, 70, 80, 90], [0.6, 0.6, 0.6, 0.6, 0.6, 0.6]))
    expect(overlap.articulation.score).toBe(1)
    expect(connected.articulation.score).toBe(1)
    expect(separated.articulation.score).toBeLessThan(connected.articulation.score!)
  })

  it('leaves a legato transition unanalyzed when its physical release evidence is incomplete', () => {
    const plan = makePlan([[60], [62], [64], [65], [67], [69]])
    const score = withNotation(expressionScore(plan), (note, index) => ({ ...note, slurs: index === 0 ? [{ type: 'start', number: '1' }] : index === 1 ? [{ type: 'stop', number: '1' }] : [] }))
    const complete = performance(plan, [40, 50, 60, 70, 80, 90])
    const recording = { ...complete, keyPresses: complete.keyPresses.map((press, index) => index === 0 ? { ...press, releaseMs: null, releaseSequence: null } : press) }
    const result = analyze(score, plan, recording)
    expect(result.articulation.coverage).toMatchObject({ authoredTargetCount: 1, analyzedTargetCount: 0, ratio: 0 })
    expect(result.articulation.diagnostics.missingReleaseCount).toBe(1)
    expect(result.articulation.exclusions).toContainEqual(expect.objectContaining({ reason: 'This legato transition lacks complete correct attack and physical-release evidence.' }))
  })

  it('uses gate ratios consistently across tempo and differentiates staccatissimo and tenuto', () => {
    const fastPlan = makePlan(Array.from({ length: 6 }, (_, index) => [60 + index]))
    const slowPlan = makePlan(Array.from({ length: 6 }, (_, index) => [60 + index]), { id: 'plan:slow', tempoPoints: [{ position: 0, bpm: 60 }] })
    const fastScore = withNotation(expressionScore(fastPlan), (note) => ({ ...note, articulations: ['staccato'] }))
    const slowScore = withNotation({ ...expressionScore(slowPlan), id: slowPlan.scoreId }, (note) => ({ ...note, articulations: ['staccato'] }))
    const fast = analyze(fastScore, fastPlan, performance(fastPlan, [40, 50, 60, 70, 80, 90], Array(6).fill(0.55)))
    const slow = analyze(slowScore, slowPlan, performance(slowPlan, [40, 50, 60, 70, 80, 90], Array(6).fill(0.55), undefined, false, 1_000))
    expect(slow.articulation.score).toBeCloseTo(fast.articulation.score!, 8)

    const staccatissimoScore = withNotation(expressionScore(fastPlan), (note) => ({ ...note, articulations: ['staccatissimo'] }))
    const staccatissimo = analyze(staccatissimoScore, fastPlan, performance(fastPlan, [40, 50, 60, 70, 80, 90], Array(6).fill(0.55)))
    expect(staccatissimo.articulation.score).toBeLessThan(fast.articulation.score!)

    const tenutoScore = withNotation(expressionScore(fastPlan), (note) => ({ ...note, articulations: ['tenuto'] }))
    const full = analyze(tenutoScore, fastPlan, performance(fastPlan, [40, 50, 60, 70, 80, 90], Array(6).fill(0.95)))
    const premature = analyze(tenutoScore, fastPlan, performance(fastPlan, [40, 50, 60, 70, 80, 90], Array(6).fill(0.55)))
    expect(full.articulation.score).toBeGreaterThan(premature.articulation.score!)
  })

  it('keeps a thin set of correct articulation targets limited instead of double-penalizing pitch errors', () => {
    const plan = makePlan(Array.from({ length: 8 }, (_, index) => [60 + index]))
    const score = withNotation(expressionScore(plan), (note) => ({ ...note, articulations: ['staccato', 'fermata'] }))
    const result = analyze(score, plan, performance(plan, [40, 50, 60, 70, 80, 90, 75, 55], Array(8).fill(0.45), [60, 80, 81, 82, 83, 84, 85, 86]))
    expect(result.articulation.score).toBe(1)
    expect(result.articulation.coverage).toMatchObject({ authoredTargetCount: 8, analyzedTargetCount: 1, ratio: 0.125 })
    expect(result.articulation.reliability).toBe('limited')
    expect(result.articulation.targets.every((target) => target.kind !== ('fermata' as never))).toBe(true)
  })

  it('bounds chord articulation by authored onset event rather than physical key count', () => {
    const plan = makePlan([[60, 64, 67], [62, 65, 69], [64, 67, 71], [65, 69, 72]])
    const score = withNotation(expressionScore(plan), (note) => ({ ...note, articulations: ['staccato'] }))
    const attacks = plan.onsetGroups.flatMap((group, groupIndex) => group.attackIds.map((id, attackIndex) => ({ midi: plan.attacks.find((attack) => attack.id === id)!.midi, ms: 1_000 + groupIndex * 500, velocity: 40 + groupIndex * 12 + attackIndex })))
    const base = makeRecording(attacks, { planId: plan.id })
    const recording = { ...base, keyPresses: base.keyPresses.map((press, index) => ({ ...press, releaseMs: press.attackMs + 225, releaseSequence: 30 + index })) }
    const result = analyze(score, plan, recording)
    expect(result.articulation.coverage).toMatchObject({ authoredTargetCount: 4, analyzedTargetCount: 4, ratio: 1 })
    expect(result.articulation.targets).toHaveLength(plan.onsetGroups.length)
  })

  it('does not analyze a chord articulation target with a missing physical release', () => {
    const plan = makePlan([[60, 64, 67], [62], [63], [65], [66], [68]])
    const score = withNotation(expressionScore(plan), (note, index) => index < 3 ? { ...note, articulations: ['staccato'] } : note)
    const attacks = plan.onsetGroups.flatMap((group, groupIndex) => group.attackIds.map((id) => ({ midi: plan.attacks.find((attack) => attack.id === id)!.midi, ms: 1_000 + groupIndex * 500, velocity: 40 + groupIndex * 10 })))
    const base = makeRecording(attacks, { planId: plan.id })
    const recording = { ...base, keyPresses: base.keyPresses.map((press, index) => ({ ...press, releaseMs: index === 2 ? null : press.attackMs + 225, releaseSequence: index === 2 ? null : 30 + index })) }
    const result = analyze(score, plan, recording)
    expect(result.articulation.coverage).toMatchObject({ authoredTargetCount: 1, analyzedTargetCount: 0, ratio: 0 })
    expect(result.articulation.observations).toEqual([])
    expect(result.articulation.diagnostics.missingReleaseCount).toBe(1)
    expect(result.articulation.exclusions).toContainEqual(expect.objectContaining({ reason: 'This articulation target lacks complete correct key-release evidence.' }))
  })

  it('leaves a partially pitch-correct chord to Notes instead of adding an Articulation penalty', () => {
    const plan = makePlan([[60, 64, 67], [62], [63], [65], [66], [68]])
    const score = withNotation(expressionScore(plan), (note, index) => index < 3 ? { ...note, articulations: ['staccato'] } : note)
    let attackIndex = 0
    const attacks = plan.onsetGroups.flatMap((group, groupIndex) => group.attackIds.map((id) => {
      const attack = plan.attacks.find((candidate) => candidate.id === id)!
      const item = { midi: attackIndex === 2 ? 68 : attack.midi, ms: 1_000 + groupIndex * 500, velocity: 40 + attackIndex * 8 }
      attackIndex += 1
      return item
    }))
    const base = makeRecording(attacks, { planId: plan.id })
    const recording = { ...base, keyPresses: base.keyPresses.map((press, index) => ({ ...press, releaseMs: press.attackMs + 225, releaseSequence: 30 + index })) }
    const alignment = alignPerformance(plan, recording)
    const noteGrading = gradeNotes({ expectedPlan: plan, recording, alignment, options: { gradingScope: 'full-plan' } })
    const result = analyzeExpression({ normalizedScore: score, expectedPlan: plan, recording, alignment, noteGrading })
    expect(noteGrading.counts).toMatchObject({ correct: 7, wrongPitch: 1 })
    expect(result.articulation.coverage).toMatchObject({ authoredTargetCount: 1, analyzedTargetCount: 0, ratio: 0 })
    expect(result.articulation.observations).toEqual([])
  })

  it('counts only complete chord articulation targets in coverage and reliability', () => {
    const plan = makePlan([[60, 64, 67], [62, 65, 69], [63], [66], [68], [70]])
    const score = withNotation(expressionScore(plan), (note, index) => index < 6 ? { ...note, articulations: ['staccato'] } : note)
    const attacks = plan.onsetGroups.flatMap((group, groupIndex) => group.attackIds.map((id) => ({ midi: plan.attacks.find((attack) => attack.id === id)!.midi, ms: 1_000 + groupIndex * 500, velocity: 40 + groupIndex * 10 })))
    const base = makeRecording(attacks, { planId: plan.id })
    const recording = { ...base, keyPresses: base.keyPresses.map((press, index) => ({ ...press, releaseMs: index === 5 ? null : press.attackMs + 225, releaseSequence: index === 5 ? null : 30 + index })) }
    const result = analyze(score, plan, recording)
    expect(result.articulation.coverage).toMatchObject({ authoredTargetCount: 2, analyzedTargetCount: 1, ratio: 0.5 })
    expect(result.articulation.reliability).toBe('limited')
  })

  it('keeps a tie continuation inside one physical articulation target', () => {
    const parsed = parseMusicXml(tiesFixture)
    const score = withNotation(parsed, (note) => ({ ...note, articulations: ['staccato'] }))
    const plan = buildExpectedPerformancePlan(score, { includedPartIds: ['P1'], fallbackQuarterBpm: 120 })
    const result = analyze(score, plan, performance(plan, [64], [0.4]))
    expect(plan.attacks).toHaveLength(1)
    expect(plan.attacks[0]?.sourceNoteIds).toHaveLength(2)
    expect(result.articulation.targets).toHaveLength(1)
  })

  it('caps both expression reliabilities at provisional for ambiguous correspondence', () => {
    const plan = makePlan(Array.from({ length: 8 }, (_, index) => [60 + index]))
    const score = withNotation(wedgeScore(plan), (note) => ({ ...note, articulations: ['staccato'] }))
    const recording = performance(plan, [40, 45, 50, 55, 60, 65, 70, 75], Array(8).fill(0.45))
    const aligned = alignPerformance(plan, recording)
    const alignment = { ...aligned, status: 'ambiguous' as const }
    const noteGrading = gradeNotes({ expectedPlan: plan, recording, alignment, options: { gradingScope: 'full-plan' } })
    const result = analyzeExpression({ normalizedScore: score, expectedPlan: plan, recording, alignment, noteGrading })
    expect(result.dynamics.reliability).toBe('provisional')
    expect(result.articulation.reliability).toBe('provisional')
  })

  it('preserves pedal interaction as a diagnostic without extending physical release', () => {
    const plan = makePlan(Array.from({ length: 6 }, (_, index) => [60 + index]))
    const score = withNotation(expressionScore(plan), (note) => ({ ...note, articulations: ['tenuto'] }))
    const result = analyze(score, plan, performance(plan, [40, 50, 60, 70, 80, 90], Array(6).fill(0.95), undefined, true))
    expect(result.articulation.diagnostics.pedalAffectedCount).toBeGreaterThan(0)
    expect(result.articulation.observations[0]).toMatchObject({ gateRatio: 0.95, pedalAffected: true })
  })

  it('returns deterministic deeply immutable snapshots and rejects identity disagreement', () => {
    const plan = makePlan(Array.from({ length: 8 }, (_, index) => [60 + index]))
    const score = wedgeScore(plan)
    const recording = performance(plan, [40, 45, 50, 55, 60, 65, 70, 75])
    const first = analyze(score, plan, recording)
    const second = analyze(score, plan, recording)
    expect(second).toEqual(first)
    expect(Object.isFrozen(first)).toBe(true)
    expect(Object.isFrozen(first.matchedObservations)).toBe(true)
    const mismatch = analyze({ ...score, id: 'wrong-score' }, plan, recording)
    expect(mismatch).toMatchObject({ status: 'unavailable', dynamics: { score: null }, articulation: { score: null } })
  })
})
