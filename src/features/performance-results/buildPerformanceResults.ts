import type { AlignmentResult, ExpectedAlignmentGroup, GroupAlignment } from '../alignment/types'
import type { ExpectedPerformancePlan, TempoTimelinePoint } from '../expected-performance/types'
import { midiNoteName } from '../midi/notes'
import { addTime, compareTime, maxTime, ZERO_TIME, type MusicalTime } from '../musicxml/musicalTime'
import type { NormalizedMeasure, NormalizedScore } from '../musicxml/types'
import type { AdditionalPerformedAttackResult, ExpectedTargetResult, NoteGradingResult } from '../note-grading/types'
import type { LocalTempoSample, QualitativeTempoDirectionObservation, RhythmObservation, TimingAnalysisResult } from '../timing-analysis/types'
import { clamp01, deepFreeze, stableHash } from '../timing-analysis/math'
import {
  aggregateNoteMetrics,
  aggregateRhythmMetrics,
  aggregateTempoMetrics,
  buildConfidence,
  buildEvidence,
  buildPracticePriority,
  deriveIssueCategories,
  strengthIndex,
  type TempoTargetContext,
} from './metrics'
import { RESULT_AGGREGATION_VERSION, resolvePerformanceResultOptions, type PerformanceResultOptions } from './options'
import type {
  HeatmapCell,
  MeasureResult,
  MeasureResultReference,
  MistakeResult,
  MistakeSeverityLabel,
  PerformanceResults,
  PerformanceResultsReliability,
  PerformanceResultsWarning,
  ScoreResultMapping,
  ScoreResultReference,
  SectionResult,
} from './types'

export interface BuildPerformanceResultsInput {
  readonly normalizedScore: NormalizedScore
  readonly expectedPlan: ExpectedPerformancePlan
  readonly alignment: AlignmentResult
  readonly noteGrading: NoteGradingResult
  readonly timingAnalysis: TimingAnalysisResult
  readonly options?: Partial<PerformanceResultOptions>
}

interface MeasureSlot {
  readonly id: string
  readonly sourceMeasureIds: readonly string[]
  readonly measures: readonly { partId: string; measure: NormalizedMeasure }[]
  readonly partIds: readonly string[]
  readonly measureIndex: number
  readonly displayMeasureNumber: string
  readonly start: MusicalTime
  readonly end: MusicalTime
  readonly sourceEventIds: readonly string[]
}

interface MeasureDraft {
  readonly slot: MeasureSlot
  readonly inScope: boolean
  readonly expectedResults: ExpectedTargetResult[]
  readonly additionalResults: AdditionalPerformedAttackResult[]
  readonly rhythmObservations: RhythmObservation[]
  readonly tempoSamples: LocalTempoSample[]
  readonly tempoDirections: QualitativeTempoDirectionObservation[]
  alignmentCorrespondenceCount: number
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)]
}

function minimumTime(left: MusicalTime, right: MusicalTime): MusicalTime {
  return compareTime(left, right) <= 0 ? left : right
}

function measureSpan(measure: NormalizedMeasure): MusicalTime {
  if (compareTime(measure.actualContentDuration, ZERO_TIME) > 0) return measure.actualContentDuration
  return measure.expectedDuration ?? ZERO_TIME
}

function buildMeasureSlots(score: NormalizedScore, plan: ExpectedPerformancePlan): MeasureSlot[] {
  const included = new Set(plan.includedPartIds)
  const byIndex = new Map<number, { partId: string; measure: NormalizedMeasure }[]>()
  for (const part of score.parts) {
    if (!included.has(part.id)) continue
    for (const measure of part.measures) {
      const group = byIndex.get(measure.index)
      const entry = { partId: part.id, measure }
      if (group) group.push(entry)
      else byIndex.set(measure.index, [entry])
    }
  }
  return [...byIndex.entries()].sort(([left], [right]) => left - right).map(([measureIndex, entries]) => {
    const ordered = [...entries].sort((left, right) => plan.includedPartIds.indexOf(left.partId) - plan.includedPartIds.indexOf(right.partId) || left.measure.id.localeCompare(right.measure.id))
    let start = ordered[0]?.measure.absoluteOnset ?? ZERO_TIME
    let end = start
    for (const entry of ordered) {
      start = minimumTime(start, entry.measure.absoluteOnset)
      end = maxTime(end, addTime(entry.measure.absoluteOnset, measureSpan(entry.measure)))
    }
    const sourceMeasureIds = ordered.map((entry) => entry.measure.id)
    const displayNumbers = unique(ordered.map((entry) => entry.measure.number))
    return {
      id: `result-measure:${stableHash(`${plan.id}|${sourceMeasureIds.join('|')}`)}`,
      sourceMeasureIds,
      measures: ordered,
      partIds: ordered.map((entry) => entry.partId),
      measureIndex,
      displayMeasureNumber: displayNumbers.join(' / '),
      start,
      end,
      sourceEventIds: ordered.flatMap((entry) => entry.measure.events.map((event) => event.id)),
    }
  })
}

