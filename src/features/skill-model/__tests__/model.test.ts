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

function summary(id: string, moduleId: TechniqueModuleId = 'scales', overrides: { readonly score?: number; readonly performedAt?: string; readonly challenge?: Partial<TechniqueChallengeProfileV2>; readonly reliability?: 'reliable' | 'limited' | 'provisional' | 'unavailable'; readonly coverage?: number; readonly exerciseInstanceId?: string; readonly templateId?: string; readonly firstPass?: boolean; readonly omitFacet?: TechniqueFacetId } = {}): TechniqueAttemptSummaryV2 {
  const score = overrides.score ?? 80, reliability = overrides.reliability ?? 'reliable', coverage = overrides.coverage ?? .9
  const profile = challenge({ direction: moduleId === 'scales' ? 'ascending' : 'both', tempoChangeCount: moduleId === 'tempo-control' ? 4 : 0, tempoShape: moduleId === 'tempo-control' ? 'arch' : 'steady', ...overrides.challenge })
  return { schemaVersion: 2, id, moduleId, templateId: overrides.templateId ?? `${moduleId}-standard-v2`, exerciseInstanceId: overrides.exerciseInstanceId ?? `instance-${id}`,
    performedAt: overrides.performedAt ?? '2026-08-20T12:00:00.000Z', durationMs: 3_000, exerciseEngineVersion: 'technique-exercise-1.1.1', techniqueAnalysisEngineVersion: 'technique-analysis-1.1.2',
    challenge: profile, completion: { expectedEventCount: 16, attemptedEventCount: 16, completeCorrectOrIncorrectEventCount: 16, reachedSpanEndIndex: 15, eventCoverageRatio: coverage, spanReachedRatio: 1, completeEnoughForEvidence: true },
    novelty: { exerciseInstanceId: overrides.exerciseInstanceId ?? `instance-${id}`, priorSavedAttemptCount: overrides.firstPass === false ? 1 : 0, firstSavedAttempt: overrides.firstPass !== false },
    facets: FACETS[moduleId].filter((facetId) => facetId !== overrides.omitFacet).map((facetId) => ({ id: facetId, label: facetId, status: reliability === 'unavailable' ? 'unavailable' : 'ready', score: reliability === 'unavailable' ? null : score, reliability, evidenceCount: 8, eligibleCount: 8, coverage, evidenceFamily: facetId.includes('accuracy') || facetId.includes('integrity') ? 'pitch' : facetId.includes('tempo') ? 'tempo' : 'interval-precision', evidenceContext: moduleId === 'sight-reading' ? overrides.firstPass === false ? 'repeat-practice' : 'first-pass' : 'technical-drill', minimumEvidence: 4 })),
  }
}

