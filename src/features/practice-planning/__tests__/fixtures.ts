import type { PianoProgressRepository } from '../../persistence/repository'
import { createAttemptSummary, type AttemptSummary, type PerformanceAttemptRecord, type PerformanceAttemptRecordV1, type TechniqueAttemptSummary, type TechniqueAttemptSummaryV2 } from '../../persistence/types'
import { analyzeResult, makeResultPlan, recordingForPlan } from '../../performance-results/__tests__/fixtures'
import type { PerformanceResultsReliability, PracticePriority, SectionResult } from '../../performance-results/types'
import type { TechniqueChallengeProfileV2, TechniqueFacetId, TechniqueModuleId } from '../../technique/types'

const BASE_PLAN = makeResultPlan(4, 2)
const BASE_RECORDING = recordingForPlan(BASE_PLAN)
const BASE_ANALYSIS = analyzeResult(BASE_PLAN, BASE_RECORDING)
const BASE_SECTION = BASE_ANALYSIS.results.sections[0]!
export const NORMALIZED_SCORE_ID = BASE_ANALYSIS.results.normalizedScoreId

const EMPTY_PRIORITY: PracticePriority = { rawWeakness: 0, confidenceAdjustedPriority: 0, label: 'low', components: [] }

export interface AttemptFixtureOptions {
  readonly arrangementId?: string
  readonly scoreVersionId?: string
  readonly sessionId?: string
  readonly performedAt?: string
  readonly speed?: number
  readonly score?: number
  readonly notes?: number | null
  readonly rhythm?: number | null
  readonly tempo?: number | null
  readonly reliability?: PerformanceResultsReliability
  readonly scope?: 'full-plan' | 'aligned-span'
  readonly durationMs?: number
  readonly sourcePrefix?: string
  readonly displayRange?: string
  readonly sectionLength?: 2 | 3 | 4
  readonly outsideScopeMeasureIndex?: number
  readonly confidenceWeight?: number
  readonly aggregationVersion?: string
  readonly oldPracticePriority?: number
  readonly summaryOverrides?: Partial<AttemptSummary>
  readonly recordOverrides?: Partial<PerformanceAttemptRecordV1>
}

