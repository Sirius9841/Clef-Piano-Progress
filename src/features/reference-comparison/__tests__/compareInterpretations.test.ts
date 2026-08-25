import { describe, expect, it } from 'vitest'
import { musicalTime } from '../../musicxml/musicalTime'
import type { InterpretationProfile } from '../types'
import { compareInterpretations } from '../compareInterpretations'

function profile(overrides: Partial<InterpretationProfile> = {}): InterpretationProfile {
  return {
    attemptId: 'attempt:current', arrangementId: 'arrangement', scoreVersionId: 'score-version', includedPartIds: ['P1'], performedAt: '2026-08-25T12:00:00.000Z', practiceSpeed: 0.75, schemaVersion: 4, recordingId: 'recording:current',
    scope: { type: 'full-plan', start: musicalTime(0), end: musicalTime(8), expectedStartGroupId: 'g0', expectedEndGroupId: 'g8' },
    tempoShape: [{ key: 'tempo:1', position: musicalTime(2), measureNumbers: ['2'], centeredLogShape: -0.08, performedQuarterBpm: 90 }, { key: 'tempo:2', position: musicalTime(6), measureNumbers: ['4'], centeredLogShape: 0.08, performedQuarterBpm: 96 }],
    dynamicsGestures: [{ key: 'wedge:w1', position: musicalTime(2), measureNumber: '2', kind: 'wedge', value: 0.3 }],
    articulationGestures: [{ key: 'staccato:n1', position: musicalTime(3), measureNumber: '2', kind: 'staccato', value: 0.5 }],
    pedalGestures: [{ key: 'change:p1', position: musicalTime(4), measureNumber: '3', kind: 'change', relativeTimingMs: 80, engineVersion: 'pedal-analysis-1.1.1' }],
    voicingGestures: [{ key: 'voice:1', position: musicalTime(5), measureNumber: '3', focusAdvantage: 0.16 }],
    reliability: { tempo: 'reliable', dynamics: 'reliable', articulation: 'reliable', pedal: 'reliable', voicing: 'reliable' }, evidenceVersions: { timingAnalysis: 'timing-1', pedalAnalysis: 'pedal-analysis-1.1.1' }, ...overrides,
  }
}

describe('interpretation-aware reference comparison', () => {
  it('has no aggregate score and treats different global speeds with the same shape as similar', () => {
    const reference = profile({ attemptId: 'attempt:reference', recordingId: 'recording:reference', practiceSpeed: 1, tempoShape: [{ key: 'tempo:1', position: musicalTime(2), measureNumbers: ['2'], centeredLogShape: -0.08, performedQuarterBpm: 120 }, { key: 'tempo:2', position: musicalTime(6), measureNumbers: ['4'], centeredLogShape: 0.08, performedQuarterBpm: 128 }] })
    const result = compareInterpretations({ current: profile(), reference, currentVoicingAnalysisId: 'voicing:current' })
    expect(result.tempo.observations.every((item) => item.similarity === 'very-similar')).toBe(true)
    expect('score' in result).toBe(false)
    expect('similarityScore' in result).toBe(false)
    expect(JSON.stringify(result)).not.toMatch(/wrong|incorrect|worse|failed/i)
    expect(compareInterpretations({ current: profile(), reference, currentVoicingAnalysisId: 'voicing:current' })).toEqual(result)
    expect(Object.isFrozen(result) && Object.isFrozen(result.tempo.observations) && Object.isFrozen(result.tempo.observations[0])).toBe(true)
  })

  it('reports neutral signed differences for every available dimension', () => {
    const reference = profile({ attemptId: 'attempt:reference', recordingId: 'recording:reference', dynamicsGestures: [{ key: 'wedge:w1', position: musicalTime(2), measureNumber: '2', kind: 'wedge', value: 0.15 }], articulationGestures: [{ key: 'staccato:n1', position: musicalTime(3), measureNumber: '2', kind: 'staccato', value: 0.7 }], pedalGestures: [{ key: 'change:p1', position: musicalTime(4), measureNumber: '3', kind: 'change', relativeTimingMs: 30, engineVersion: 'pedal-analysis-1.1.0' }], voicingGestures: [{ key: 'voice:1', position: musicalTime(5), measureNumber: '3', focusAdvantage: 0.08 }] })
    const result = compareInterpretations({ current: profile(), reference, currentVoicingAnalysisId: 'voicing:current' })
    expect(result.dynamics.observations[0]?.signedDifference).toBeCloseTo(0.15)
    expect(result.articulation.observations[0]?.signedDifference).toBeCloseTo(-0.2)
    expect(result.pedal.observations[0]).toMatchObject({ currentValue: 80, referenceValue: 30, signedDifference: 50 })
    expect(result.voicing.observations[0]?.signedDifference).toBeCloseTo(0.08)
  })

  it('uses exact overlap, rejects incompatible identities, and preserves partial dimensions', () => {
    const reference = profile({ attemptId: 'attempt:reference', recordingId: 'recording:reference', schemaVersion: 2, scope: { type: 'aligned-span', start: musicalTime(2), end: musicalTime(4), expectedStartGroupId: 'g2', expectedEndGroupId: 'g4' }, pedalGestures: null, voicingGestures: null, reliability: { tempo: 'limited', dynamics: 'reliable', articulation: 'reliable', pedal: null, voicing: null } })
    const result = compareInterpretations({ current: profile(), reference, currentVoicingAnalysisId: 'voicing:current' })
    expect(result.overlapScope).toEqual({ start: musicalTime(2), end: musicalTime(4) })
    expect(result.pedal.status).toBe('unavailable')
    expect(result.dynamics.status).toBe('ready')
    const incompatible = compareInterpretations({ current: profile(), reference: profile({ attemptId: 'other', scoreVersionId: 'different' }), currentVoicingAnalysisId: 'voicing' })
    expect(incompatible).toMatchObject({ status: 'unavailable', reliability: 'unavailable' })
    expect(compareInterpretations({ current: profile(), reference: profile({ attemptId: 'other', includedPartIds: ['P2'] }), currentVoicingAnalysisId: 'voicing' }).status).toBe('unavailable')
    expect(compareInterpretations({ current: profile({ includedPartIds: ['P1', 'P1'] }), reference: profile({ attemptId: 'other', includedPartIds: ['P1'] }), currentVoicingAnalysisId: 'voicing' }).status).toBe('ready')
  })

  it('marks disjoint scope and incompatible historical pedal anchors unavailable', () => {
    const disjoint = profile({ attemptId: 'reference', scope: { type: 'aligned-span', start: musicalTime(10), end: musicalTime(12), expectedStartGroupId: 'g10', expectedEndGroupId: 'g12' } })
    expect(compareInterpretations({ current: profile(), reference: disjoint, currentVoicingAnalysisId: 'v' }).status).toBe('unavailable')
    const legacy = profile({ attemptId: 'reference', pedalGestures: [{ key: 'change:p1', position: musicalTime(4), measureNumber: '3', kind: 'change', relativeTimingMs: 20, engineVersion: 'pedal-analysis-1.0.0' }] })
    expect(compareInterpretations({ current: profile(), reference: legacy, currentVoicingAnalysisId: 'v' }).pedal.status).toBe('unavailable')
  })
})
