import { deepFreeze, stableHash } from '../timing-analysis/math'
import { compareTime } from '../musicxml/musicalTime'
import { analyzeArpeggios } from './moduleAnalyzers/arpeggios'
import { analyzeChords } from './moduleAnalyzers/chords'
import { analyzeJumps } from './moduleAnalyzers/jumps'
import { analyzeOctaves } from './moduleAnalyzers/octaves'
import { analyzeRhythm } from './moduleAnalyzers/rhythm'
import { analyzeScales } from './moduleAnalyzers/scales'
import { analyzeSightReading } from './moduleAnalyzers/sightReading'
import { analyzeTempoControl } from './moduleAnalyzers/tempoControl'
import { FACET_LABELS, type ModuleAnalysis, type TechniqueAnalyzerContext } from './moduleAnalyzers/shared'
import { TECHNIQUE_ANALYSIS_OPTIONS } from './options'
import { prepareTechniqueEvidence } from './prepareEvidence'
import { TECHNIQUE_ANALYSIS_ENGINE_VERSION, type AnalyzeTechniqueInput, type TechniqueAnalysisResult, type TechniqueEvidenceFamily, type TechniqueFacetId, type TechniqueFacetResultV2, type TechniqueModuleId, type TechniqueNovelty } from './types'

function dispatch(context: TechniqueAnalyzerContext): ModuleAnalysis {
  switch (context.exercise.spec.moduleId) {
    case 'sight-reading': return analyzeSightReading(context)
    case 'rhythm': return analyzeRhythm(context)
    case 'chord-fluency': return analyzeChords(context)
    case 'scales': return analyzeScales(context)
    case 'arpeggios': return analyzeArpeggios(context)
    case 'octaves': return analyzeOctaves(context)
    case 'keyboard-jumps': return analyzeJumps(context)
    case 'tempo-control': return analyzeTempoControl(context)
  }
}

function sameMidiMultiset(left: readonly number[], right: readonly number[]): boolean {
  if (left.length !== right.length) return false
  const sortedLeft = [...left].sort((a, b) => a - b), sortedRight = [...right].sort((a, b) => a - b)
  return sortedLeft.every((midi, index) => midi === sortedRight[index])
}

interface UnavailableFacetDefinition {
  readonly id: TechniqueFacetId
  readonly family: TechniqueEvidenceFamily
  readonly minimumEvidence: number
}

function unavailableFacetDefinitions(moduleId: TechniqueModuleId): readonly UnavailableFacetDefinition[] {
  switch (moduleId) {
    case 'sight-reading': return [
      { id: 'note-accuracy', family: 'pitch', minimumEvidence: TECHNIQUE_ANALYSIS_OPTIONS.minimumNoteEvents },
      { id: 'pulse-continuity', family: 'continuity', minimumEvidence: TECHNIQUE_ANALYSIS_OPTIONS.minimumRhythmIntervals },
    ]
    case 'rhythm': return [
      { id: 'rhythm-precision', family: 'interval-precision', minimumEvidence: TECHNIQUE_ANALYSIS_OPTIONS.minimumRhythmIntervals },
      { id: 'pulse-continuity', family: 'continuity', minimumEvidence: TECHNIQUE_ANALYSIS_OPTIONS.minimumRhythmIntervals },
    ]
    case 'chord-fluency': return [
      { id: 'chord-accuracy', family: 'pitch', minimumEvidence: TECHNIQUE_ANALYSIS_OPTIONS.minimumChordEvents },
      { id: 'chord-synchronization', family: 'synchronization', minimumEvidence: TECHNIQUE_ANALYSIS_OPTIONS.minimumChordSynchronizationEvents },
    ]
    case 'scales': return [
      { id: 'note-accuracy', family: 'pitch', minimumEvidence: TECHNIQUE_ANALYSIS_OPTIONS.minimumNoteEvents },
      { id: 'onset-evenness', family: 'interval-precision', minimumEvidence: TECHNIQUE_ANALYSIS_OPTIONS.minimumEvennessIntervals },
      { id: 'direction-change-continuity', family: 'continuity', minimumEvidence: 2 },
    ]
    case 'arpeggios': return [
      { id: 'note-accuracy', family: 'pitch', minimumEvidence: TECHNIQUE_ANALYSIS_OPTIONS.minimumNoteEvents },
      { id: 'arpeggio-transition-consistency', family: 'interval-precision', minimumEvidence: TECHNIQUE_ANALYSIS_OPTIONS.minimumEvennessIntervals },
    ]
    case 'octaves': return [
      { id: 'octave-integrity', family: 'pitch', minimumEvidence: TECHNIQUE_ANALYSIS_OPTIONS.minimumNoteEvents },
      { id: 'onset-evenness', family: 'interval-precision', minimumEvidence: TECHNIQUE_ANALYSIS_OPTIONS.minimumEvennessIntervals },
    ]
    case 'keyboard-jumps': return [
      { id: 'landing-accuracy', family: 'pitch', minimumEvidence: TECHNIQUE_ANALYSIS_OPTIONS.minimumJumpTransitions },
      { id: 'jump-timing-consistency', family: 'interval-precision', minimumEvidence: TECHNIQUE_ANALYSIS_OPTIONS.minimumJumpTransitions },
      { id: 'recovery-continuity', family: 'continuity', minimumEvidence: TECHNIQUE_ANALYSIS_OPTIONS.minimumJumpTransitions },
    ]
    case 'tempo-control': return [
      { id: 'target-tempo-control', family: 'tempo', minimumEvidence: TECHNIQUE_ANALYSIS_OPTIONS.minimumTempoSamples },
      { id: 'tempo-stability', family: 'tempo', minimumEvidence: TECHNIQUE_ANALYSIS_OPTIONS.minimumTempoStabilitySamples },
      { id: 'tempo-transition-control', family: 'tempo', minimumEvidence: TECHNIQUE_ANALYSIS_OPTIONS.minimumTempoTransitionSamples },
    ]
  }
}

