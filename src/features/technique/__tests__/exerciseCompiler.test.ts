import { describe, expect, it } from 'vitest'
import { alignPerformance } from '../../alignment/alignPerformance'
import { makeRecording } from '../../alignment/__tests__/fixtures'
import { gradeNotes } from '../../note-grading/gradeNotes'
import { analyzeTiming } from '../../timing-analysis/analyzeTiming'
import { analyzeTechnique } from '../analyzeTechnique'
import { defaultTechniqueSpec, derivedArpeggioEventCount, derivedScaleEventCount } from '../catalog'
import { defaultTechniqueForm, validateTechniqueConfiguration } from '../configuration'
import { compileTechniqueExercise } from '../exerciseCompiler'
import { arpeggioSequence, scaleSequence } from '../exerciseGenerator'
import { TECHNIQUE_MODULE_IDS, type TechniqueExerciseSpec } from '../types'

function analyzePerfect(spec: TechniqueExerciseSpec, intervalMs = 750) {
  const compiled = compileTechniqueExercise(spec)
  const attacks = compiled.expectedPerformancePlan.onsetGroups.flatMap((group, index) => group.midiNotes.map((midi) => ({ midi, ms: index * intervalMs })))
  const recording = makeRecording(attacks, { planId: compiled.expectedPerformancePlan.id })
  const alignment = alignPerformance(compiled.expectedPerformancePlan, recording)
  const noteGrading = gradeNotes({ expectedPlan: compiled.expectedPerformancePlan, recording, alignment, options: { gradingScope: 'full-plan' } })
  const timingAnalysis = analyzeTiming({ expectedPlan: compiled.expectedPerformancePlan, recording, alignment, noteGrading })
  const novelty = { exerciseInstanceId: compiled.snapshot.id, priorSavedAttemptCount: 0, firstSavedAttempt: true }
  return analyzeTechnique({ exercise: compiled.snapshot, recording, alignment, noteGrading, timingAnalysis, novelty })
}

