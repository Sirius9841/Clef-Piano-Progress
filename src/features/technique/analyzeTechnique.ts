import { clamp01, deepFreeze, stableHash } from '../timing-analysis/math'
import { TECHNIQUE_ANALYSIS_ENGINE_VERSION, type AnalyzeTechniqueInput, type TechniqueAnalysisResult, type TechniqueFacetId, type TechniqueFacetResult, type TechniqueObservation, type TechniqueReliability } from './types'

const LABELS: Readonly<Record<TechniqueFacetId, string>> = {
  'note-accuracy': 'Note accuracy', 'rhythm-precision': 'Rhythm precision', 'pulse-continuity': 'Pulse continuity', 'onset-evenness': 'Onset evenness',
  'chord-accuracy': 'Chord accuracy', 'chord-synchronization': 'Chord synchronization', 'transition-consistency': 'Transition consistency',
  'direction-change-continuity': 'Direction-change continuity', 'octave-integrity': 'Octave integrity', 'landing-accuracy': 'Landing accuracy',
  'jump-timing-consistency': 'Jump timing consistency', 'recovery-continuity': 'Recovery continuity', 'target-tempo-control': 'Target-tempo control',
  'tempo-stability': 'Tempo stability', 'tempo-transition-control': 'Tempo-transition control', 'sight-reading-first-pass': 'Sight-reading first pass',
}

const MODULE_FACETS: Readonly<Record<string, readonly TechniqueFacetId[]>> = {
  'sight-reading': ['note-accuracy', 'pulse-continuity', 'sight-reading-first-pass'],
  rhythm: ['rhythm-precision', 'pulse-continuity'],
  'chord-fluency': ['chord-accuracy', 'chord-synchronization'],
  scales: ['note-accuracy', 'onset-evenness', 'direction-change-continuity'],
  arpeggios: ['note-accuracy', 'transition-consistency'],
  octaves: ['octave-integrity', 'onset-evenness'],
  'keyboard-jumps': ['landing-accuracy', 'jump-timing-consistency', 'recovery-continuity'],
  'tempo-control': ['target-tempo-control', 'tempo-stability', 'tempo-transition-control'],
}

function reliability(count: number, completion: number, provisional: boolean): TechniqueReliability {
  if (count === 0) return 'unavailable'
  if (provisional) return 'provisional'
  return count >= 6 && completion >= .8 ? 'reliable' : 'limited'
}

