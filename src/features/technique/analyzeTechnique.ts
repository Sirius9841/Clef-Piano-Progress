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
import type { ModuleAnalysis, TechniqueAnalyzerContext } from './moduleAnalyzers/shared'
import { TECHNIQUE_ANALYSIS_OPTIONS } from './options'
import { prepareTechniqueEvidence } from './prepareEvidence'
import { TECHNIQUE_ANALYSIS_ENGINE_VERSION, type AnalyzeTechniqueInput, type TechniqueAnalysisResult } from './types'

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

export function analyzeTechnique(input: AnalyzeTechniqueInput): TechniqueAnalysisResult {
  const { exercise, recording, alignment, noteGrading, timingAnalysis, novelty } = input
  const structureMatches = exercise.events.length === alignment.expectedGroups.length && exercise.events.every((event, index) => {
    const group = alignment.expectedGroups[index]
    return Boolean(group) && compareTime(event.position, group!.position) === 0 && sameMidiMultiset(event.midiNotes, group!.pitches)
  })
  const identityMatches = structureMatches && exercise.id === novelty.exerciseInstanceId && alignment.expectedPlanId === noteGrading.expectedPlanId && alignment.expectedPlanId === timingAnalysis.expectedPlanId
    && recording.id === alignment.recordingId && noteGrading.recordingId === recording.id && noteGrading.alignmentId === alignment.id
    && timingAnalysis.recordingId === recording.id && timingAnalysis.alignmentId === alignment.id && timingAnalysis.noteGradingId === noteGrading.id
  const evidence = prepareTechniqueEvidence(exercise, alignment, noteGrading, timingAnalysis)
  const provisional = alignment.status === 'ambiguous' || noteGrading.reliability === 'provisional' || timingAnalysis.reliability === 'provisional'
  const module = dispatch({ exercise, evidence, novelty, provisional, options: TECHNIQUE_ANALYSIS_OPTIONS, timingAnalysis })
  const facets = identityMatches ? module.facets : module.facets.map((facet) => ({ ...facet, status: 'unavailable' as const, score: null, reliability: 'unavailable' as const, evidenceCount: 0, eligibleCount: 0, coverage: 0, observationIds: [], summary: 'Unavailable because the frozen exercise and analysis inputs do not describe the same authored take.' }))
  const result: TechniqueAnalysisResult = {
    id: `technique-analysis:${stableHash(JSON.stringify({ exercise: exercise.id, recording: recording.id, alignment: alignment.id, note: noteGrading.id, timing: timingAnalysis.id, novelty, version: TECHNIQUE_ANALYSIS_ENGINE_VERSION }))}`,
    status: identityMatches && facets.some((facet) => facet.status === 'ready') ? 'ready' : 'unavailable', moduleId: exercise.spec.moduleId,
    exerciseInstanceId: exercise.id, recordingId: recording.id, alignmentId: alignment.id, noteGradingId: noteGrading.id, timingAnalysisId: timingAnalysis.id,
    analysisEngineVersion: TECHNIQUE_ANALYSIS_ENGINE_VERSION, completion: evidence.completion, novelty, challenge: exercise.challenge,
    facets, observations: identityMatches ? module.observations : [], findings: identityMatches ? module.findings : [],
    exclusions: [`${Math.max(0, timingAnalysis.rhythm.observations.length - evidence.intervals.length)} timing observations excluded because both adjacent groups were not perfect correct-note matches.`],
    warnings: [...(!identityMatches ? ['Technique inputs do not describe one immutable exercise take, or the frozen exercise events do not match the aligned expected groups.'] : []), ...(provisional ? ['Underlying correspondence is provisional; affected facets remain provisional.'] : [])],
  }
  return deepFreeze(result)
}
