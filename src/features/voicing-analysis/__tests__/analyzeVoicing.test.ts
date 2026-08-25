import { describe, expect, it } from 'vitest'
import { alignPerformance } from '../../alignment/alignPerformance'
import { makePlan, makeRecording } from '../../alignment/__tests__/fixtures'
import { analyzeExpression } from '../../expression-analysis/analyzeExpression'
import { musicalTime } from '../../musicxml/musicalTime'
import type { NormalizedScore } from '../../musicxml/types'
import { gradeNotes } from '../../note-grading/gradeNotes'
import type { PerformanceRecording } from '../../performance/types'
import { makeScore } from '../../performance-results/__tests__/fixtures'
import { analyzeVoicing } from '../analyzeVoicing'
import type { VoicingIntentProfile } from '../types'
import { buildVoiceLanes } from '../voiceLanes'

function setup(velocities: readonly number[], mutateScore?: (score: NormalizedScore) => NormalizedScore, mutatePitchIndex?: number, profileOverride?: VoicingIntentProfile | null) {
  const plan = makePlan(Array.from({ length: 4 }, (_, index) => [60 + index, 48 + index]), { measureIndices: [0, 0, 1, 1] })
  const base = makeRecording(plan.attacks.map((attack, index) => ({ midi: index === mutatePitchIndex ? attack.midi + 1 : attack.midi, ms: 1_000 + Math.floor(index / 2) * 500, velocity: velocities[index] ?? 64 })), { planId: plan.id })
  const recording: PerformanceRecording = { ...base, keyPresses: base.keyPresses.map((press, index) => ({ ...press, releaseMs: press.attackMs + 250, releaseSequence: 100 + index })), statistics: { ...base.statistics, noteReleaseCount: base.keyPresses.length, openNoteCount: 0 } }
  const score = mutateScore?.(makeScore(plan, 2, 2)) ?? makeScore(plan, 2, 2)
  const alignment = alignPerformance(plan, recording)
  const note = gradeNotes({ expectedPlan: plan, recording, alignment, options: { gradingScope: 'full-plan' } })
  const expression = analyzeExpression({ normalizedScore: score, expectedPlan: plan, recording, alignment, noteGrading: note })
  const lanes = buildVoiceLanes(score, plan.includedPartIds)
  const foreground = lanes.find((lane) => lane.staff === 1)!
  const support = lanes.find((lane) => lane.staff === 2)!
  const profile: VoicingIntentProfile | null = profileOverride === undefined ? { id: 'intent:test', scoreVersionId: 'score-version:test', updatedAt: '2026-08-25T12:00:00.000Z', regions: [{ id: 'region:1', startMeasureIndex: 0, endMeasureIndex: 1, foregroundLaneIds: [foreground.id], supportLaneIds: [support.id] }] } : profileOverride
  const result = analyzeVoicing({ normalizedScore: score, scoreVersionId: 'score-version:test', expectedPlan: plan, recording, alignment, noteGrading: note, expressionAnalysis: expression, intentProfile: profile })
  return { result, lanes, foreground, support, score, plan, recording, alignment, note, expression }
}

describe('configured Voicing analysis', () => {
  it('detects deterministic part/staff/voice lanes without naming a melody', () => {
    const data = setup([95, 30, 90, 35, 85, 40, 80, 45], undefined, undefined, null)
    expect(data.lanes.map((lane) => lane.label)).toEqual(['Piano · Staff 1 · Voice 1', 'Piano · Staff 2 · Voice 2'])
    expect(data.result).toMatchObject({ status: 'ready', mode: 'descriptive', score: null })
    expect(JSON.stringify(data.result).toLowerCase()).not.toContain('melody')
  })

  it('scores each simultaneous configured event once and caps clear projection', () => {
    const projected = setup([95, 30, 90, 35, 85, 40, 80, 45]).result
    const extreme = setup([127, 5, 125, 7, 123, 9, 121, 11]).result
    expect(projected.score).toBeGreaterThan(0.9)
    expect(extreme.score).toBe(projected.score)
    expect(projected.targets).toHaveLength(4)
    expect(projected.observations).toHaveLength(4)
  })

  it('returns a middle result for balance and a lower result when support dominates', () => {
    const balanced = setup([40, 42, 50, 52, 60, 62, 70, 72]).result.score!
    expect(balanced).toBeGreaterThan(0.15)
    expect(balanced).toBeLessThan(0.5)
    expect(setup([30, 95, 35, 90, 40, 85, 45, 80]).result.score).toBeLessThan(0.1)
  })

  it('is invariant to a constant raw velocity shift when normalization remains valid', () => {
    const lower = setup([55, 40, 60, 45, 65, 50, 70, 55]).result
    const higher = setup([75, 60, 80, 65, 85, 70, 90, 75]).result
    expect(higher.score).toBeCloseTo(lower.score!, 10)
  })

  it('uses complete correct-note evidence and does not double-penalize a wrong pitch', () => {
    const result = setup([95, 30, 90, 35, 85, 40, 80, 45], undefined, 3).result
    expect(result.coverage.analyzedTargetCount).toBeLessThan(result.coverage.configuredTargetCount)
    expect(result.observations.every((observation) => observation.score > 0.9)).toBe(true)
  })

  it('excludes lane-specific dynamic and accent conflicts', () => {
    const dynamics = setup([95, 30, 90, 35, 85, 40, 80, 45], (score) => ({ ...score, dynamicEvents: [
      { id: 'p', position: musicalTime(0), measureOnset: musicalTime(0), partId: 'P1', measureIndex: 0, measureNumber: '1', staff: 1, voice: '1', marking: 'p' },
      { id: 'f', position: musicalTime(0), measureOnset: musicalTime(0), partId: 'P1', measureIndex: 0, measureNumber: '1', staff: 2, voice: '2', marking: 'f' },
    ] })).result
    expect(dynamics.targets).toHaveLength(0)
    expect(dynamics.exclusions[0]?.reason).toContain('dynamics')
    const accent = setup([95, 30, 90, 35, 85, 40, 80, 45], (score) => ({ ...score, parts: score.parts.map((part) => ({ ...part, measures: part.measures.map((measure) => ({ ...measure, events: measure.events.map((event) => event.type === 'note' && event.staff === 1 ? { ...event, articulations: ['accent'] } : event) })) })) })).result
    expect(accent.targets).toHaveLength(0)
    expect(accent.exclusions[0]?.reason).toContain('accent')
  })

  it('is deterministic and deeply immutable across multiple configured regions', () => {
    const first = setup([95, 30, 90, 35, 85, 40, 80, 45])
    const profile: VoicingIntentProfile = { id: 'regions', scoreVersionId: 'score-version:test', updatedAt: '2026-08-25T12:00:00.000Z', regions: [
      { id: 'r1', startMeasureIndex: 0, endMeasureIndex: 0, foregroundLaneIds: [first.foreground.id], supportLaneIds: [first.support.id] },
      { id: 'r2', startMeasureIndex: 1, endMeasureIndex: 1, foregroundLaneIds: [first.foreground.id], supportLaneIds: [first.support.id] },
    ] }
    const one = setup([95, 30, 90, 35, 85, 40, 80, 45], undefined, undefined, profile).result
    const two = setup([95, 30, 90, 35, 85, 40, 80, 45], undefined, undefined, profile).result
    expect(two).toEqual(one)
    expect(one.regionResults).toHaveLength(2)
    expect(Object.isFrozen(one) && Object.isFrozen(one.observations) && Object.isFrozen(one.observations[0])).toBe(true)
  })
})