export function attemptFixture(id: string, options: AttemptFixtureOptions = {}): { readonly record: PerformanceAttemptRecord; readonly summary: AttemptSummary } {
  const arrangementId = options.arrangementId ?? 'arrangement-1'
  const scoreVersionId = options.scoreVersionId ?? 'score-version-1'
  const sessionId = options.sessionId ?? `session-${id}`
  const performedAt = options.performedAt ?? '2026-08-24T12:00:00.000Z'
  const score = options.score ?? 0.8
  const notes = options.notes === undefined ? score : options.notes
  const rhythm = options.rhythm === undefined ? score : options.rhythm
  const tempo = options.tempo === undefined ? score : options.tempo
  const reliability = options.reliability ?? 'reliable'
  const scope = options.scope ?? 'full-plan'
  const durationMs = options.durationMs ?? 300_000
  const sourcePrefix = options.sourcePrefix ?? 'source-measure'
  const sectionLength = options.sectionLength ?? 4
  const measures = BASE_ANALYSIS.results.measures.map((measure, index) => ({
    ...measure,
    id: `measure:${sourcePrefix}:${index}`,
    sourceMeasureIds: [`${sourcePrefix}:${index}`],
    analysisState: options.outsideScopeMeasureIndex === index ? 'outside-scope' as const : 'analyzed' as const,
  }))
  const sectionMeasures = measures.slice(0, sectionLength)
  const oldPriority = options.oldPracticePriority ?? 0
  const practicePriority: PracticePriority = { ...EMPTY_PRIORITY, rawWeakness: oldPriority, confidenceAdjustedPriority: oldPriority, label: oldPriority >= 0.4 ? 'high' : oldPriority >= 0.2 ? 'medium' : 'low' }
  const section: SectionResult = {
    ...BASE_SECTION,
    id: `section:${id}`,
    measureResultIds: sectionMeasures.map((measure) => measure.id),
    sourceMeasureIds: sectionMeasures.flatMap((measure) => measure.sourceMeasureIds),
    startMeasureIndex: 0,
    endMeasureIndex: sectionLength - 1,
    displayRange: options.displayRange ?? `Measures 1–${sectionLength}`,
    note: { ...BASE_SECTION.note, noteScore: notes },
    rhythm: { ...BASE_SECTION.rhythm, rhythmScore: rhythm },
    tempo: { ...BASE_SECTION.tempo, tempoScore: tempo },
    confidence: { ...BASE_SECTION.confidence, category: 'high', weight: options.confidenceWeight ?? 1, provisional: false },
    practicePriority,
  }
  const aggregationVersion = options.aggregationVersion ?? '1.0.0'
  const results = {
    ...BASE_ANALYSIS.results,
    id: `performance-results:${id}`,
    status: reliability === 'unavailable' ? 'unavailable' as const : 'ready' as const,
    reliability,
    unavailableReason: reliability === 'unavailable' ? 'Unavailable fixture.' : null,
    scope,
    summary: { notes, rhythm, tempo },
    measures,
    sections: [section],
    weakestSections: [section],
    strongestSections: [],
    diagnostics: { ...BASE_ANALYSIS.results.diagnostics, resultAggregationVersion: aggregationVersion },
  }
  const recording = { ...BASE_RECORDING, durationMs }
  const record: PerformanceAttemptRecordV1 = {
    id,
    schemaVersion: 1,
    arrangementId,
    scoreVersionId,
    practiceSessionId: sessionId,
    performedAt,
    practiceSpeedMultiplier: options.speed ?? 0.8,
    gradingScope: scope,
    includedPartIds: BASE_PLAN.includedPartIds,
    engineVersions: {
      alignment: BASE_ANALYSIS.alignment.diagnostics.alignmentEngineVersion,
      noteGrading: BASE_ANALYSIS.noteGrading.diagnostics.noteGradingEngineVersion,
      timingAnalysis: BASE_ANALYSIS.timingAnalysis.diagnostics.timingAnalysisEngineVersion,
      resultAggregation: aggregationVersion,
    },
    expectedPerformancePlan: BASE_PLAN,
    recording,
    alignment: BASE_ANALYSIS.alignment,
    noteGrading: BASE_ANALYSIS.noteGrading,
    timingAnalysis: BASE_ANALYSIS.timingAnalysis,
    performanceResults: results,
    ...options.recordOverrides,
  }
  return { record, summary: { ...createAttemptSummary(record), ...options.summaryOverrides } }
}