function activeTempoPointIndex(points: readonly TempoTimelinePoint[], position: MusicalTime): number {
  let lower = 0
  let upper = points.length - 1
  let active = 0
  while (lower <= upper) {
    const middle = Math.floor((lower + upper) / 2)
    if (compareTime(points[middle]!.position, position) <= 0) {
      active = middle
      lower = middle + 1
    } else upper = middle - 1
  }
  return active
}

function tempoTargetContext(plan: ExpectedPerformancePlan, start: MusicalTime, end: MusicalTime, speed: number): TempoTargetContext {
  const activeIndex = activeTempoPointIndex(plan.tempoTimeline.points, start)
  const points = [plan.tempoTimeline.points[activeIndex]!]
  for (let index = activeIndex + 1; index < plan.tempoTimeline.points.length; index += 1) {
    const point = plan.tempoTimeline.points[index]!
    if (compareTime(point.position, end) >= 0) break
    if (compareTime(point.position, start) > 0) points.push(point)
  }
  const distinct = points.filter((point, index) => points.findIndex((candidate) => candidate.id === point.id) === index)
  const sources = new Set(distinct.map((point) => point.source))
  return {
    effectiveBpms: distinct.map((point) => point.quarterBpm * speed),
    source: sources.size > 1 ? 'mixed' : sources.has('fallback') ? 'fallback' : distinct.length ? 'authored' : null,
  }
}

function scopeContains(slot: MeasureSlot, alignment: AlignmentResult, noteGrading: NoteGradingResult): boolean {
  if (noteGrading.scope.type === 'full-plan') return true
  const startIndex = noteGrading.scope.expectedStartIndex
  const endIndex = noteGrading.scope.expectedEndIndex
  if (startIndex === null || endIndex === null) return false
  const scopeStart = alignment.expectedGroups[startIndex]?.position
  const scopeEnd = alignment.expectedGroups[endIndex]?.position
  if (!scopeStart || !scopeEnd) return false
  if (compareTime(slot.start, slot.end) === 0) return compareTime(slot.start, scopeStart) >= 0 && compareTime(slot.start, scopeEnd) <= 0
  return compareTime(slot.end, scopeStart) > 0 && compareTime(slot.start, scopeEnd) <= 0
}

function resultReliability(alignment: AlignmentResult, noteGrading: NoteGradingResult, timing: TimingAnalysisResult): PerformanceResultsReliability {
  if (noteGrading.status === 'unavailable') return 'unavailable'
  if (alignment.status === 'ambiguous' || noteGrading.reliability === 'provisional' || timing.reliability === 'provisional') return 'provisional'
  if (timing.status === 'unavailable' || timing.reliability === 'limited') return 'limited'
  return 'reliable'
}

function expectedGroupSlot(group: ExpectedAlignmentGroup, attackSlot: ReadonlyMap<string, MeasureDraft>): MeasureDraft | null {
  for (const attackId of group.attackIds) {
    const draft = attackSlot.get(attackId)
    if (draft) return draft
  }
  return null
}

function expectedStepGroup(step: GroupAlignment): ExpectedAlignmentGroup | null {
  return step.kind === 'performed-only' ? null : step.expectedGroup
}

function buildAdditionalAttributionIndex(
  alignment: AlignmentResult,
  attackSlot: ReadonlyMap<string, MeasureDraft>,
): ReadonlyMap<string, { draft: MeasureDraft | null; attribution: MistakeResult['attribution'] }> {
  const previousByStep = new Map<string, MeasureDraft | null>()
  const nextByStep = new Map<string, MeasureDraft | null>()
  let previous: MeasureDraft | null = null
  for (const step of alignment.groupAlignments) {
    previousByStep.set(step.id, previous)
    const group = expectedStepGroup(step)
    if (group) previous = expectedGroupSlot(group, attackSlot)
  }
  let next: MeasureDraft | null = null
  for (let index = alignment.groupAlignments.length - 1; index >= 0; index -= 1) {
    const step = alignment.groupAlignments[index]!
    nextByStep.set(step.id, next)
    const group = expectedStepGroup(step)
    if (group) next = expectedGroupSlot(group, attackSlot)
  }
  const result = new Map<string, { draft: MeasureDraft | null; attribution: MistakeResult['attribution'] }>()
  for (const step of alignment.groupAlignments) {
    if (step.kind === 'correspondence') {
      result.set(step.id, { draft: expectedGroupSlot(step.expectedGroup, attackSlot), attribution: 'aligned-group' })
      continue
    }
    if (step.kind !== 'performed-only') {
      result.set(step.id, { draft: null, attribution: 'unattributed' })
      continue
    }
    const previousDraft = previousByStep.get(step.id) ?? null
    const nextDraft = nextByStep.get(step.id) ?? null
    result.set(step.id, previousDraft && nextDraft
      ? { draft: previousDraft.slot.id === nextDraft.slot.id ? previousDraft : nextDraft, attribution: 'bracketed-region' }
      : { draft: null, attribution: 'unattributed' })
  }
  return result
}

function severityLabel(value: number): MistakeSeverityLabel {
  return value >= 0.75 ? 'high' : value >= 0.4 ? 'medium' : 'low'
}

