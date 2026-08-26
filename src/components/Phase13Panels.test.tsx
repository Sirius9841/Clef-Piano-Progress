import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ArrangementMastery } from '../features/mastery-model'
import type { SkillRating } from '../features/skill-model'
import { ArrangementMasteryPanel, SkillRatingsPanel } from './Phase13Panels'

function jumpSkill(): SkillRating {
  return {
    moduleId: 'keyboard-jumps', modelVersion: 'skill-model-1.1.1', asOf: '2026-08-26T12:00:00.000Z', status: 'established',
    qualityEstimate: 91, confidence: 'medium', consistency: 96, eligibleAttemptCount: 5, modelEvidenceAttemptCount: 4,
    eligibleContextCount: 2, lastMeasuredAt: '2026-08-24T12:00:00.000Z', contextRatings: [], eligibleAttemptIds: ['a', 'b', 'c', 'd', 'e'],
    modelEvidenceAttemptIds: ['b', 'c', 'd', 'e'], effectiveEvidenceSupport: 1.8, exclusions: [],
    challengeEnvelope: {
      attemptCount: 5, distinctChallengeContexts: 2, targetTempoBpm: { minimum: 80, maximum: 120 }, declaredHandContexts: ['right'],
      lastMeasuredAt: '2026-08-24T12:00:00.000Z', tonics: [], startingTonics: [0, 7], modes: [], octaveSpans: [], directions: [],
      chordInversions: [], jumpDistancesSemitones: [12, 24], maximumJumpDistanceSemitones: 24, tempoShapes: [], subdivisions: [1, 4],
      eventCounts: [8, 16], templateIds: ['jumps-a', 'jumps-b'], distinctTemplateCount: 2, distinctFirstPassExerciseInstances: 0,
    },
  }
}

function mastery(overrides: Partial<ArrangementMastery> = {}): ArrangementMastery {
  return {
    arrangementId: 'arr', scoreVersionId: 'score', modelVersion: 'mastery-model-1.1.1', asOf: '2026-08-26T12:00:00.000Z', status: 'ready',
    mastery: 88, confidence: 'medium', control: 92, minimumDimension: { metric: 'rhythm', value: 88 }, demonstratedSpeedMultiplier: 1,
    demonstratedSpeedStatus: 'established', demonstratedSpeedCandidateMultiplier: 1, demonstratedSpeedQualifyingAttemptCount: 3,
    demonstratedSpeedSessionCount: 2, demonstratedSpeedEffectiveSupport: 2.1, demonstratedSpeedEffectiveSessionSupport: 1.2,
    demonstratedSpeedSupportingSessionIds: ['S1', 'S2'], demonstratedSpeedEvidenceAttemptIds: ['a', 'b', 'c'], demonstratedSpeedLastEvidenceAt: '2026-08-24T12:00:00.000Z',
    consistency: 97, recencyFactor: .94, effectiveEvidenceSupport: 4.4, effectiveSessionSupport: 3.2, eligibleAttemptCount: 6,
    distinctSessionCount: 5, lastEvidenceAt: '2026-08-24T12:00:00.000Z', evidenceAttemptIds: ['a', 'b', 'c', 'd', 'e', 'f'], exclusions: [], ...overrides,
  }
}

describe('Phase 13.2 provenance panels', () => {
  it('uses model-window language and exposes starting-pitch, subdivision, and template breadth', () => {
    const html = renderToStaticMarkup(<SkillRatingsPanel skills={[jumpSkill()]} />)
    expect(html).toContain('4 model-window takes')
    expect(html).not.toContain('current-window')
    expect(html).toContain('2 templates')
    expect(html).toContain('starts C / G')
    expect(html).toContain('subdivisions 1 / 4')
    expect(html).toContain('skill-model-1.1.1')
    expect(html).not.toContain('overall pianist score</strong>')
  })

  it('describes qualifying speed and current session authority without calling every take current', () => {
    const html = renderToStaticMarkup(<ArrangementMasteryPanel mastery={mastery()} />)
    expect(html).toContain('3 qualifying takes')
    expect(html).toContain('2 raw sessions')
    expect(html).toContain('current session support 1.2')
    expect(html).toContain('6 model-window takes')
    expect(html).not.toContain('current supporting takes')
    expect(html).toContain('mastery-model-1.1.1')
  })

  it('uses reliability/recency support language for an unestablished candidate speed', () => {
    const html = renderToStaticMarkup(<ArrangementMasteryPanel mastery={mastery({ demonstratedSpeedMultiplier: null, demonstratedSpeedStatus: 'needs-current-support' })} />)
    expect(html).toContain('current reliability/recency support is not strong enough')
    expect(html).not.toContain('Older qualifying speed evidence')
  })
})
