import { describe, expect, it } from 'vitest'
import type { TechniqueAttemptSummary, TechniqueAttemptSummaryV2 } from '../../persistence/types'
import type { TechniqueChallengeProfileV2, TechniqueFacetId, TechniqueModuleId } from '../../technique/types'
import { deriveAllSkillRatings, deriveSkillRating } from '../model'

const AS_OF = '2026-08-26T12:00:00.000Z'
const FACETS: Readonly<Record<TechniqueModuleId, readonly TechniqueFacetId[]>> = {
  'sight-reading': ['note-accuracy', 'pulse-continuity'], rhythm: ['rhythm-precision', 'pulse-continuity'],
  'chord-fluency': ['chord-accuracy', 'chord-synchronization'], scales: ['note-accuracy', 'onset-evenness', 'direction-change-continuity'],
  arpeggios: ['note-accuracy', 'arpeggio-transition-consistency'], octaves: ['octave-integrity', 'onset-evenness'],
  'keyboard-jumps': ['landing-accuracy', 'jump-timing-consistency', 'recovery-continuity'],
  'tempo-control': ['target-tempo-control', 'tempo-stability', 'tempo-transition-control'],
}

function challenge(overrides: Partial<TechniqueChallengeProfileV2> = {}): TechniqueChallengeProfileV2 {
  return { targetTempoBpm: 80, eventCount: 16, expectedDuration: { numerator: 4, denominator: 1 }, expectedDurationMs: 3_000,
    minimumMidi: 60, maximumMidi: 72, pitchSpanSemitones: 12, maximumChordSize: 1, maximumJumpSemitones: 2,
    rhythmicDensity: 4, smallestSubdivision: 4, tempoChangeCount: 0, octaveSpan: 1, moduleSpecific: {}, tonic: 0,
    mode: 'major', declaredHandContext: 'right', direction: 'ascending', subdivision: 4, chordInversion: 0,
    jumpSemitones: 12, tempoShape: 'steady', ...overrides }
}

function summary(id: string, moduleId: TechniqueModuleId = 'scales', overrides: { readonly score?: number; readonly performedAt?: string; readonly challenge?: Partial<TechniqueChallengeProfileV2>; readonly reliability?: 'reliable' | 'limited' | 'provisional' | 'unavailable'; readonly coverage?: number; readonly exerciseInstanceId?: string; readonly firstPass?: boolean; readonly omitFacet?: TechniqueFacetId } = {}): TechniqueAttemptSummaryV2 {
  const score = overrides.score ?? 80, reliability = overrides.reliability ?? 'reliable', coverage = overrides.coverage ?? .9
  const profile = challenge({ direction: moduleId === 'scales' ? 'ascending' : 'both', tempoChangeCount: moduleId === 'tempo-control' ? 4 : 0, tempoShape: moduleId === 'tempo-control' ? 'arch' : 'steady', ...overrides.challenge })
  return { schemaVersion: 2, id, moduleId, templateId: `${moduleId}-standard-v2`, exerciseInstanceId: overrides.exerciseInstanceId ?? `instance-${id}`,
    performedAt: overrides.performedAt ?? '2026-08-20T12:00:00.000Z', durationMs: 3_000, exerciseEngineVersion: 'technique-exercise-1.1.1', techniqueAnalysisEngineVersion: 'technique-analysis-1.1.2',
    challenge: profile, completion: { expectedEventCount: 16, attemptedEventCount: 16, completeCorrectOrIncorrectEventCount: 16, reachedSpanEndIndex: 15, eventCoverageRatio: coverage, spanReachedRatio: 1, completeEnoughForEvidence: true },
    novelty: { exerciseInstanceId: overrides.exerciseInstanceId ?? `instance-${id}`, priorSavedAttemptCount: overrides.firstPass === false ? 1 : 0, firstSavedAttempt: overrides.firstPass !== false },
    facets: FACETS[moduleId].filter((facetId) => facetId !== overrides.omitFacet).map((facetId) => ({ id: facetId, label: facetId, status: reliability === 'unavailable' ? 'unavailable' : 'ready', score: reliability === 'unavailable' ? null : score, reliability, evidenceCount: 8, eligibleCount: 8, coverage, evidenceFamily: facetId.includes('accuracy') || facetId.includes('integrity') ? 'pitch' : facetId.includes('tempo') ? 'tempo' : 'interval-precision', evidenceContext: moduleId === 'sight-reading' ? overrides.firstPass === false ? 'repeat-practice' : 'first-pass' : 'technical-drill', minimumEvidence: 4 })),
  }
}