export function repositoryFixture(
  fixtures: readonly { readonly record: PerformanceAttemptRecord; readonly summary: AttemptSummary }[],
  techniqueSummaries: readonly TechniqueAttemptSummary[] = [],
  options: Readonly<{ missingAttemptIds?: readonly string[]; throwAttemptIds?: readonly string[]; arrangementExists?: boolean; scoreVersionExists?: boolean; scoreArrangementId?: string }> = {},
): { readonly repository: PianoProgressRepository; readonly getAttemptIds: string[] } {
  const getAttemptIds: string[] = []
  const records = new Map(fixtures.map((fixture) => [fixture.record.id, fixture.record]))
  const missing = new Set(options.missingAttemptIds ?? [])
  const throwing = new Set(options.throwAttemptIds ?? [])
  const repository = {
    getArrangement: async () => options.arrangementExists === false ? null : ({ id: 'arrangement-1', workId: 'work-1', name: 'Piano solo', difficulty: 'Intermediate', source: 'user-imported', includedPartIds: ['P1'], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' } as const),
    getScoreVersion: async () => options.scoreVersionExists === false ? null : ({ id: 'score-version-1', arrangementId: options.scoreArrangementId ?? 'arrangement-1', version: 1, format: 'musicxml', createdAt: '2026-01-01T00:00:00.000Z', sourceFileName: 'score.musicxml', sourceBytes: 100, uncompressedBytes: 100, contentHash: 'hash', canonicalMusicXml: '<score-partwise/>', normalizedScoreId: NORMALIZED_SCORE_ID, parserVersion: 'parser-1', includedPartIds: ['P1'] } as const),
    listAttemptSummaries: async () => fixtures.map((fixture) => fixture.summary),
    listTechniqueAttemptSummaries: async () => techniqueSummaries,
    getAttempt: async (id: string) => {
      getAttemptIds.push(id)
      if (throwing.has(id)) throw new Error('Corrupt fixture')
      return missing.has(id) ? null : records.get(id) ?? null
    },
  } as unknown as PianoProgressRepository
  return { repository, getAttemptIds }
}

const FACETS: Readonly<Record<TechniqueModuleId, readonly TechniqueFacetId[]>> = {
  'sight-reading': ['note-accuracy', 'pulse-continuity'], rhythm: ['rhythm-precision', 'pulse-continuity'],
  'chord-fluency': ['chord-accuracy', 'chord-synchronization'], scales: ['note-accuracy', 'onset-evenness'],
  arpeggios: ['note-accuracy', 'arpeggio-transition-consistency'], octaves: ['octave-integrity', 'onset-evenness'],
  'keyboard-jumps': ['landing-accuracy', 'jump-timing-consistency', 'recovery-continuity'],
  'tempo-control': ['target-tempo-control', 'tempo-stability'],
}

function challenge(overrides: Partial<TechniqueChallengeProfileV2> = {}): TechniqueChallengeProfileV2 {
  return { targetTempoBpm: 80, eventCount: 16, expectedDuration: { numerator: 4, denominator: 1 }, expectedDurationMs: 3_000,
    minimumMidi: 60, maximumMidi: 72, pitchSpanSemitones: 12, maximumChordSize: 1, maximumJumpSemitones: 12,
    rhythmicDensity: 4, smallestSubdivision: 4, tempoChangeCount: 0, octaveSpan: 1, moduleSpecific: {}, tonic: 0,
    mode: 'major', declaredHandContext: 'right', direction: 'ascending', subdivision: 4, chordInversion: 0,
    jumpSemitones: 12, tempoShape: 'steady', ...overrides }
}

export function techniqueSummary(id: string, moduleId: TechniqueModuleId, score: number, overrides: Readonly<{ performedAt?: string; tonic?: number; firstPass?: boolean }> = {}): TechniqueAttemptSummaryV2 {
  const firstPass = overrides.firstPass ?? true
  return {
    schemaVersion: 2,
    id,
    moduleId,
    templateId: `${moduleId}-standard-v2`,
    exerciseInstanceId: `instance-${id}`,
    performedAt: overrides.performedAt ?? '2026-08-24T12:00:00.000Z',
    durationMs: 3_000,
    exerciseEngineVersion: 'technique-exercise-1.1.1',
    techniqueAnalysisEngineVersion: 'technique-analysis-1.1.2',
    challenge: challenge({ tonic: overrides.tonic ?? 0 }),
    completion: { expectedEventCount: 16, attemptedEventCount: 16, completeCorrectOrIncorrectEventCount: 16, reachedSpanEndIndex: 15, eventCoverageRatio: 0.9, spanReachedRatio: 1, completeEnoughForEvidence: true },
    novelty: { exerciseInstanceId: `instance-${id}`, priorSavedAttemptCount: firstPass ? 0 : 1, firstSavedAttempt: firstPass },
    facets: FACETS[moduleId].map((facetId) => ({ id: facetId, label: facetId, status: 'ready', score, reliability: 'reliable', evidenceCount: 8, eligibleCount: 8, coverage: 0.9, evidenceFamily: facetId.includes('accuracy') || facetId.includes('integrity') ? 'pitch' : facetId.includes('tempo') ? 'tempo' : 'interval-precision', evidenceContext: moduleId === 'sight-reading' ? 'first-pass' : 'technical-drill', minimumEvidence: 4 })),
  }
}
