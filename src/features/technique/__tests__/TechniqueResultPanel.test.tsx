import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TechniqueResultPanel } from '../TechniqueResultPanel'
import type { TechniqueAnalysisResultV1, TechniqueAnalysisResultV2, TechniqueChallengeProfileV1, TechniqueChallengeProfileV2 } from '../types'

const challengeV1: TechniqueChallengeProfileV1 = { targetTempoBpm: 80, eventCount: 8, expectedDuration: { numerator: 8, denominator: 1 }, expectedDurationMs: 6_000, minimumMidi: 60, maximumMidi: 72, pitchSpanSemitones: 12, maximumChordSize: 1, maximumJumpSemitones: 2, rhythmicDensity: 1, smallestSubdivision: 1, tempoChangeCount: 0, octaveSpan: 1, moduleSpecific: {} }
const challengeV2: TechniqueChallengeProfileV2 = { ...challengeV1, tonic: 0, mode: 'major', declaredHandContext: 'right', direction: 'ascending', subdivision: 1, chordInversion: 0, jumpSemitones: 12, tempoShape: 'steady' }

describe('TechniqueResultPanel versioned history', () => {
  it('renders frozen V1 completion semantics unchanged', () => {
    const result: TechniqueAnalysisResultV1 = { id: 'v1', status: 'ready', moduleId: 'sight-reading', exerciseInstanceId: 'exercise', recordingId: 'recording', alignmentId: 'alignment', noteGradingId: 'notes', timingAnalysisId: 'timing', analysisEngineVersion: 'technique-analysis-1.0.0', completion: { reachedEventCount: 4, expectedEventCount: 8, ratio: .5 }, novelty: { exerciseInstanceId: 'exercise', priorSavedAttemptCount: 0, firstSavedAttempt: true }, challenge: challengeV1, facets: [{ id: 'sight-reading-first-pass', label: 'Sight-reading first pass', status: 'ready', score: 88, reliability: 'limited', evidenceCount: 4, eligibleCount: 8, coverage: .5, summary: 'Frozen legacy composite.', challengeEvidence: challengeV1 }], observations: [], exclusions: [], warnings: [] }
    const html = renderToStaticMarkup(<TechniqueResultPanel result={result} />)
    expect(html).toContain('50% reached')
    expect(html).toContain('Sight-reading first pass')
    expect(html).toContain('Frozen legacy composite.')
  })

  it('renders V2 actual coverage separately from reached span', () => {
    const result: TechniqueAnalysisResultV2 = { id: 'v2', status: 'unavailable', moduleId: 'rhythm', exerciseInstanceId: 'exercise', recordingId: 'recording', alignmentId: 'alignment', noteGradingId: 'notes', timingAnalysisId: 'timing', analysisEngineVersion: 'technique-analysis-1.1.0', completion: { expectedEventCount: 8, attemptedEventCount: 8, completeCorrectOrIncorrectEventCount: 2, reachedSpanEndIndex: 7, eventCoverageRatio: .25, spanReachedRatio: 1, completeEnoughForEvidence: false }, novelty: { exerciseInstanceId: 'exercise', priorSavedAttemptCount: 1, firstSavedAttempt: false }, challenge: challengeV2, facets: [], observations: [], findings: [], exclusions: [], warnings: [] }
    const html = renderToStaticMarkup(<TechniqueResultPanel result={result} />)
    expect(html).toContain('25% event coverage')
    expect(html).toContain('Reached span 100%')
    expect(html).toContain('repeat practice context')
  })
})