function unavailableFacets(input: AnalyzeTechniqueInput): readonly TechniqueFacetResultV2[] {
  const context = input.exercise.spec.moduleId === 'sight-reading'
    ? input.novelty.firstSavedAttempt ? 'first-pass' as const : 'repeat-practice' as const
    : 'technical-drill' as const
  return unavailableFacetDefinitions(input.exercise.spec.moduleId).map((definition) => ({
    id: definition.id,
    label: FACET_LABELS[definition.id],
    status: 'unavailable',
    score: null,
    reliability: 'unavailable',
    evidenceCount: 0,
    eligibleCount: 0,
    coverage: 0,
    evidenceFamily: definition.family,
    evidenceContext: context,
    observationIds: [],
    minimumEvidence: definition.minimumEvidence,
    summary: 'Unavailable because the frozen exercise and analysis inputs do not describe the same authored take.',
    challengeEvidence: input.exercise.challenge,
  }))
}

function unavailableCompletion(expectedEventCount: number) {
  return { expectedEventCount, attemptedEventCount: 0, completeCorrectOrIncorrectEventCount: 0, reachedSpanEndIndex: null, eventCoverageRatio: 0, spanReachedRatio: 0, completeEnoughForEvidence: false }
}

function resultId(input: AnalyzeTechniqueInput): string {
  return `technique-analysis:${stableHash(JSON.stringify({ exercise: input.exercise.id, recording: input.recording.id, alignment: input.alignment.id, note: input.noteGrading.id, timing: input.timingAnalysis.id, novelty: input.novelty, version: TECHNIQUE_ANALYSIS_ENGINE_VERSION }))}`
}

function unavailableResult(input: AnalyzeTechniqueInput, novelty: TechniqueNovelty): TechniqueAnalysisResult {
  return deepFreeze({
    id: resultId(input), status: 'unavailable', moduleId: input.exercise.spec.moduleId,
    exerciseInstanceId: input.exercise.id, recordingId: input.recording.id, alignmentId: input.alignment.id,
    noteGradingId: input.noteGrading.id, timingAnalysisId: input.timingAnalysis.id,
    analysisEngineVersion: TECHNIQUE_ANALYSIS_ENGINE_VERSION,
    completion: unavailableCompletion(input.exercise.events.length), novelty, challenge: input.exercise.challenge,
    facets: unavailableFacets(input), observations: [], findings: [], exclusions: [],
    warnings: ['Technique inputs do not describe one immutable exercise take, or the frozen exercise events do not match the aligned expected groups. Analysis stopped before evidence preparation and module scoring.'],
  })
}

export function analyzeTechnique(input: AnalyzeTechniqueInput): TechniqueAnalysisResult {
  const { exercise, recording, alignment, noteGrading, timingAnalysis, novelty } = input
  const structureMatches = exercise.events.length === alignment.expectedGroups.length && exercise.events.every((event, index) => {
    const group = alignment.expectedGroups[index]
    return Boolean(group) && compareTime(event.position, group!.position) === 0 && sameMidiMultiset(event.midiNotes, group!.pitches)
  })
  const identityMatches = structureMatches && exercise.id === novelty.exerciseInstanceId && alignment.expectedPlanId === noteGrading.expectedPlanId && alignment.expectedPlanId === timingAnalysis.expectedPlanId
    && recording.practiceContext.expectedPerformancePlanId === alignment.expectedPlanId
    && recording.id === alignment.recordingId && noteGrading.recordingId === recording.id && noteGrading.alignmentId === alignment.id
    && timingAnalysis.recordingId === recording.id && timingAnalysis.alignmentId === alignment.id && timingAnalysis.noteGradingId === noteGrading.id
  if (!identityMatches) return unavailableResult(input, novelty)
  const evidence = prepareTechniqueEvidence(exercise, alignment, noteGrading, timingAnalysis)
  const provisional = alignment.status === 'ambiguous' || noteGrading.reliability === 'provisional' || timingAnalysis.reliability === 'provisional'
  const module = dispatch({ exercise, evidence, novelty, provisional, options: TECHNIQUE_ANALYSIS_OPTIONS, timingAnalysis })
  const facets = module.facets
  const result: TechniqueAnalysisResult = {
    id: resultId(input),
    status: facets.some((facet) => facet.status === 'ready') ? 'ready' : 'unavailable', moduleId: exercise.spec.moduleId,
    exerciseInstanceId: exercise.id, recordingId: recording.id, alignmentId: alignment.id, noteGradingId: noteGrading.id, timingAnalysisId: timingAnalysis.id,
    analysisEngineVersion: TECHNIQUE_ANALYSIS_ENGINE_VERSION, completion: evidence.completion, novelty, challenge: exercise.challenge,
    facets, observations: module.observations, findings: module.findings,
    exclusions: [`${Math.max(0, timingAnalysis.rhythm.observations.length - evidence.intervals.length)} timing observations excluded because both adjacent groups were not perfect correct-note matches.`],
    warnings: [...(provisional ? ['Underlying correspondence is provisional; affected facets remain provisional.'] : [])],
  }
  return deepFreeze(result)
}