describe('Skill Model 1.0.0', () => {
  it('returns an immutable unestablished result, not zero, with no evidence', () => {
    const result = deriveSkillRating('scales', [], AS_OF)
    expect(result).toMatchObject({ qualityEstimate: null, confidence: 'unestablished', status: 'unestablished' })
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.challengeEnvelope.tonics)).toBe(true)
  })

  it('excludes legacy engine pairs without rewriting or producing fake evidence', () => {
    const legacy = { ...summary('legacy'), exerciseEngineVersion: 'technique-exercise-1.1.0', techniqueAnalysisEngineVersion: 'technique-analysis-1.1.0' } as TechniqueAttemptSummary
    expect(deriveSkillRating('scales', [legacy], AS_OF)).toMatchObject({ qualityEstimate: null, exclusions: [{ code: 'legacy-engine' }] })
  })

  it('uses an equal arithmetic vote for applicable ready facets and keeps limited reliability out of quality', () => {
    const source = summary('one', 'rhythm', { reliability: 'limited' })
    const facets = source.facets.map((facet, index) => ({ ...facet, score: index === 0 ? 90 : 70 }))
    const result = deriveSkillRating('rhythm', [{ ...source, facets }], AS_OF)
    expect(result).toMatchObject({ qualityEstimate: 80, confidence: 'low', eligibleAttemptCount: 1 })
  })

  it('requires applicable facets and minimum coverage, but not non-applicable turn or steady-transition facets', () => {
    expect(deriveSkillRating('scales', [summary('missing', 'scales', { omitFacet: 'note-accuracy' })], AS_OF).exclusions[0]?.code).toBe('missing-required-facet')
    expect(deriveSkillRating('scales', [summary('thin', 'scales', { coverage: .54 })], AS_OF).exclusions[0]?.code).toBe('insufficient-coverage')
    const ascending = summary('ascending', 'scales', { omitFacet: 'direction-change-continuity' })
    const steady = summary('steady', 'tempo-control', { challenge: { tempoChangeCount: 0, tempoShape: 'steady' }, omitFacet: 'tempo-transition-control' })
    expect(deriveSkillRating('scales', [ascending], AS_OF).status).toBe('established')
    expect(deriveSkillRating('tempo-control', [steady], AS_OF).status).toBe('established')
  })

  it('groups different seeds/instances in one context and separates BPM and tonic contexts', () => {
    const same = [summary('a'), summary('b')]
    expect(deriveSkillRating('scales', same, AS_OF).eligibleContextCount).toBe(1)
    const varied = [...same, summary('c', 'scales', { challenge: { targetTempoBpm: 100 } }), summary('d', 'scales', { challenge: { tonic: 2 } })]
    expect(deriveSkillRating('scales', varied, AS_OF).eligibleContextCount).toBe(3)
  })

  it('prevents many repeats of one context from dominating distinct context estimates', () => {
    const repeats = Array.from({ length: 20 }, (_, index) => summary(`repeat-${index}`, 'scales', { score: 100, performedAt: `2026-08-${String(index + 1).padStart(2, '0')}T12:00:00.000Z` }))
    const other = summary('other', 'scales', { score: 40, challenge: { targetTempoBpm: 100 } })
    const result = deriveSkillRating('scales', [...repeats, other], AS_OF)
    expect(result.eligibleContextCount).toBe(2)
    expect(result.qualityEstimate).toBeGreaterThan(65)
    expect(result.qualityEstimate).toBeLessThan(75)
    expect(result.contextRatings.find((context) => context.contextId.includes('bpm=80'))?.evidenceAttemptIds).toHaveLength(3)
  })

  it('accepts distinct first-pass sight-reading stimuli and excludes repeats', () => {
    const result = deriveSkillRating('sight-reading', [summary('first-a', 'sight-reading'), summary('first-b', 'sight-reading'), summary('repeat', 'sight-reading', { firstPass: false })], AS_OF)
    expect(result.eligibleAttemptCount).toBe(2)
    expect(result.eligibleContextCount).toBe(1)
    expect(result.challengeEnvelope.distinctFirstPassExerciseInstances).toBe(2)
    expect(result.exclusions).toContainEqual(expect.objectContaining({ attemptId: 'repeat', code: 'repeat-sight-reading' }))
  })

  it('keeps high narrow quality low-confidence while broad moderate evidence can become high-confidence', () => {
    const narrow = Array.from({ length: 10 }, (_, index) => summary(`n-${index}`, 'scales', { score: 98 }))
    expect(deriveSkillRating('scales', narrow, AS_OF)).toMatchObject({ qualityEstimate: 98, confidence: 'low' })
    const broad = Array.from({ length: 12 }, (_, index) => summary(`b-${index}`, 'scales', { score: 73, challenge: { tonic: index % 6, targetTempoBpm: 70 + (index % 2) * 10 } }))
    expect(deriveSkillRating('scales', broad, AS_OF)).toMatchObject({ qualityEstimate: 73, confidence: 'high' })
  })

  it('gently favors recent context evidence and rejects future dates', () => {
    const oldHigh = summary('old', 'scales', { score: 100, performedAt: '2025-08-20T12:00:00.000Z' })
    const recentLow = summary('recent', 'scales', { score: 50, challenge: { tonic: 2 } })
    const result = deriveSkillRating('scales', [oldHigh, recentLow, summary('future', 'scales', { performedAt: '2027-01-01T00:00:00.000Z' })], AS_OF)
    expect(result.qualityEstimate).toBeLessThan(75)
    expect(result.exclusions).toContainEqual(expect.objectContaining({ code: 'future-dated' }))
  })

  it('reports challenge breadth without assigning key difficulty', () => {
    const scales = deriveSkillRating('scales', [0, 2, 6, 10].map((tonic, index) => summary(`s-${index}`, 'scales', { challenge: { tonic, mode: index % 2 ? 'natural-minor' : 'major', octaveSpan: index % 2 ? 2 : 1, direction: index % 2 ? 'both' : 'ascending', declaredHandContext: index % 2 ? 'left' : 'right' } })), AS_OF)
    expect(scales.challengeEnvelope).toMatchObject({ tonics: [0, 2, 6, 10], modes: ['major', 'natural-minor'], octaveSpans: [1, 2], declaredHandContexts: ['left', 'right'] })
    const chords = deriveSkillRating('chord-fluency', [0, 1, 2].map((value) => summary(`c-${value}`, 'chord-fluency', { challenge: { chordInversion: value as 0 | 1 | 2 } })), AS_OF)
    expect(chords.challengeEnvelope.chordInversions).toEqual([0, 1, 2])
    const jumps = deriveSkillRating('keyboard-jumps', [7, 24].map((value) => summary(`j-${value}`, 'keyboard-jumps', { challenge: { jumpSemitones: value as 7 | 24 } })), AS_OF)
    expect(jumps.challengeEnvelope).toMatchObject({ jumpDistancesSemitones: [7, 24], maximumJumpDistanceSemitones: 24 })
    const tempo = deriveSkillRating('tempo-control', ['steady', 'arch'].map((shape) => summary(`t-${shape}`, 'tempo-control', { challenge: { tempoShape: shape as 'steady' | 'arch', tempoChangeCount: shape === 'steady' ? 0 : 4 }, omitFacet: shape === 'steady' ? 'tempo-transition-control' : undefined })), AS_OF)
    expect(tempo.challengeEnvelope.tempoShapes).toEqual(['arch', 'steady'])
  })

  it('derives exactly eight deterministic ratings with no universal aggregate field', () => {
    const first = deriveAllSkillRatings([summary('scale')], AS_OF)
    expect(first).toEqual(deriveAllSkillRatings([summary('scale')], AS_OF))
    expect(first).toHaveLength(8)
    expect(new Set(first.map((rating) => rating.moduleId)).size).toBe(8)
    expect(first[0]).not.toHaveProperty('overallScore')
    expect(first[0]).not.toHaveProperty('skillLevel')
  })

  it('rejects invalid asOf and invalid numeric summaries', () => {
    expect(() => deriveSkillRating('scales', [], 'not-a-date')).toThrow(RangeError)
    const malformed = { ...summary('bad'), challenge: { ...summary('bad').challenge, targetTempoBpm: Number.NaN } }
    expect(deriveSkillRating('scales', [malformed], AS_OF).exclusions[0]?.code).toBe('invalid-summary')
  })
})