function noteMistake(result: ExpectedTargetResult, draft: MeasureDraft): MistakeResult | null {
  if (result.kind !== 'wrong-pitch' && result.kind !== 'missed') return null
  const wrong = result.kind === 'wrong-pitch'
  const severity = wrong ? clamp01(0.68 + Math.min(result.absoluteSemitoneDistance, 12) / 120) : 0.82
  return {
    id: `result-mistake:${result.kind}:${stableHash(result.id)}`,
    type: result.kind,
    dimension: 'notes',
    measureResultId: draft.slot.id,
    measureIndex: draft.slot.measureIndex,
    displayMeasureNumber: draft.slot.displayMeasureNumber,
    scorePosition: { ...result.target.scorePosition },
    expectedResultIds: [result.id],
    sourceExpectedAttackIds: [...result.target.sourceExpectedAttackIds],
    sourceNoteIds: [...result.target.sourceNoteIds],
    performedAttackIds: wrong ? [result.performedAttackId] : [],
    timingObservationIds: [],
    tempoSampleIds: [],
    severity,
    severityLabel: severityLabel(severity),
    title: wrong ? `${midiNoteName(result.target.midi)} played as ${midiNoteName(result.performedMidi)}` : `${midiNoteName(result.target.midi)} missed`,
    detail: wrong ? `${result.semitoneDelta > 0 ? '+' : ''}${result.semitoneDelta} semitones from the expected key.` : 'The expected physical key target had no matched attack.',
    attribution: 'expected-target',
  }
}

function additionalMistake(result: AdditionalPerformedAttackResult, draft: MeasureDraft | null, attribution: MistakeResult['attribution']): MistakeResult {
  const severity = 0.52
  return {
    id: `result-mistake:additional:${stableHash(result.id)}`,
    type: 'additional',
    dimension: 'notes',
    measureResultId: draft?.slot.id ?? null,
    measureIndex: draft?.slot.measureIndex ?? null,
    displayMeasureNumber: draft?.slot.displayMeasureNumber ?? null,
    scorePosition: draft ? { ...draft.slot.start } : null,
    expectedResultIds: [],
    sourceExpectedAttackIds: [],
    sourceNoteIds: [],
    performedAttackIds: [result.performedAttackId],
    timingObservationIds: [],
    tempoSampleIds: [],
    severity,
    severityLabel: severityLabel(severity),
    title: `Additional ${midiNoteName(result.midi)}`,
    detail: draft ? 'The attack was unused by note correspondence and is associated only with its aligned musical region.' : 'The attack has no unambiguous expected score region.',
    attribution,
  }
}

function rhythmMistake(observation: RhythmObservation, draft: MeasureDraft): MistakeResult {
  const isEarly = observation.intervalCategory === 'compressed'
  const severity = clamp01(observation.rhythmLoss ?? 0)
  return {
    id: `result-mistake:${isEarly ? 'timing-early' : 'timing-late'}:${stableHash(observation.id)}`,
    type: isEarly ? 'timing-early' : 'timing-late',
    dimension: 'rhythm',
    measureResultId: draft.slot.id,
    measureIndex: draft.slot.measureIndex,
    displayMeasureNumber: draft.slot.displayMeasureNumber,
    scorePosition: { ...observation.expectedPosition },
    expectedResultIds: [],
    sourceExpectedAttackIds: [],
    sourceNoteIds: [],
    performedAttackIds: [],
    timingObservationIds: [observation.id],
    tempoSampleIds: [],
    severity,
    severityLabel: severityLabel(severity),
    title: isEarly ? 'Compressed rhythmic interval' : 'Expanded rhythmic interval',
    detail: `${Math.abs(observation.intervalDifferenceMs ?? 0).toFixed(0)} ms beyond the tempo-normalized interval prediction.`,
    attribution: 'destination-onset-measure',
  }
}

function compareMistakes(left: MistakeResult, right: MistakeResult): number {
  if (left.scorePosition && right.scorePosition) {
    const time = compareTime(left.scorePosition, right.scorePosition)
    if (time !== 0) return time
  } else if (left.scorePosition) return -1
  else if (right.scorePosition) return 1
  const order: Record<MistakeResult['type'], number> = { 'wrong-pitch': 0, missed: 1, additional: 2, 'timing-early': 3, 'timing-late': 4, 'tempo-region': 5, 'tempo-direction': 6 }
  return (left.measureIndex ?? Number.MAX_SAFE_INTEGER) - (right.measureIndex ?? Number.MAX_SAFE_INTEGER) || order[left.type] - order[right.type] || left.id.localeCompare(right.id)
}

function updateReference(record: Record<string, ScoreResultReference>, key: string, reference: ScoreResultReference): void {
  const current = record[key]
  record[key] = current ? {
    expectedTargetResultIds: unique([...current.expectedTargetResultIds, ...reference.expectedTargetResultIds]),
    mistakeIds: unique([...current.mistakeIds, ...reference.mistakeIds]),
    measureResultIds: unique([...current.measureResultIds, ...reference.measureResultIds]),
    resultKinds: unique([...current.resultKinds, ...reference.resultKinds]),
  } : reference
}