describe('Technique exercise compiler', () => {
  it.each(TECHNIQUE_MODULE_IDS)('deterministically compiles the %s module through the canonical score pipeline', (moduleId) => {
    const spec = defaultTechniqueSpec(moduleId, 'fixed-seed')
    const first = compileTechniqueExercise(spec)
    const second = compileTechniqueExercise(spec)
    expect(first.snapshot).toEqual(second.snapshot)
    expect(first.expectedPerformancePlan).toEqual(second.expectedPerformancePlan)
    expect(first.snapshot.events).toHaveLength(spec.eventCount)
    expect(first.expectedPerformancePlan.onsetGroups).toHaveLength(spec.eventCount)
    expect(first.snapshot.challenge).toMatchObject({ targetTempoBpm: spec.targetTempoBpm, eventCount: spec.eventCount, tonic: spec.tonic, declaredHandContext: spec.declaredHandContext })
    expect(first.snapshot.generatedMusicXml).toContain('<score-partwise')
  })

  it('uses exact one- and two-octave patterns with one true turn and no arbitrary cycling', () => {
    const cMajor = { ...defaultTechniqueSpec('scales'), direction: 'both' as const, octaveSpan: 1 as const }
    expect(scaleSequence(cMajor)).toEqual([60, 62, 64, 65, 67, 69, 71, 72, 71, 69, 67, 65, 64, 62, 60])
    expect(compileTechniqueExercise(cMajor).snapshot.events.filter((event) => event.role === 'turn')).toHaveLength(1)
    const aMinor = { ...cMajor, tonic: 9, mode: 'natural-minor' as const, octaveSpan: 2 as const, direction: 'ascending' as const }
    expect(scaleSequence(aMinor)).toHaveLength(derivedScaleEventCount(2, 'ascending'))
    const arpeggio = { ...defaultTechniqueSpec('arpeggios'), octaveSpan: 2 as const, direction: 'both' as const }
    expect(arpeggioSequence(arpeggio)).toHaveLength(derivedArpeggioEventCount(2, 'both'))
    expect(compileTechniqueExercise(arpeggio).snapshot.events.filter((event) => event.role === 'turn')).toHaveLength(1)
  })

  it('generates exact key, mode, direction, and range pitch sequences', () => {
    expect(scaleSequence({ ...defaultTechniqueSpec('scales'), tonic: 2, direction: 'ascending' })).toEqual([62, 64, 66, 67, 69, 71, 73, 74])
    expect(scaleSequence({ ...defaultTechniqueSpec('scales'), tonic: 9, mode: 'natural-minor', direction: 'ascending' })).toEqual([69, 71, 72, 74, 76, 77, 79, 81])
    expect(scaleSequence({ ...defaultTechniqueSpec('scales'), direction: 'descending' })).toEqual([72, 71, 69, 67, 65, 64, 62, 60])
    expect(arpeggioSequence({ ...defaultTechniqueSpec('arpeggios'), direction: 'ascending' })).toEqual([60, 64, 67, 72])
    expect(arpeggioSequence({ ...defaultTechniqueSpec('arpeggios'), mode: 'natural-minor', direction: 'both' })).toEqual([60, 63, 67, 72, 67, 63, 60])
    const long = compileTechniqueExercise({ ...defaultTechniqueSpec('scales'), octaveSpan: 2, direction: 'both' })
    expect(long.expectedPerformancePlan.onsetGroups.map((group) => group.midiNotes[0])).toEqual(scaleSequence(long.snapshot.spec))
    expect(long.normalizedScore.parts[0]!.measures.length).toBeGreaterThan(1)
  })

  it('changes instance identity for every musically relevant challenge dimension', () => {
    const baseline = defaultTechniqueSpec('chord-fluency', 'identity')
    const baselineId = compileTechniqueExercise(baseline).snapshot.id
    const alternatives: TechniqueExerciseSpec[] = [
      { ...baseline, seed: 'different' }, { ...baseline, tonic: 6 }, { ...baseline, mode: 'natural-minor' }, { ...baseline, targetTempoBpm: 140 },
      { ...baseline, eventCount: 12 }, { ...baseline, direction: 'ascending' }, { ...baseline, octaveSpan: 2 }, { ...baseline, subdivision: 2 },
      { ...baseline, chordInversion: 1 }, { ...baseline, jumpSemitones: 19 }, { ...baseline, tempoShape: 'accelerate' }, { ...baseline, declaredHandContext: 'left' },
    ]
    expect(alternatives.every((spec) => compileTechniqueExercise(spec).snapshot.id !== baselineId)).toBe(true)
  })

  it('preserves chord inversion and jump landing/recovery provenance', () => {
    const root = compileTechniqueExercise({ ...defaultTechniqueSpec('chord-fluency'), chordInversion: 0 }).snapshot
    const first = compileTechniqueExercise({ ...defaultTechniqueSpec('chord-fluency'), chordInversion: 1 }).snapshot
    const second = compileTechniqueExercise({ ...defaultTechniqueSpec('chord-fluency'), chordInversion: 2 }).snapshot
    expect([root.events[0]?.midiNotes, first.events[0]?.midiNotes, second.events[0]?.midiNotes]).toEqual([[60, 64, 67], [64, 67, 72], [67, 72, 76]])
    expect(second.challenge.chordInversion).toBe(2)
    const jumps = compileTechniqueExercise(defaultTechniqueSpec('keyboard-jumps')).snapshot.events
    expect(jumps.slice(1, 5).map((event) => [event.role, event.transitionKind])).toEqual([
      ['landing', 'jump-landing'], ['recovery', 'jump-recovery'], ['landing', 'jump-landing'], ['recovery', 'jump-recovery'],
    ])
  })

  it('keeps XML parseable for XML-significant user seed text and emits structurally parsed measures', () => {
    const compiled = compileTechniqueExercise(defaultTechniqueSpec('sight-reading', 'A&B <test> "quote"'))
    expect(compiled.normalizedScore.parts[0]?.measures.length).toBeGreaterThan(0)
    expect(compiled.expectedPerformancePlan.onsetGroups).toHaveLength(compiled.snapshot.events.length)
  })

  it('validates draft numbers without compiling or throwing', () => {
    const base = defaultTechniqueForm('rhythm')
    for (const targetTempoBpm of ['', '0', '241']) {
      const result = validateTechniqueConfiguration('rhythm', { ...base, targetTempoBpm })
      expect(result.spec).toBeNull()
      expect(result.errors.targetTempoBpm).toBe('Tempo must be between 30 and 240.')
    }
    expect(validateTechniqueConfiguration('rhythm', { ...base, eventCount: 'NaN' }).errors.eventCount).toBeTruthy()
    expect(validateTechniqueConfiguration('rhythm', { ...base, targetTempoBpm: '120' }).spec?.targetTempoBpm).toBe(120)
  })

  it('does not create a duplicate sight-reading composite facet', () => {
    const result = analyzePerfect({ ...defaultTechniqueSpec('sight-reading'), eventCount: 8 })
    expect(result.facets.map((facet) => facet.id)).toEqual(['note-accuracy', 'pulse-continuity'])
    expect(new Set(result.facets.map((facet) => `${facet.evidenceFamily}:${facet.observationIds.join('|')}`)).size).toBe(2)
    expect(result).not.toHaveProperty('overallScore')
    expect(result).not.toHaveProperty('skillRating')
  })

  it('keeps module facet populations and methods distinct', () => {
    const rhythm = analyzePerfect({ ...defaultTechniqueSpec('rhythm'), eventCount: 12 })
    expect(new Set(rhythm.observations.filter((item) => item.facetId === 'rhythm-precision').map((item) => item.method))).toEqual(new Set(['rhythm-loss']))
    expect(new Set(rhythm.observations.filter((item) => item.facetId === 'pulse-continuity').map((item) => item.method))).toEqual(new Set(['hesitation-expansion']))
    const scale = analyzePerfect({ ...defaultTechniqueSpec('scales'), direction: 'both' })
    expect(scale.observations.filter((item) => item.facetId === 'direction-change-continuity')).toHaveLength(2)
    expect(scale.observations.filter((item) => item.facetId === 'onset-evenness')).toHaveLength(scale.challenge.eventCount - 1)
    const jumps = analyzePerfect({ ...defaultTechniqueSpec('keyboard-jumps'), eventCount: 13 })
    const landingPairs = jumps.observations.filter((item) => item.facetId === 'jump-timing-consistency').map((item) => item.expectedEventIds.join(':'))
    const recoveryPairs = jumps.observations.filter((item) => item.facetId === 'recovery-continuity').map((item) => item.expectedEventIds.join(':'))
    expect(landingPairs.length).toBeGreaterThan(0)
    expect(recoveryPairs.length).toBeGreaterThan(0)
    expect(landingPairs.some((pair) => recoveryPairs.includes(pair))).toBe(false)
    const tempo = analyzePerfect({ ...defaultTechniqueSpec('tempo-control'), eventCount: 20, tempoShape: 'arch' })
    expect(new Set(tempo.observations.map((item) => item.method))).toEqual(new Set(['target-tempo-ratio', 'local-tempo-stability', 'authored-tempo-trajectory']))
  })

  it('requires complete correct chords before synchronization evidence', () => {
    const spec = { ...defaultTechniqueSpec('chord-fluency'), eventCount: 8 }
    const compiled = compileTechniqueExercise(spec)
    const attacks = compiled.expectedPerformancePlan.onsetGroups.flatMap((group, index) => group.midiNotes.map((midi, noteIndex) => ({ midi: index === 3 && noteIndex === 0 ? midi + 1 : midi, ms: index * 750 + noteIndex * 10 })))
    const recording = makeRecording(attacks, { planId: compiled.expectedPerformancePlan.id })
    const alignment = alignPerformance(compiled.expectedPerformancePlan, recording)
    const noteGrading = gradeNotes({ expectedPlan: compiled.expectedPerformancePlan, recording, alignment, options: { gradingScope: 'full-plan' } })
    const timingAnalysis = analyzeTiming({ expectedPlan: compiled.expectedPerformancePlan, recording, alignment, noteGrading })
    const result = analyzeTechnique({ exercise: compiled.snapshot, recording, alignment, noteGrading, timingAnalysis, novelty: { exerciseInstanceId: compiled.snapshot.id, priorSavedAttemptCount: 0, firstSavedAttempt: true } })
    expect(result.observations.filter((item) => item.facetId === 'chord-accuracy')).toHaveLength(8)
    expect(result.observations.filter((item) => item.facetId === 'chord-synchronization').length).toBeLessThan(8)
  })

  it('separates actual event coverage from the reached span and freezes the complete V2 output', () => {
    const compiled = compileTechniqueExercise({ ...defaultTechniqueSpec('rhythm'), eventCount: 8 })
    const first = compiled.expectedPerformancePlan.onsetGroups[0]!.midiNotes[0]!, last = compiled.expectedPerformancePlan.onsetGroups.at(-1)!.midiNotes[0]!
    const recording = makeRecording([{ midi: first, ms: 0 }, { midi: last, ms: 5_000 }], { planId: compiled.expectedPerformancePlan.id })
    const alignment = alignPerformance(compiled.expectedPerformancePlan, recording)
    const noteGrading = gradeNotes({ expectedPlan: compiled.expectedPerformancePlan, recording, alignment, options: { gradingScope: 'full-plan' } })
    const timingAnalysis = analyzeTiming({ expectedPlan: compiled.expectedPerformancePlan, recording, alignment, noteGrading })
    const result = analyzeTechnique({ exercise: compiled.snapshot, recording, alignment, noteGrading, timingAnalysis, novelty: { exerciseInstanceId: compiled.snapshot.id, priorSavedAttemptCount: 0, firstSavedAttempt: true } })
    expect(result.completion.spanReachedRatio).toBe(1)
    expect(result.completion.eventCoverageRatio).toBeLessThan(0.5)
    expect(result.completion.completeEnoughForEvidence).toBe(false)
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.facets)).toBe(true)
    expect(Object.isFrozen(result.observations)).toBe(true)
    expect(Object.isFrozen(result.completion)).toBe(true)
    expect(Object.isFrozen(result.challenge)).toBe(true)
  })

  it('does not turn insufficient correct-note interval evidence into a zero', () => {
    const compiled = compileTechniqueExercise({ ...defaultTechniqueSpec('rhythm'), eventCount: 8 })
    const recording = makeRecording([{ midi: compiled.expectedPerformancePlan.onsetGroups[0]!.midiNotes[0]!, ms: 0 }], { planId: compiled.expectedPerformancePlan.id })
    const alignment = alignPerformance(compiled.expectedPerformancePlan, recording)
    const noteGrading = gradeNotes({ expectedPlan: compiled.expectedPerformancePlan, recording, alignment, options: { gradingScope: 'full-plan' } })
    const timingAnalysis = analyzeTiming({ expectedPlan: compiled.expectedPerformancePlan, recording, alignment, noteGrading })
    const result = analyzeTechnique({ exercise: compiled.snapshot, recording, alignment, noteGrading, timingAnalysis, novelty: { exerciseInstanceId: compiled.snapshot.id, priorSavedAttemptCount: 0, firstSavedAttempt: true } })
    expect(result.facets.every((facet) => facet.score === null)).toBe(true)
    expect(result.status).toBe('unavailable')
    expect(result.completion.eventCoverageRatio).toBeLessThan(result.completion.spanReachedRatio || 1)
  })
})
