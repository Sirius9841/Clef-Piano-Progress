import { describe, expect, it } from 'vitest'
import type { AttemptSummary } from '../../persistence/types'
import { deriveArrangementMastery } from '../model'
import { MASTERY_MODEL_OPTIONS } from '../options'

const AS_OF = '2026-08-26T12:00:00.000Z'

function summary(id: string, overrides: Partial<AttemptSummary> = {}): AttemptSummary {
  return { id, arrangementId: 'arr-1', scoreVersionId: 'score-current', practiceSessionId: `session-${id}`, performedAt: '2026-08-20T12:00:00.000Z', durationMs: 60_000,
    practiceSpeedMultiplier: 1, gradingScope: 'full-plan', reliability: 'reliable', notes: .95, rhythm: .9, tempo: .9, ...overrides }
}

function derive(attempts: readonly AttemptSummary[], overrides: Partial<{ arrangementId: string; scoreVersionId: string; asOf: string }> = {}) {
  return deriveArrangementMastery({ arrangementId: overrides.arrangementId ?? 'arr-1', scoreVersionId: overrides.scoreVersionId ?? 'score-current', attempts, asOf: overrides.asOf ?? AS_OF })
}

describe('Mastery Model 1.1.1', () => {
  it('keeps the explicit component weights normalized', () => {
    expect(Object.values(MASTERY_MODEL_OPTIONS.weights).reduce((sum, value) => sum + value, 0)).toBe(1)
  })
  it('returns deeply immutable unestablished state, not zero, for no evidence', () => {
    const result = derive([])
    expect(result).toMatchObject({ status: 'unestablished', mastery: null, confidence: 'unestablished' })
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.evidenceAttemptIds)).toBe(true)
  })

  it('excludes partial, provisional, unavailable, old-version, and wrong-arrangement attempts explicitly', () => {
    const result = derive([
      summary('partial', { gradingScope: 'aligned-span' }), summary('provisional', { reliability: 'provisional' }),
      summary('unavailable', { reliability: 'unavailable' }), summary('old', { scoreVersionId: 'score-old' }),
      summary('wrong', { arrangementId: 'arr-2' }),
    ])
    expect(result.mastery).toBeNull()
    expect(result.exclusions.map((item) => item.code)).toEqual(expect.arrayContaining(['partial-scope', 'provisional', 'different-score-version', 'wrong-arrangement']))
  })

  it('keeps one strong attempt low-confidence without inventing demonstrated speed', () => {
    const result = derive([summary('one')])
    expect(result.status).toBe('ready')
    expect(result.confidence).toBe('low')
    expect(result.demonstratedSpeedMultiplier).toBeNull()
    expect(result.demonstratedSpeedStatus).toBe('needs-repetition')
    expect(result.mastery).toBeLessThan(60)
  })

  it('separates repeated controlled 60% speed from repeated full-speed evidence', () => {
    const slow = derive([summary('slow-1', { practiceSpeedMultiplier: .6 }), summary('slow-2', { practiceSpeedMultiplier: .6 })])
    const full = derive([summary('full-1'), summary('full-2')])
    expect(slow.demonstratedSpeedMultiplier).toBe(.6)
    expect(full.demonstratedSpeedMultiplier).toBe(1)
    expect(full.mastery!).toBeGreaterThan(slow.mastery! + 10)
  })

  it('requires two qualifying takes in a canonical speed bucket', () => {
    expect(derive([summary('one')]).demonstratedSpeedMultiplier).toBeNull()
    expect(derive([summary('a', { practiceSpeedMultiplier: .7999999 }), summary('b', { practiceSpeedMultiplier: .8 })]).demonstratedSpeedMultiplier).toBe(.8)
  })

  it('prevents ancient full-speed evidence from borrowing freshness from a recent reduced-speed take', () => {
    const result = derive([
      summary('old-full-a', { performedAt: '2025-08-20T12:00:00.000Z' }),
      summary('old-full-b', { performedAt: '2025-08-19T12:00:00.000Z' }),
      summary('recent-slow', { practiceSpeedMultiplier: .6 }),
    ])
    expect(result.demonstratedSpeedMultiplier).toBeNull()
    expect(result.demonstratedSpeedStatus).toBe('needs-current-support')
    expect(result.demonstratedSpeedCandidateMultiplier).toBe(1)
    expect(result.demonstratedSpeedQualifyingAttemptCount).toBe(2)
    expect(result.demonstratedSpeedEffectiveSupport!).toBeLessThan(MASTERY_MODEL_OPTIONS.minimumDemonstratedSpeedSupport)
    expect(result.demonstratedSpeedEvidenceAttemptIds).toEqual(['old-full-a', 'old-full-b'])
  })

  it('establishes full speed from two recent supported qualifying takes with transparent provenance', () => {
    const result = derive([summary('recent-a'), summary('recent-b')])
    expect(result.demonstratedSpeedMultiplier).toBe(1)
    expect(result.demonstratedSpeedStatus).toBe('established')
    expect(result.demonstratedSpeedEffectiveSupport!).toBeGreaterThanOrEqual(MASTERY_MODEL_OPTIONS.minimumDemonstratedSpeedSupport)
    expect(result.demonstratedSpeedEffectiveSessionSupport!).toBeGreaterThanOrEqual(MASTERY_MODEL_OPTIONS.highConfidenceDemonstratedSpeedSessionSupport)
    expect(result.demonstratedSpeedSupportingSessionIds).toEqual(['session-recent-a', 'session-recent-b'])
    expect(result.demonstratedSpeedEvidenceAttemptIds).toEqual(['recent-a', 'recent-b'])
    expect(result.demonstratedSpeedLastEvidenceAt).toBe('2026-08-20T12:00:00.000Z')
  })

  it('lets demonstrated speed expire smoothly as explicit asOf advances over frozen summaries', () => {
    const attempts = [summary('a', { performedAt: '2026-01-02T12:00:00.000Z' }), summary('b', { performedAt: '2026-01-01T12:00:00.000Z' })]
    const current = derive(attempts, { asOf: '2026-01-10T12:00:00.000Z' })
    const later = derive(attempts, { asOf: '2027-01-10T12:00:00.000Z' })
    expect(current.demonstratedSpeedMultiplier).toBe(1)
    expect(later.demonstratedSpeedMultiplier).toBeNull()
    expect(later.demonstratedSpeedStatus).toBe('needs-current-support')
    expect(later.demonstratedSpeedEffectiveSupport!).toBeLessThan(current.demonstratedSpeedEffectiveSupport!)
    expect(later.demonstratedSpeedEffectiveSessionSupport!).toBeLessThan(current.demonstratedSpeedEffectiveSessionSupport!)
  })

  it('does not allow weak Tempo to qualify clean demonstrated speed and preserves the minimum dimension', () => {
    const result = derive([summary('a', { tempo: .35 }), summary('b', { tempo: .35 })])
    expect(result.demonstratedSpeedMultiplier).toBeNull()
    expect(result.minimumDimension).toMatchObject({ metric: 'tempo', value: 35 })
  })

  it('makes same-session repeated evidence less confident than multiple-session evidence', () => {
    const same = derive([summary('a', { practiceSessionId: 'same' }), summary('b', { practiceSessionId: 'same' })])
    const separate = derive([summary('a'), summary('b')])
    expect(same.confidence).toBe('low')
    expect(separate.confidence).toBe('medium')
    expect(same.demonstratedSpeedMultiplier).toBe(1)
    expect(same.demonstratedSpeedSessionCount).toBe(1)
    expect(same.demonstratedSpeedEffectiveSessionSupport).toBeLessThanOrEqual(1)
    expect(separate.demonstratedSpeedEffectiveSessionSupport!).toBeGreaterThan(same.demonstratedSpeedEffectiveSessionSupport!)
  })

  it('blocks High confidence when a stale second full-speed session supplies only raw provenance', () => {
    const result = derive([
      summary('full-current-a', { practiceSessionId: 'S1' }),
      summary('full-current-b', { practiceSessionId: 'S1' }),
      summary('full-stale-c', { practiceSessionId: 'S2', performedAt: '2025-08-20T12:00:00.000Z' }),
      summary('lower-d', { practiceSessionId: 'S3', practiceSpeedMultiplier: .8 }),
      summary('lower-e', { practiceSessionId: 'S4', practiceSpeedMultiplier: .8 }),
      summary('lower-f', { practiceSessionId: 'S5', practiceSpeedMultiplier: .8 }),
    ])
    expect(result.demonstratedSpeedMultiplier).toBe(1)
    expect(result.demonstratedSpeedSessionCount).toBe(2)
    expect(result.demonstratedSpeedEffectiveSessionSupport!).toBeLessThan(MASTERY_MODEL_OPTIONS.highConfidenceDemonstratedSpeedSessionSupport)
    expect(result.effectiveEvidenceSupport!).toBeGreaterThanOrEqual(MASTERY_MODEL_OPTIONS.highConfidenceEffectiveEvidenceSupport)
    expect(result.effectiveSessionSupport!).toBeGreaterThanOrEqual(MASTERY_MODEL_OPTIONS.highConfidenceEffectiveSessionSupport)
    expect(result.confidence).not.toBe('high')
  })

  it('allows High confidence when full speed has two current sessions and other evidence is sufficient', () => {
    const result = derive([
      summary('full-a', { practiceSessionId: 'S1' }),
      summary('full-b', { practiceSessionId: 'S2' }),
      summary('lower-c', { practiceSessionId: 'S3', practiceSpeedMultiplier: .8 }),
      summary('lower-d', { practiceSessionId: 'S4', practiceSpeedMultiplier: .8 }),
      summary('lower-e', { practiceSessionId: 'S5', practiceSpeedMultiplier: .8 }),
    ])
    expect(result.demonstratedSpeedMultiplier).toBe(1)
    expect(result.demonstratedSpeedSessionCount).toBe(2)
    expect(result.demonstratedSpeedEffectiveSessionSupport!).toBeGreaterThanOrEqual(MASTERY_MODEL_OPTIONS.highConfidenceDemonstratedSpeedSessionSupport)
    expect(result.confidence).toBe('high')
  })

  it('does not borrow current session authority from other speed buckets', () => {
    const result = derive([
      summary('full-a', { practiceSessionId: 'S1' }),
      summary('full-b', { practiceSessionId: 'S1' }),
      summary('lower-c', { practiceSessionId: 'S2', practiceSpeedMultiplier: .8 }),
      summary('lower-d', { practiceSessionId: 'S3', practiceSpeedMultiplier: .8 }),
      summary('lower-e', { practiceSessionId: 'S4', practiceSpeedMultiplier: .8 }),
    ])
    expect(result.demonstratedSpeedMultiplier).toBe(1)
    expect(result.effectiveSessionSupport!).toBeGreaterThanOrEqual(MASTERY_MODEL_OPTIONS.highConfidenceEffectiveSessionSupport)
    expect(result.demonstratedSpeedEffectiveSessionSupport).toBeLessThanOrEqual(1)
    expect(result.confidence).not.toBe('high')
  })

  it('gives limited stale speed evidence less attempt and session authority than reliable stale evidence', () => {
    const reliable = derive([summary('a', { performedAt: '2026-04-20T12:00:00.000Z' }), summary('b', { performedAt: '2026-04-19T12:00:00.000Z' })])
    const limited = derive([summary('a', { performedAt: '2026-04-20T12:00:00.000Z', reliability: 'limited' }), summary('b', { performedAt: '2026-04-19T12:00:00.000Z', reliability: 'limited' })])
    expect(limited.demonstratedSpeedEffectiveSupport!).toBeLessThan(reliable.demonstratedSpeedEffectiveSupport!)
    expect(limited.demonstratedSpeedEffectiveSessionSupport!).toBeLessThan(reliable.demonstratedSpeedEffectiveSessionSupport!)
  })

  it('uses bounded session authority so one fresh take cannot make four stale sessions high-confidence', () => {
    const mixed = derive([
      summary('recent'),
      ...Array.from({ length: 4 }, (_, index) => summary(`old-${index}`, { performedAt: `2025-08-${String(16 + index).padStart(2, '0')}T12:00:00.000Z` })),
    ])
    expect(mixed.confidence).not.toBe('high')
    expect(mixed.effectiveEvidenceSupport!).toBeLessThan(2)
    expect(mixed.effectiveSessionSupport!).toBeLessThan(2)
  })

  it('still permits high confidence from five genuinely recent reliable takes across sessions', () => {
    const attempts = Array.from({ length: 5 }, (_, index) => summary(`recent-${index}`, { performedAt: `2026-08-${20 + index}T12:00:00.000Z`, practiceSessionId: `session-${index % 3}` }))
    const result = derive(attempts)
    expect(result.confidence).toBe('high')
    expect(result.effectiveEvidenceSupport!).toBeGreaterThanOrEqual(MASTERY_MODEL_OPTIONS.highConfidenceEffectiveEvidenceSupport)
    expect(result.effectiveSessionSupport!).toBeGreaterThanOrEqual(MASTERY_MODEL_OPTIONS.highConfidenceEffectiveSessionSupport)
  })

  it('derives lower robust consistency for a volatile series', () => {
    const stable = derive([.9, .91, .92, .91].map((value, index) => summary(`s-${index}`, { notes: value, rhythm: value, tempo: value })))
    const volatile = derive([.99, .65, .94, .7].map((value, index) => summary(`v-${index}`, { notes: value, rhythm: value, tempo: value })))
    expect(stable.consistency!).toBeGreaterThan(volatile.consistency!)
    expect(stable.mastery!).toBeGreaterThan(volatile.mastery!)
  })

  it('uses only the latest eight eligible attempts and applies gentle old-evidence recency', () => {
    const many = Array.from({ length: 10 }, (_, index) => summary(`${index}`, { performedAt: `2026-08-${String(index + 1).padStart(2, '0')}T12:00:00.000Z` }))
    expect(derive(many).evidenceAttemptIds).toHaveLength(8)
    const recent = derive([summary('r1'), summary('r2')])
    const old = derive([summary('o1', { performedAt: '2025-08-20T12:00:00.000Z' }), summary('o2', { performedAt: '2025-08-19T12:00:00.000Z' })])
    expect(old.recencyFactor!).toBeGreaterThanOrEqual(.82)
    expect(old.mastery!).toBeLessThan(recent.mastery!)
    expect(old.confidence).toBe('low')
  })

  it('derives final recency from the evidence distribution rather than only the newest take', () => {
    const freshOnly = derive([summary('fresh')])
    const mixed = derive([summary('fresh'), ...Array.from({ length: 4 }, (_, index) => summary(`old-${index}`, { performedAt: `2025-08-${String(16 + index).padStart(2, '0')}T12:00:00.000Z` }))])
    expect(mixed.recencyFactor!).toBeLessThan(freshOnly.recencyFactor!)
    expect(mixed.recencyFactor!).toBeGreaterThanOrEqual(MASTERY_MODEL_OPTIONS.recencyFactorFloor)
  })

  it('resets evidence at a new ScoreVersion without deleting old history', () => {
    const attempts = [summary('v1-a', { scoreVersionId: 'score-old' }), summary('v1-b', { scoreVersionId: 'score-old' })]
    const result = derive(attempts)
    expect(result.status).toBe('unestablished')
    expect(result.exclusions).toHaveLength(2)
  })

  it('is independent of repertoire status and practice time because neither enters the input', () => {
    const result = derive([summary('a'), summary('b')])
    expect(result).not.toHaveProperty('repertoireStatus')
    expect(result).not.toHaveProperty('practiceTime')
    expect(result).not.toHaveProperty('expression')
  })

  it('keeps high confidence separate from score and requires broad recent session evidence', () => {
    const attempts = Array.from({ length: 5 }, (_, index) => summary(`a-${index}`, { practiceSessionId: `session-${index % 3}` }))
    expect(derive(attempts).confidence).toBe('high')
    const limited = attempts.map((attempt) => ({ ...attempt, reliability: 'limited' as const }))
    expect(derive(limited).confidence).toBe('medium')
  })

  it('is deterministic, rejects future timestamps, and validates numeric/time bounds', () => {
    const attempts = [summary('a'), summary('b'), summary('future', { performedAt: '2027-01-01T00:00:00.000Z' }), summary('bad', { notes: Number.NaN })]
    expect(derive(attempts)).toEqual(derive([...attempts].reverse()))
    expect(derive(attempts).exclusions.map((item) => item.code)).toEqual(expect.arrayContaining(['future-dated', 'invalid-summary']))
    expect(() => derive([], { asOf: 'invalid' })).toThrow(RangeError)
  })

  it('deep-freezes speed provenance and keeps numeric current evidence finite and bounded', () => {
    const result = derive([summary('a'), summary('b')])
    expect(Object.isFrozen(result.demonstratedSpeedEvidenceAttemptIds)).toBe(true)
    expect(Object.isFrozen(result.demonstratedSpeedSupportingSessionIds)).toBe(true)
    expect(Object.isFrozen(result.minimumDimension)).toBe(true)
    for (const value of [result.mastery, result.control, result.consistency, result.recencyFactor, result.effectiveEvidenceSupport, result.effectiveSessionSupport, result.demonstratedSpeedEffectiveSupport, result.demonstratedSpeedEffectiveSessionSupport]) {
      expect(value).not.toBeNull()
      expect(Number.isFinite(value)).toBe(true)
      expect(value!).toBeGreaterThanOrEqual(0)
    }
    expect(result.mastery!).toBeLessThanOrEqual(100)
    expect(result.control!).toBeLessThanOrEqual(100)
    expect(result.consistency!).toBeLessThanOrEqual(100)
    expect(result.recencyFactor!).toBeLessThanOrEqual(1)
    expect(result.effectiveEvidenceSupport!).toBeLessThanOrEqual(MASTERY_MODEL_OPTIONS.recentAttemptWindow)
    expect(result.effectiveSessionSupport!).toBeLessThanOrEqual(MASTERY_MODEL_OPTIONS.recentAttemptWindow)
    expect(result.demonstratedSpeedEffectiveSupport!).toBeLessThanOrEqual(MASTERY_MODEL_OPTIONS.recentAttemptWindow)
    expect(result.demonstratedSpeedEffectiveSessionSupport!).toBeLessThanOrEqual(result.demonstratedSpeedSessionCount)
    expect(result).not.toHaveProperty('overallPerformanceScore')
    expect(result).not.toHaveProperty('musicality')
    expect(result).not.toHaveProperty('artisticQuality')
  })
})