function buildMapping(noteGrading: NoteGradingResult, measures: readonly MeasureResult[], mistakes: readonly MistakeResult[]): ScoreResultMapping {
  const byExpectedAttackId: Record<string, ScoreResultReference> = {}
  const bySourceNoteId: Record<string, ScoreResultReference> = {}
  const mistakeByExpectedResult = new Map<string, string[]>()
  for (const mistake of mistakes) for (const resultId of mistake.expectedResultIds) {
    const ids = mistakeByExpectedResult.get(resultId)
    if (ids) ids.push(mistake.id)
    else mistakeByExpectedResult.set(resultId, [mistake.id])
  }
  const measureByExpectedAttack = new Map(measures.flatMap((measure) => measure.sourceExpectedAttackIds.map((id) => [id, measure.id] as const)))
  for (const result of noteGrading.expectedResults) {
    const measureResultIds = unique(result.target.sourceExpectedAttackIds.flatMap((attackId) => {
      const measureResultId = measureByExpectedAttack.get(attackId)
      return measureResultId ? [measureResultId] : []
    }))
    const reference: ScoreResultReference = {
      expectedTargetResultIds: [result.id],
      mistakeIds: mistakeByExpectedResult.get(result.id) ?? [],
      measureResultIds,
      resultKinds: [result.kind],
    }
    for (const attackId of result.target.sourceExpectedAttackIds) updateReference(byExpectedAttackId, attackId, reference)
    for (const noteId of result.target.sourceNoteIds) updateReference(bySourceNoteId, noteId, reference)
  }
  const bySourceMeasureId: Record<string, MeasureResultReference> = {}
  for (const measure of measures) for (const sourceMeasureId of measure.sourceMeasureIds) bySourceMeasureId[sourceMeasureId] = {
    measureResultId: measure.id,
    mistakeIds: [...measure.mistakeIds],
    sourceNoteIds: [...measure.sourceNoteIds],
  }
  return {
    byExpectedAttackId,
    bySourceNoteId,
    bySourceMeasureId,
    unattributedMistakeIds: mistakes.filter((mistake) => mistake.measureResultId === null).map((mistake) => mistake.id),
  }
}

function sectionOverlap(left: SectionResult, right: SectionResult): number {
  const intersection = left.measureResultIds.filter((id) => right.measureResultIds.includes(id)).length
  return intersection / Math.min(left.measureResultIds.length, right.measureResultIds.length)
}

function suppressOverlap(candidates: readonly SectionResult[], maximum: number, ratio: number): SectionResult[] {
  const selected: SectionResult[] = []
  for (const candidate of candidates) {
    if (selected.some((existing) => sectionOverlap(existing, candidate) >= ratio)) continue
    selected.push(candidate)
    if (selected.length >= maximum) break
  }
  return selected
}

function buildHeatmap(measures: readonly MeasureResult[]): HeatmapCell[] {
  return measures.map((measure) => {
    const priority = measure.practicePriority.confidenceAdjustedPriority
    const scoreValues = [measure.note.noteScore, measure.rhythm.rhythmScore, measure.tempo.tempoScore].filter((value): value is number => value !== null)
    const strong = scoreValues.length >= 2 && scoreValues.every((value) => value >= 0.86) && (measure.confidence.category === 'high' || measure.confidence.category === 'medium')
    const semanticLevel = measure.analysisState === 'outside-scope' ? 'outside-scope' as const
      : measure.analysisState === 'insufficient-evidence' ? 'unavailable' as const
        : priority !== null && priority >= 0.42 ? 'focus' as const
          : priority !== null && priority >= 0.2 ? 'review' as const
            : strong ? 'strong' as const : 'steady' as const
    const metric = (label: string, value: number | null) => `${label} ${value === null ? 'unavailable' : Math.round(value * 100)}`
    return {
      id: `heatmap:${measure.id}`,
      measureResultId: measure.id,
      displayMeasureNumber: measure.displayMeasureNumber,
      analysisState: measure.analysisState,
      confidence: measure.confidence.category,
      practicePriority: priority,
      noteScore: measure.note.noteScore,
      rhythmScore: measure.rhythm.rhythmScore,
      tempoScore: measure.tempo.tempoScore,
      semanticLevel,
      accessibleSummary: `Measure ${measure.displayMeasureNumber}. ${metric('Notes', measure.note.noteScore)}. ${metric('Rhythm', measure.rhythm.rhythmScore)}. ${metric('Tempo', measure.tempo.tempoScore)}. ${measure.confidence.category} evidence.`,
    }
  })
}

function emptyMapping(): ScoreResultMapping {
  return { byExpectedAttackId: {}, bySourceNoteId: {}, bySourceMeasureId: {}, unattributedMistakeIds: [] }
}