export function analyzeTechnique(input: AnalyzeTechniqueInput): TechniqueAnalysisResult {
  const { exercise, recording, alignment, noteGrading, timingAnalysis, novelty } = input
  const identityMatches = exercise.id === novelty.exerciseInstanceId && recording.id === alignment.recordingId && noteGrading.alignmentId === alignment.id && timingAnalysis.noteGradingId === noteGrading.id
  const perfectGroups = new Set(noteGrading.groupResults.filter((group) => group.classification === 'perfect' && group.expectedGroupId).map((group) => group.expectedGroupId!))
  const expectedIndex = new Map(alignment.expectedGroups.map((group, index) => [group.id, index]))
  const reachedIndex = alignment.groupAlignments.reduce((maximum, step) => step.kind === 'correspondence' ? Math.max(maximum, expectedIndex.get(step.expectedGroup.id) ?? -1) : maximum, -1)
  const attempted = reachedIndex + 1
  const completionRatio = exercise.events.length === 0 ? 0 : clamp01(attempted / exercise.events.length)
  const correctTiming = timingAnalysis.rhythm.observations.filter((observation) => observation.previousExpectedGroupId && perfectGroups.has(observation.expectedGroupId) && perfectGroups.has(observation.previousExpectedGroupId) && observation.rhythmLoss !== null)
  const timingScores = correctTiming.map((observation) => 100 * (1 - observation.rhythmLoss!))
  const chordGroupIds = new Set(alignment.expectedGroups.filter((_, index) => (exercise.events[index]?.midiNotes.length ?? 0) > 1).map((group) => group.id))
  const chordGroups = noteGrading.groupResults.filter((group) => group.expectedGroupId && chordGroupIds.has(group.expectedGroupId))
  const chordSpreads = timingAnalysis.rhythm.chordSpreadDiagnostics.filter((diagnostic) => perfectGroups.has(diagnostic.expectedGroupId))
  const observations: TechniqueObservation[] = correctTiming.map((observation) => ({ id: `technique-observation:${observation.id}`, facetId: 'onset-evenness', expectedGroupIds: [observation.previousExpectedGroupId!, observation.expectedGroupId], score: 100 * (1 - observation.rhythmLoss!), value: Math.abs(observation.intervalDifferenceMs ?? 0), unit: 'milliseconds', summary: 'Correct-note interval compared with the expected local interval.' }))

  const valueFor = (id: TechniqueFacetId): { score: number | null; count: number; eligible: number; summary: string } => {
    const noteScore = noteGrading.metrics.noteScore === null ? null : noteGrading.metrics.noteScore * 100
    if (id === 'note-accuracy') return { score: noteScore, count: noteGrading.counts.gradeableExpectedTargets, eligible: noteGrading.counts.gradeableExpectedTargets, summary: 'Pitch evidence from full-plan physical-key targets.' }
    if (id === 'chord-accuracy' || id === 'octave-integrity' || id === 'landing-accuracy') {
      const groups = id === 'landing-accuracy' ? noteGrading.groupResults.filter((group) => group.expectedGroupId).slice(1) : chordGroups
      return { score: groups.length ? 100 * groups.filter((group) => group.classification === 'perfect').length / groups.length : null, count: groups.length, eligible: groups.length, summary: id === 'landing-accuracy' ? 'Correct distant arrivals, counted once per landing.' : 'Complete simultaneous pitch targets, counted once per musical event.' }
    }
    if (id === 'chord-synchronization') return { score: chordSpreads.length ? 100 * chordSpreads.reduce((sum, item) => sum + clamp01(1 - item.spreadMs / 120), 0) / chordSpreads.length : null, count: chordSpreads.length, eligible: chordGroups.length, summary: 'Attack spread for correctly matched chord events.' }
    if (id === 'target-tempo-control') return { score: timingAnalysis.tempo.targetTempoAccuracyScore === null ? null : timingAnalysis.tempo.targetTempoAccuracyScore * 100, count: timingAnalysis.tempo.localSamples.length, eligible: Math.max(1, exercise.challenge.eventCount - 1), summary: 'Local performed tempo against the authored numeric target.' }
    if (id === 'tempo-stability') return { score: timingAnalysis.tempo.tempoStabilityScore === null ? null : timingAnalysis.tempo.tempoStabilityScore * 100, count: timingAnalysis.tempo.localSamples.length, eligible: Math.max(1, exercise.challenge.eventCount - 1), summary: 'Variation among local tempo samples.' }
    if (id === 'tempo-transition-control') return { score: exercise.challenge.tempoChangeCount > 0 && timingAnalysis.tempo.tempoScore !== null ? timingAnalysis.tempo.tempoScore * 100 : null, count: Math.min(timingAnalysis.tempo.localSamples.length, exercise.challenge.tempoChangeCount * 2), eligible: exercise.challenge.tempoChangeCount, summary: 'Control around authored numeric tempo changes.' }
    if (id === 'sight-reading-first-pass') return novelty.firstSavedAttempt ? { score: noteScore === null || timingScores.length === 0 ? null : (noteScore + timingScores.reduce((a, b) => a + b, 0) / timingScores.length) / 2, count: Math.min(noteGrading.counts.gradeableExpectedTargets, timingScores.length), eligible: exercise.challenge.eventCount, summary: 'First saved encounter only; repeats never recreate novelty evidence.' } : { score: null, count: 0, eligible: exercise.challenge.eventCount, summary: 'Unavailable because this exact generated instance was saved before.' }
    const score = timingScores.length ? timingScores.reduce((a, b) => a + b, 0) / timingScores.length : null
    return { score, count: timingScores.length, eligible: Math.max(1, exercise.challenge.eventCount - 1), summary: 'Correct-note adjacent intervals only; unsafe pitch correspondences are excluded.' }
  }

  const provisional = alignment.status === 'ambiguous' || noteGrading.reliability === 'provisional' || timingAnalysis.reliability === 'provisional'
  const facets: TechniqueFacetResult[] = (MODULE_FACETS[exercise.spec.moduleId] ?? []).map((id) => {
    const value = valueFor(id)
    const usable = identityMatches && completionRatio >= .5 && value.score !== null && value.count > 0
    return { id, label: LABELS[id], status: usable ? 'ready' : 'unavailable', score: usable ? Math.round(clamp01(value.score! / 100) * 1000) / 10 : null, reliability: usable ? reliability(value.count, completionRatio, provisional) : 'unavailable', evidenceCount: usable ? value.count : 0, eligibleCount: value.eligible, coverage: value.eligible === 0 ? 0 : clamp01(value.count / value.eligible), summary: usable ? value.summary : completionRatio < .5 ? 'Not enough of the exercise was reached for a defensible result.' : value.summary, challengeEvidence: exercise.challenge }
  })
  const result: TechniqueAnalysisResult = {
    id: `technique-analysis:${stableHash(JSON.stringify({ exercise: exercise.id, recording: recording.id, alignment: alignment.id, note: noteGrading.id, timing: timingAnalysis.id, novelty }))}`,
    status: identityMatches && facets.some((facet) => facet.status === 'ready') ? 'ready' as const : 'unavailable' as const,
    moduleId: exercise.spec.moduleId, exerciseInstanceId: exercise.id, recordingId: recording.id, alignmentId: alignment.id, noteGradingId: noteGrading.id, timingAnalysisId: timingAnalysis.id,
    analysisEngineVersion: TECHNIQUE_ANALYSIS_ENGINE_VERSION,
    completion: { reachedEventCount: attempted, expectedEventCount: exercise.events.length, ratio: completionRatio }, novelty, challenge: exercise.challenge, facets, observations,
    exclusions: [`${timingAnalysis.rhythm.observations.length - correctTiming.length} timing observations excluded because both adjacent groups were not perfect correct-note matches.`],
    warnings: [...(!identityMatches ? ['Technique inputs do not describe one immutable exercise take.'] : []), ...(provisional ? ['Underlying correspondence is provisional; affected facets remain provisional.'] : [])],
  }
  return deepFreeze(result)
}