describe('Skill Model 1.1.1', () => {
  it('returns an immutable unestablished result, not zero, with no evidence', () => {
    const result = deriveSkillRating('scales', [], AS_OF)
    expect(result).toMatchObject({ qualityEstimate: null, confidence: 'unestablished', status: 'unestablished' })
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.challengeEnvelope.tonics)).toBe(true)
    expect(result.challengeEnvelope).toMatchObject({ startingTonics: [], templateIds: [], distinctTemplateCount: 0, eventCounts: [] })
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
    expect(result.contextRatings.find((context) => context.qualityEstimate === 100)?.evidenceAttemptIds).toHaveLength(3)
    expect(result.modelEvidenceAttemptCount).toBe(4)
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

  it('bounds confidence to the latest three attempts per context even with fifty historical repeats', () => {
    const repeated = Array.from({ length: 50 }, (_, index) => summary(`repeat-${index}`, 'scales', { performedAt: `2026-08-${String(1 + index % 20).padStart(2, '0')}T12:00:00.000Z` }))
    const narrow = deriveSkillRating('scales', repeated, AS_OF)
    expect(narrow).toMatchObject({ eligibleAttemptCount: 50, modelEvidenceAttemptCount: 3, eligibleContextCount: 1, confidence: 'low' })
    expect(narrow.modelEvidenceAttemptIds).toHaveLength(3)
    expect(narrow.effectiveEvidenceSupport).toBeLessThanOrEqual(1)

    const oneOther = deriveSkillRating('scales', [...repeated, summary('other', 'scales', { challenge: { tonic: 2 } })], AS_OF)
    expect(oneOther.eligibleAttemptCount).toBe(51)
    expect(oneOther.modelEvidenceAttemptCount).toBe(4)
    expect(oneOther.confidence).not.toBe('high')
  })

  it('uses distribution-aware no-floor authority for confidence while preserving high historical quality', () => {
    const evidence = [
      summary('recent-a', 'scales', { score: 96, challenge: { tonic: 0 } }),
      summary('recent-b', 'scales', { score: 96, challenge: { tonic: 0 } }),
      ...[2, 4, 6].flatMap((tonic) => [0, 1].map((index) => summary(`old-${tonic}-${index}`, 'scales', { score: 96, challenge: { tonic }, performedAt: `2022-01-0${index + 1}T12:00:00.000Z` }))),
    ]
    const result = deriveSkillRating('scales', evidence, AS_OF)
    expect(result.qualityEstimate).toBe(96)
    expect(result.eligibleContextCount).toBe(4)
    expect(result.confidence).toBe('low')
    expect(result.effectiveEvidenceSupport).toBeLessThan(2)
  })

  it('allows broad recent bounded contexts to establish high confidence', () => {
    const evidence = [0, 2, 4, 6].flatMap((tonic) => [0, 1].map((index) => summary(`broad-${tonic}-${index}`, 'scales', { challenge: { tonic }, performedAt: `2026-08-${20 + index}T12:00:00.000Z` })))
    const result = deriveSkillRating('scales', evidence, AS_OF)
    expect(result).toMatchObject({ modelEvidenceAttemptCount: 8, eligibleContextCount: 4, confidence: 'high' })
    expect(result.effectiveEvidenceSupport).toBeGreaterThanOrEqual(3.2)
  })

  it('gives limited low-coverage evidence less confidence authority without rewriting its measured quality', () => {
    const make = (reliability: 'reliable' | 'limited', coverage: number) => [0, 2].flatMap((tonic) => [0, 1].map((index) => summary(`${reliability}-${tonic}-${index}`, 'scales', { score: 90, reliability, coverage, challenge: { tonic } })))
    const limited = deriveSkillRating('scales', make('limited', .55), AS_OF)
    const reliable = deriveSkillRating('scales', make('reliable', .9), AS_OF)
    expect(limited.qualityEstimate).toBe(90)
    expect(reliable.qualityEstimate).toBe(90)
    expect(limited.effectiveEvidenceSupport!).toBeLessThan(reliable.effectiveEvidenceSupport!)
    expect(limited.confidence).toBe('low')
    expect(reliable.confidence).toBe('medium')
  })

  it.each(['chord-fluency', 'keyboard-jumps', 'tempo-control'] as const)('separates %s contexts by subdivision', (moduleId) => {
    const result = deriveSkillRating(moduleId, [summary('quarter', moduleId, { challenge: { subdivision: 1 } }), summary('sixteenth', moduleId, { challenge: { subdivision: 4 } })], AS_OF)
    expect(result.eligibleContextCount).toBe(2)
    expect(result.challengeEnvelope.subdivisions).toEqual([1, 4])
  })

  it.each(['rhythm', 'octaves'] as const)('reports %s tonic as starting-pitch breadth rather than key breadth', (moduleId) => {
    const result = deriveSkillRating(moduleId, [summary('c', moduleId, { challenge: { tonic: 0 } }), summary('g', moduleId, { challenge: { tonic: 7 } })], AS_OF)
    expect(result.eligibleContextCount).toBe(2)
    expect(result.challengeEnvelope.startingTonics).toEqual([0, 7])
    expect(result.challengeEnvelope.tonics).toEqual([])
  })

  it.each(['keyboard-jumps', 'tempo-control'] as const)('reports %s starting-pitch and subdivision provenance', (moduleId) => {
    const result = deriveSkillRating(moduleId, [summary('a', moduleId, { challenge: { tonic: 0, subdivision: 1 } }), summary('b', moduleId, { challenge: { tonic: 7, subdivision: 4 } })], AS_OF)
    expect(result.challengeEnvelope).toMatchObject({ startingTonics: [0, 7], subdivisions: [1, 4] })
  })

  it('keeps seed/instance outside identity, includes template identity, and includes jump starting tonic', () => {
    expect(deriveSkillRating('scales', [summary('a', 'scales', { exerciseInstanceId: 'instance-a' }), summary('b', 'scales', { exerciseInstanceId: 'instance-b' })], AS_OF).eligibleContextCount).toBe(1)
    const templates = deriveSkillRating('scales', [summary('a'), summary('b', 'scales', { templateId: 'scales-alternate-v2' })], AS_OF)
    expect(templates.eligibleContextCount).toBe(2)
    expect(templates.challengeEnvelope.templateIds).toEqual(['scales-alternate-v2', 'scales-standard-v2'])
    expect(templates.challengeEnvelope.distinctTemplateCount).toBe(2)
    expect(deriveSkillRating('keyboard-jumps', [summary('c', 'keyboard-jumps', { challenge: { tonic: 0 } }), summary('d', 'keyboard-jumps', { challenge: { tonic: 7 } })], AS_OF).eligibleContextCount).toBe(2)
  })

  it('decreases current confidence authority deterministically as asOf advances without mutating history', () => {
    const evidence = [0, 2, 4, 6].flatMap((tonic) => [0, 1].map((index) => summary(`dated-${tonic}-${index}`, 'scales', { score: 95, challenge: { tonic }, performedAt: `2026-08-${20 + index}T12:00:00.000Z` })))
    const current = deriveSkillRating('scales', evidence, AS_OF)
    const later = deriveSkillRating('scales', evidence, '2028-08-26T12:00:00.000Z')
    expect(current.confidence).toBe('high')
    expect(later.confidence).toBe('low')
    expect(later.effectiveEvidenceSupport!).toBeLessThan(current.effectiveEvidenceSupport!)
    expect(later.qualityEstimate).toBe(95)
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
    expect(deriveSkillRating('chord-fluency', [summary('quarter', 'chord-fluency', { challenge: { subdivision: 1 } }), summary('sixteenth', 'chord-fluency', { challenge: { subdivision: 4 } })], AS_OF).challengeEnvelope.subdivisions).toEqual([1, 4])
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
    expect(first[0]).not.toHaveProperty('overallPianoLevel')
    expect(first[0]).not.toHaveProperty('difficultyScore')
  })

  it('deep-freezes provenance and keeps all exposed numeric evidence finite and bounded', () => {
    const result = deriveSkillRating('scales', [summary('a'), summary('b')], AS_OF)
    expect(Object.isFrozen(result.contextRatings)).toBe(true)
    expect(Object.isFrozen(result.contextRatings[0])).toBe(true)
    expect(Object.isFrozen(result.modelEvidenceAttemptIds)).toBe(true)
    expect(Object.isFrozen(result.challengeEnvelope.startingTonics)).toBe(true)
    expect(Object.isFrozen(result.challengeEnvelope.templateIds)).toBe(true)
    expect(Object.isFrozen(result.challengeEnvelope.eventCounts)).toBe(true)
    for (const value of [result.qualityEstimate, result.consistency, result.effectiveEvidenceSupport, ...result.contextRatings.flatMap((context) => [context.qualityEstimate, context.averageCoverage, context.reliableAttemptFraction, context.effectiveAuthority])]) {
      expect(value).not.toBeNull()
      expect(Number.isFinite(value)).toBe(true)
      expect(value!).toBeGreaterThanOrEqual(0)
    }
    expect(result.qualityEstimate!).toBeLessThanOrEqual(100)
    expect(result.consistency!).toBeLessThanOrEqual(100)
    expect(result.effectiveEvidenceSupport!).toBeLessThanOrEqual(result.eligibleContextCount)
    result.contextRatings.forEach((context) => {
      expect(context.qualityEstimate).toBeLessThanOrEqual(100)
      expect(context.averageCoverage).toBeLessThanOrEqual(1)
      expect(context.reliableAttemptFraction).toBeLessThanOrEqual(1)
      expect(context.effectiveAuthority).toBeLessThanOrEqual(1)
    })
  })

  it('rejects invalid asOf and invalid numeric summaries', () => {
    expect(() => deriveSkillRating('scales', [], 'not-a-date')).toThrow(RangeError)
    const malformed = { ...summary('bad'), challenge: { ...summary('bad').challenge, targetTempoBpm: Number.NaN } }
    expect(deriveSkillRating('scales', [malformed], AS_OF).exclusions[0]?.code).toBe('invalid-summary')
  })
})