export function buildPerformanceResults({ normalizedScore, expectedPlan, alignment, noteGrading, timingAnalysis, options: partialOptions = {} }: BuildPerformanceResultsInput): PerformanceResults {
  const options = resolvePerformanceResultOptions(partialOptions)
  const resultId = `performance-results:${stableHash(JSON.stringify({ scoreId: normalizedScore.id, expectedPlanId: expectedPlan.id, alignmentId: alignment.id, noteGradingId: noteGrading.id, timingAnalysisId: timingAnalysis.id, version: RESULT_AGGREGATION_VERSION, options }))}`
  const warnings: PerformanceResultsWarning[] = []
  const inputMatches = expectedPlan.scoreId === normalizedScore.id
    && alignment.expectedPlanId === expectedPlan.id
    && noteGrading.expectedPlanId === expectedPlan.id
    && noteGrading.alignmentId === alignment.id
    && noteGrading.recordingId === alignment.recordingId
    && timingAnalysis.expectedPlanId === expectedPlan.id
    && timingAnalysis.alignmentId === alignment.id
    && timingAnalysis.noteGradingId === noteGrading.id
    && timingAnalysis.recordingId === alignment.recordingId
  let unavailableReason: string | null = null
  if (!inputMatches) {
    unavailableReason = 'The score, plan, alignment, note grading, and timing analysis do not describe the same result snapshot.'
    warnings.push({ code: 'INPUT_ID_MISMATCH', severity: 'warning', message: unavailableReason })
  } else if (noteGrading.status === 'unavailable') {
    unavailableReason = noteGrading.unavailableReason ?? 'Note results are unavailable for aggregation.'
    warnings.push({ code: 'NOTE_RESULTS_UNAVAILABLE', severity: 'warning', message: unavailableReason })
  }
  const slots = buildMeasureSlots(normalizedScore, expectedPlan)
  if (slots.length === 0 && unavailableReason === null) {
    unavailableReason = 'No measures from the expected plan part selection are present in the normalized score.'
    warnings.push({ code: 'NO_INCLUDED_MEASURES', severity: 'warning', message: unavailableReason })
  }
  const reliability = unavailableReason ? 'unavailable' : resultReliability(alignment, noteGrading, timingAnalysis)
  if (!unavailableReason && timingAnalysis.status === 'unavailable') warnings.push({ code: 'TIMING_RESULTS_UNAVAILABLE', severity: 'info', message: 'Note results remain available, but measure Rhythm and Tempo metrics require more timing evidence.' })
  if (!unavailableReason && reliability === 'provisional') warnings.push({ code: 'PROVISIONAL_SOURCE_ANALYSIS', severity: 'warning', message: 'Results remain provisional because one or more source analyses depend on ambiguous correspondence.' })
  const baseDiagnostics = {
    resultAggregationVersion: RESULT_AGGREGATION_VERSION,
    alignmentEngineVersion: alignment.diagnostics.alignmentEngineVersion,
    noteGradingEngineVersion: noteGrading.diagnostics.noteGradingEngineVersion,
    timingAnalysisEngineVersion: timingAnalysis.diagnostics.timingAnalysisEngineVersion,
  }
  if (unavailableReason) return deepFreeze({
    id: resultId,
    status: 'unavailable', reliability: 'unavailable', unavailableReason,
    normalizedScoreId: normalizedScore.id, expectedPlanId: expectedPlan.id, alignmentId: alignment.id, noteGradingId: noteGrading.id, timingAnalysisId: timingAnalysis.id,
    scope: noteGrading.scope.type, summary: { notes: noteGrading.metrics.noteScore, rhythm: null, tempo: null }, measures: [], sections: [], weakestSections: [], strongestSections: [], mistakes: [], heatmap: [], mapping: emptyMapping(), warnings,
    diagnostics: { ...baseDiagnostics, includedMeasureCount: slots.length, analyzedMeasureCount: 0, sectionWindowCount: 0, weakSectionCount: 0, strongSectionCount: 0, mistakeCount: 0, unattributedMistakeCount: 0 },
  } satisfies PerformanceResults)

  const drafts = slots.map((slot): MeasureDraft => ({ slot, inScope: scopeContains(slot, alignment, noteGrading), expectedResults: [], additionalResults: [], rhythmObservations: [], tempoSamples: [], tempoDirections: [], alignmentCorrespondenceCount: 0 }))
  const draftByMeasureIndex = new Map(drafts.map((draft) => [draft.slot.measureIndex, draft]))
  const draftByPartMeasure = new Map<string, MeasureDraft>()
  for (const draft of drafts) for (const measure of draft.slot.measures) draftByPartMeasure.set(`${measure.partId}:${measure.measure.index}`, draft)
  const attackSlot = new Map<string, MeasureDraft>()
  const attacksBySlot = new Map<string, ExpectedPerformancePlan['attacks'][number][]>()
  for (const attack of expectedPlan.attacks) {
    const draft = draftByPartMeasure.get(`${attack.partId}:${attack.measureIndex}`)
    if (draft) {
      attackSlot.set(attack.id, draft)
      const attacks = attacksBySlot.get(draft.slot.id)
      if (attacks) attacks.push(attack)
      else attacksBySlot.set(draft.slot.id, [attack])
    }
  }
  const groupById = new Map(alignment.expectedGroups.map((group) => [group.id, group]))
  const slotForTarget = (result: ExpectedTargetResult) => result.target.sourceExpectedAttackIds.map((id) => attackSlot.get(id)).find((draft) => draft !== undefined) ?? null
  for (const result of noteGrading.expectedResults) {
    if (result.kind !== 'correct' && result.kind !== 'wrong-pitch' && result.kind !== 'missed') continue
    const draft = slotForTarget(result)
    if (draft) draft.expectedResults.push(result)
  }
  const additionalIndex = buildAdditionalAttributionIndex(alignment, attackSlot)
  const additionalAttributions = new Map<string, { draft: MeasureDraft | null; attribution: MistakeResult['attribution'] }>()
  for (const result of noteGrading.performedResults) {
    if (result.kind !== 'additional') continue
    const attribution = result.groupAlignmentId ? additionalIndex.get(result.groupAlignmentId) ?? { draft: null, attribution: 'unattributed' as const } : { draft: null, attribution: 'unattributed' as const }
    additionalAttributions.set(result.id, attribution)
    if (attribution.draft?.inScope) attribution.draft.additionalResults.push(result)
  }
  for (const step of alignment.groupAlignments) {
    if (step.kind !== 'correspondence') continue
    const draft = expectedGroupSlot(step.expectedGroup, attackSlot)
    if (draft?.inScope) draft.alignmentCorrespondenceCount += 1
  }
  for (const observation of timingAnalysis.rhythm.observations) {
    const group = groupById.get(observation.expectedGroupId)
    const draft = group ? expectedGroupSlot(group, attackSlot) : null
    if (draft?.inScope) draft.rhythmObservations.push(observation)
  }
  for (const sample of timingAnalysis.tempo.localSamples) {
    const group = groupById.get(sample.endExpectedGroupId)
    const draft = group ? expectedGroupSlot(group, attackSlot) : null
    if (draft?.inScope) draft.tempoSamples.push(sample)
  }
  const planDirectionById = new Map(expectedPlan.tempoDirections.map((direction) => [direction.id, direction]))
  for (const direction of timingAnalysis.tempo.directionObservations) {
    const planDirection = planDirectionById.get(direction.sourceEventId)
    const draft = planDirection ? draftByPartMeasure.get(`${planDirection.partId}:${planDirection.measureIndex}`) : draftByMeasureIndex.get(direction.measureIndex)
    if (draft?.inScope) draft.tempoDirections.push(direction)
  }
  const provisional = reliability === 'provisional'
  let measures: MeasureResult[] = drafts.map((draft) => {
    const note = aggregateNoteMetrics(draft.expectedResults, draft.additionalResults)
    const rhythm = aggregateRhythmMetrics(draft.rhythmObservations, options)
    const tempo = aggregateTempoMetrics(draft.tempoSamples, draft.tempoDirections, tempoTargetContext(expectedPlan, draft.slot.start, draft.slot.end, alignment.practiceSpeedMultiplier), options)
    const evidence = buildEvidence(note, rhythm, tempo, draft.alignmentCorrespondenceCount)
    const confidence = buildConfidence(evidence, note.noteScore !== null, rhythm.rhythmScore !== null, tempo.tempoScore !== null, provisional, options)
    const priority = buildPracticePriority({ notes: note.noteScore, rhythm: rhythm.rhythmScore, tempo: tempo.tempoScore }, evidence, confidence, options)
    const attacks = attacksBySlot.get(draft.slot.id) ?? []
    const hasEvidence = note.gradeableExpectedTargets + note.additional + rhythm.observationCount + tempo.sampleCount + draft.alignmentCorrespondenceCount > 0
    const analysisState = !draft.inScope ? 'outside-scope' as const : hasEvidence ? 'analyzed' as const : 'insufficient-evidence' as const
    return {
      id: draft.slot.id,
      sourceMeasureIds: [...draft.slot.sourceMeasureIds], partIds: [...draft.slot.partIds], measureIndex: draft.slot.measureIndex, displayMeasureNumber: draft.slot.displayMeasureNumber,
      scorePositionStart: { ...draft.slot.start }, scorePositionEnd: { ...draft.slot.end }, analysisState,
      note, rhythm, tempo, evidence, confidence, practicePriority: priority, mistakeIds: [],
      mainIssues: deriveIssueCategories(note, rhythm, tempo, draft.tempoDirections.some((direction) => direction.outcome === 'not-followed')),
      sourceExpectedAttackIds: attacks.map((attack) => attack.id), sourceNoteIds: unique(attacks.flatMap((attack) => attack.sourceNoteIds)), sourceEventIds: [...draft.slot.sourceEventIds], staffs: unique(attacks.flatMap((attack) => attack.staff === null ? [] : [attack.staff])).sort((a, b) => a - b),
    }
  })
  const draftById = new Map(drafts.map((draft) => [draft.slot.id, draft]))
  const mistakes: MistakeResult[] = []
  for (const result of noteGrading.expectedResults) {
    const draft = slotForTarget(result)
    if (!draft?.inScope) continue
    const mistake = noteMistake(result, draft)
    if (mistake) mistakes.push(mistake)
  }
  for (const result of noteGrading.performedResults) {
    if (result.kind !== 'additional') continue
    const attribution = additionalAttributions.get(result.id) ?? { draft: null, attribution: 'unattributed' as const }
    if (attribution.draft && !attribution.draft.inScope) continue
    mistakes.push(additionalMistake(result, attribution.draft, attribution.attribution))
  }
  for (const draft of drafts) for (const observation of draft.rhythmObservations) {
    if (observation.rhythmLoss !== null && observation.rhythmLoss >= options.significantRhythmLoss && observation.intervalCategory !== 'within-tolerance') mistakes.push(rhythmMistake(observation, draft))
  }
  for (const measure of measures) {
    if (measure.tempo.tempoScore !== null && measure.tempo.tempoScore < options.tempoIssueScoreThreshold) {
      const severity = clamp01(1 - measure.tempo.tempoScore)
      mistakes.push({
        id: `result-mistake:tempo-region:${stableHash(measure.id)}`, type: 'tempo-region', dimension: 'tempo', measureResultId: measure.id, measureIndex: measure.measureIndex, displayMeasureNumber: measure.displayMeasureNumber, scorePosition: { ...measure.scorePositionStart }, expectedResultIds: [], sourceExpectedAttackIds: [], sourceNoteIds: [], performedAttackIds: [], timingObservationIds: [], tempoSampleIds: [...measure.tempo.sampleIds], severity, severityLabel: severityLabel(severity), title: 'Tempo away from target', detail: measure.tempo.medianTempoRatio === null ? 'Local tempo evidence is below target quality.' : `${(measure.tempo.medianTempoRatio * 100).toFixed(0)}% of the effective target with local stability included.`, attribution: 'measure-tempo',
      })
    }
    const draft = draftById.get(measure.id)!
    for (const direction of draft.tempoDirections.filter((item) => item.outcome === 'not-followed')) mistakes.push({
      id: `result-mistake:tempo-direction:${stableHash(direction.id)}`, type: 'tempo-direction', dimension: 'tempo', measureResultId: measure.id, measureIndex: measure.measureIndex, displayMeasureNumber: measure.displayMeasureNumber, scorePosition: { ...direction.position }, expectedResultIds: [], sourceExpectedAttackIds: [], sourceNoteIds: [], performedAttackIds: [], timingObservationIds: [], tempoSampleIds: [], severity: 0.36, severityLabel: 'low', title: `${direction.text} not evident`, detail: 'The qualitative direction was not evident in the available local tempo trend; no numeric curve was assumed.', attribution: 'measure-tempo',
    })
  }
  mistakes.sort(compareMistakes)
  const mistakeIdsByMeasure = new Map<string, string[]>()
  for (const mistake of mistakes) if (mistake.measureResultId) {
    const ids = mistakeIdsByMeasure.get(mistake.measureResultId)
    if (ids) ids.push(mistake.id)
    else mistakeIdsByMeasure.set(mistake.measureResultId, [mistake.id])
  }
  measures = measures.map((measure) => ({ ...measure, mistakeIds: mistakeIdsByMeasure.get(measure.id) ?? [] }))
  const expectedById = new Map(noteGrading.expectedResults.map((result) => [result.id, result]))
  const additionalById = new Map(noteGrading.performedResults.filter((result): result is AdditionalPerformedAttackResult => result.kind === 'additional').map((result) => [result.id, result]))
  const rhythmById = new Map(timingAnalysis.rhythm.observations.map((observation) => [observation.id, observation]))
  const sampleById = new Map(timingAnalysis.tempo.localSamples.map((sample) => [sample.id, sample]))
  const directionById = new Map(timingAnalysis.tempo.directionObservations.map((direction) => [direction.id, direction]))
  const sectionLength = Math.min(options.sectionLengthMeasures, measures.length)
  const minimumLength = options.minimumSectionLengthMeasures
  const sections: SectionResult[] = []
  if (sectionLength >= minimumLength && sectionLength > 0) for (let start = 0; start + sectionLength <= measures.length; start += options.sectionStepMeasures) {
    const window = measures.slice(start, start + sectionLength)
    if (window.some((measure) => measure.analysisState === 'outside-scope')) continue
    if (window.some((measure, index) => index > 0 && measure.measureIndex !== window[index - 1]!.measureIndex + 1)) continue
    const expected = unique(window.flatMap((measure) => measure.note.expectedResultIds)).map((id) => expectedById.get(id)).filter((result): result is ExpectedTargetResult => result !== undefined)
    const additional = unique(window.flatMap((measure) => measure.note.attributedAdditionalResultIds)).map((id) => additionalById.get(id)).filter((result): result is AdditionalPerformedAttackResult => result !== undefined)
    const rhythmObservations = unique(window.flatMap((measure) => measure.rhythm.observationIds)).map((id) => rhythmById.get(id)).filter((observation): observation is RhythmObservation => observation !== undefined)
    const samples = unique(window.flatMap((measure) => measure.tempo.sampleIds)).map((id) => sampleById.get(id)).filter((sample): sample is LocalTempoSample => sample !== undefined)
    const directions = unique(window.flatMap((measure) => measure.tempo.qualitativeDirectionObservationIds)).map((id) => directionById.get(id)).filter((direction): direction is QualitativeTempoDirectionObservation => direction !== undefined)
    const first = window[0]!
    const last = window.at(-1)!
    const note = aggregateNoteMetrics(expected, additional)
    const rhythm = aggregateRhythmMetrics(rhythmObservations, options)
    const tempo = aggregateTempoMetrics(samples, directions, tempoTargetContext(expectedPlan, first.scorePositionStart, last.scorePositionEnd, alignment.practiceSpeedMultiplier), options)
    const evidence = buildEvidence(note, rhythm, tempo, window.reduce((sum, measure) => sum + measure.evidence.alignmentCorrespondenceCount, 0))
    const confidence = buildConfidence(evidence, note.noteScore !== null, rhythm.rhythmScore !== null, tempo.tempoScore !== null, provisional, options)
    const scores = { notes: note.noteScore, rhythm: rhythm.rhythmScore, tempo: tempo.tempoScore }
    const priority = buildPracticePriority(scores, evidence, confidence, options)
    const mainIssues = deriveIssueCategories(note, rhythm, tempo, directions.some((direction) => direction.outcome === 'not-followed'))
    const displayRange = first.displayMeasureNumber === last.displayMeasureNumber ? `Measure ${first.displayMeasureNumber}` : `Measures ${first.displayMeasureNumber}–${last.displayMeasureNumber}`
    const measureIds = window.map((measure) => measure.id)
    sections.push({
      id: `result-section:${stableHash(`${expectedPlan.id}|${measureIds.join('|')}|${sectionLength}`)}`,
      measureResultIds: measureIds, sourceMeasureIds: window.flatMap((measure) => measure.sourceMeasureIds), startMeasureIndex: first.measureIndex, endMeasureIndex: last.measureIndex, displayRange,
      scorePositionStart: { ...first.scorePositionStart }, scorePositionEnd: { ...last.scorePositionEnd }, note, rhythm, tempo, evidence, confidence, practicePriority: priority, strengthIndex: strengthIndex(scores, options), mistakeIds: unique(window.flatMap((measure) => measure.mistakeIds)), mainIssues,
    })
  }
  const weakCandidates = sections.filter((section) => (section.practicePriority.confidenceAdjustedPriority ?? 0) >= options.minimumWeaknessForRecommendation && section.confidence.weight >= options.minimumConfidenceForWeakSection && section.mainIssues.length > 0)
    .sort((left, right) => (right.practicePriority.confidenceAdjustedPriority ?? 0) - (left.practicePriority.confidenceAdjustedPriority ?? 0) || right.confidence.weight - left.confidence.weight || left.startMeasureIndex - right.startMeasureIndex || left.id.localeCompare(right.id))
  const strongCandidates = sections.filter((section) => {
    const scores = [section.note.noteScore, section.rhythm.rhythmScore, section.tempo.tempoScore].filter((value): value is number => value !== null)
    return section.confidence.weight >= options.minimumConfidenceForStrongSection && section.note.gradeableExpectedTargets >= options.minimumStrongExpectedTargets && scores.length >= 2 && scores.every((score) => score >= options.minimumStrongMetric)
  }).sort((left, right) => (right.strengthIndex ?? 0) - (left.strengthIndex ?? 0) || right.confidence.weight - left.confidence.weight || left.startMeasureIndex - right.startMeasureIndex || left.id.localeCompare(right.id))
  const weakestSections = suppressOverlap(weakCandidates, options.maxWeakSections, options.overlapSuppressionRatio)
  const strongestSections = suppressOverlap(strongCandidates, options.maxStrongSections, options.overlapSuppressionRatio)
  const heatmap = buildHeatmap(measures)
  const mapping = buildMapping(noteGrading, measures, mistakes)
  const result: PerformanceResults = {
    id: resultId,
    status: 'ready', reliability, unavailableReason: null,
    normalizedScoreId: normalizedScore.id, expectedPlanId: expectedPlan.id, alignmentId: alignment.id, noteGradingId: noteGrading.id, timingAnalysisId: timingAnalysis.id, scope: noteGrading.scope.type,
    summary: { notes: noteGrading.metrics.noteScore, rhythm: timingAnalysis.rhythm.rhythmScore, tempo: timingAnalysis.tempo.tempoScore },
    measures, sections, weakestSections, strongestSections, mistakes, heatmap, mapping, warnings,
    diagnostics: {
      ...baseDiagnostics,
      includedMeasureCount: measures.length,
      analyzedMeasureCount: measures.filter((measure) => measure.analysisState === 'analyzed').length,
      sectionWindowCount: sections.length,
      weakSectionCount: weakestSections.length,
      strongSectionCount: strongestSections.length,
      mistakeCount: mistakes.length,
      unattributedMistakeCount: mapping.unattributedMistakeIds.length,
    },
  }
  return deepFreeze(result)
}
