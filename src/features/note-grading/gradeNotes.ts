import type { ExpectedPerformancePlan } from '../expected-performance/types'
import type { PerformanceRecording } from '../performance/types'
import type { AlignmentResult, GroupAlignment, PerformedAttack, PerformedOnsetGroup } from '../alignment/types'
import { deriveExpectedKeyTargets } from './expectedTargets'
import { calculateNoteMetrics } from './metrics'
import { NOTE_GRADING_ENGINE_VERSION, resolveNoteGradingOptions, type NoteGradingOptions } from './options'
import { assignWrongPitches } from './wrongPitchAssignment'
import type {
  ExpectedKeyTarget,
  ExpectedTargetResult,
  GradingScope,
  GroupNoteClassification,
  GroupNoteResult,
  NoteGradingCounts,
  NoteGradingReliability,
  NoteGradingResult,
  NoteGradingWarning,
  PerformedAttackResult,
  WrongPitchCorrespondence,
} from './types'

export interface GradeNotesInput {
  readonly expectedPlan: ExpectedPerformancePlan
  readonly recording: PerformanceRecording
  readonly alignment: AlignmentResult
  readonly options?: Partial<NoteGradingOptions>
}

interface ScopeResolution {
  scope: GradingScope
  expectedGroupIds: Set<string>
  performedGroupIds: Set<string>
  available: boolean
  reliability: NoteGradingReliability
  unavailableReason: string | null
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value
  seen.add(value)
  Object.values(value as Record<string, unknown>).forEach((child) => deepFreeze(child, seen))
  return Object.freeze(value)
}

function isCredibleCorrespondence(step: Extract<GroupAlignment, { kind: 'correspondence' }>, options: NoteGradingOptions): boolean {
  if (step.attacks.pairs.length > 0) return true
  return step.expectedGroup.pitches.some((expectedMidi) => step.performedGroup.pitches.some((performedMidi) => {
    const distance = Math.abs(expectedMidi - performedMidi)
    return distance <= options.wrongPitchMaxSemitones || (options.allowWrongOctave && distance === options.wrongOctaveSemitones)
  }))
}

function boundsScope(alignment: AlignmentResult, options: NoteGradingOptions): GradingScope {
  const type = options.gradingScope
  const expectedIndex = new Map(alignment.expectedGroups.map((group, index) => [group.id, index]))
  const performedIndex = new Map(alignment.performedGroups.map((group, index) => [group.id, index]))
  if (type === 'full-plan') {
    const expectedEndIndex = alignment.expectedGroups.length ? alignment.expectedGroups.length - 1 : null
    const performedEndIndex = alignment.performedGroups.length ? alignment.performedGroups.length - 1 : null
    return {
      type,
      expectedStartIndex: expectedEndIndex === null ? null : 0,
      expectedEndIndex,
      performedStartIndex: performedEndIndex === null ? null : 0,
      performedEndIndex,
      expectedStartGroupId: alignment.expectedGroups[0]?.id ?? null,
      expectedEndGroupId: expectedEndIndex === null ? null : alignment.expectedGroups[expectedEndIndex]!.id,
      performedStartGroupId: alignment.performedGroups[0]?.id ?? null,
      performedEndGroupId: performedEndIndex === null ? null : alignment.performedGroups[performedEndIndex]!.id,
      outsideScopeExpectedGroupCount: 0,
      outsideScopePerformedGroupCount: 0,
    }
  }
  const correspondences = alignment.groupAlignments.filter((step): step is Extract<GroupAlignment, { kind: 'correspondence' }> => step.kind === 'correspondence' && isCredibleCorrespondence(step, options))
  const expectedIndices = correspondences.map((step) => expectedIndex.get(step.expectedGroup.id)).filter((index) => index !== undefined)
  const performedIndices = correspondences.map((step) => performedIndex.get(step.performedGroup.id)).filter((index) => index !== undefined)
  const expectedStartIndex = expectedIndices.length ? Math.min(...expectedIndices) : null
  const expectedEndIndex = expectedIndices.length ? Math.max(...expectedIndices) : null
  const performedStartIndex = performedIndices.length ? Math.min(...performedIndices) : null
  const performedEndIndex = performedIndices.length ? Math.max(...performedIndices) : null
  const expectedSpanCount = expectedStartIndex === null || expectedEndIndex === null ? 0 : expectedEndIndex - expectedStartIndex + 1
  const performedSpanCount = performedStartIndex === null || performedEndIndex === null ? 0 : performedEndIndex - performedStartIndex + 1
  return {
    type,
    expectedStartIndex,
    expectedEndIndex,
    performedStartIndex,
    performedEndIndex,
    expectedStartGroupId: expectedStartIndex === null ? null : alignment.expectedGroups[expectedStartIndex]!.id,
    expectedEndGroupId: expectedEndIndex === null ? null : alignment.expectedGroups[expectedEndIndex]!.id,
    performedStartGroupId: performedStartIndex === null ? null : alignment.performedGroups[performedStartIndex]!.id,
    performedEndGroupId: performedEndIndex === null ? null : alignment.performedGroups[performedEndIndex]!.id,
    outsideScopeExpectedGroupCount: alignment.expectedGroups.length - expectedSpanCount,
    outsideScopePerformedGroupCount: alignment.performedGroups.length - performedSpanCount,
  }
}

function resolveScope(alignment: AlignmentResult, options: NoteGradingOptions, inputMatches: boolean): ScopeResolution {
  const scope = boundsScope(alignment, options)
  const expectedGroupIds = new Set<string>()
  const performedGroupIds = new Set<string>()
  if (scope.expectedStartIndex !== null && scope.expectedEndIndex !== null) {
    for (let index = scope.expectedStartIndex; index <= scope.expectedEndIndex; index += 1) expectedGroupIds.add(alignment.expectedGroups[index]!.id)
  }
  if (scope.performedStartIndex !== null && scope.performedEndIndex !== null) {
    for (let index = scope.performedStartIndex; index <= scope.performedEndIndex; index += 1) performedGroupIds.add(alignment.performedGroups[index]!.id)
  }
  if (!inputMatches) return { scope, expectedGroupIds: new Set(), performedGroupIds: new Set(), available: false, reliability: 'unavailable', unavailableReason: 'The plan, recording, and alignment identities do not describe the same analysis inputs.' }
  if (alignment.status === 'failed') return { scope, expectedGroupIds: new Set(), performedGroupIds: new Set(), available: false, reliability: 'unavailable', unavailableReason: 'The alignment failed its safety guardrails, so note grading is unavailable.' }
  if (options.gradingScope === 'aligned-span' && (alignment.status === 'insufficient-data' || scope.expectedStartIndex === null || scope.performedStartIndex === null)) {
    return { scope, expectedGroupIds: new Set(), performedGroupIds: new Set(), available: false, reliability: 'unavailable', unavailableReason: 'No credible aligned section could be identified for played-section grading.' }
  }
  const reliability: NoteGradingReliability = alignment.status === 'aligned' ? 'reliable' : 'provisional'
  return { scope, expectedGroupIds, performedGroupIds, available: true, reliability, unavailableReason: null }
}

function targetResultId(alignmentId: string, targetId: string): string {
  return `note-target-result:${stableHash(`${alignmentId}|${targetId}`)}`
}

function performedResultBase(alignmentId: string, attack: PerformedAttack, group: PerformedOnsetGroup, groupAlignmentId: string | null) {
  return {
    id: `note-performed-result:${stableHash(`${alignmentId}|${attack.id}`)}`,
    performedAttackId: attack.id,
    performedGroupId: group.id,
    groupAlignmentId,
    midi: attack.midi,
    sequence: attack.sequence,
    attackMs: attack.attackMs,
  }
}

function expectedResultBase(alignmentId: string, target: ExpectedKeyTarget, groupAlignmentId: string | null) {
  return { id: targetResultId(alignmentId, target.id), target, groupAlignmentId }
}

function classifyGroup(expected: readonly ExpectedTargetResult[], performed: readonly PerformedAttackResult[]): GroupNoteClassification {
  const correct = expected.filter((result) => result.kind === 'correct').length
  const wrongPitch = expected.filter((result) => result.kind === 'wrong-pitch').length
  const missed = expected.filter((result) => result.kind === 'missed').length
  const additional = performed.filter((result) => result.kind === 'additional').length
  const gradeable = correct + wrongPitch + missed
  if (expected.some((result) => result.kind === 'unattempted') || performed.some((result) => result.kind === 'outside-scope' && result.reason === 'outside-grading-scope')) return 'outside-scope'
  if (gradeable === 0 && additional === 0 && expected.some((result) => result.kind === 'excluded')) return 'excluded-group'
  if (gradeable === 0 && additional > 0) return 'additional-group'
  if (correct === gradeable && wrongPitch === 0 && missed === 0 && additional === 0) return 'perfect'
  if (correct === 0 && wrongPitch > 0 && missed === 0 && additional === 0) return 'wrong-only'
  if (correct === 0 && wrongPitch === 0 && missed > 0 && additional === 0) return 'missed-group'
  return 'partial'
}

function groupResult(step: GroupAlignment, expected: readonly ExpectedTargetResult[], performed: readonly PerformedAttackResult[]): GroupNoteResult {
  const expectedGroup = step.kind === 'performed-only' ? null : step.expectedGroup
  const performedGroup = step.kind === 'expected-only' ? null : step.performedGroup
  return {
    id: `note-group-result:${stableHash(step.id)}`,
    groupAlignmentId: step.id,
    classification: classifyGroup(expected, performed),
    expectedGroupId: expectedGroup?.id ?? null,
    performedGroupId: performedGroup?.id ?? null,
    scorePosition: expectedGroup ? { ...expectedGroup.position } : null,
    measureIndices: expectedGroup ? [...expectedGroup.measureIndices] : [],
    measureNumbers: expectedGroup ? [...expectedGroup.measureNumbers] : [],
    expectedTargetIds: expected.map((result) => result.target.id),
    performedAttackIds: performed.map((result) => result.performedAttackId),
    expectedResultIds: expected.map((result) => result.id),
    performedResultIds: performed.map((result) => result.id),
    counts: {
      correct: expected.filter((result) => result.kind === 'correct').length,
      wrongPitch: expected.filter((result) => result.kind === 'wrong-pitch').length,
      missed: expected.filter((result) => result.kind === 'missed').length,
      additional: performed.filter((result) => result.kind === 'additional').length,
    },
  }
}

export function gradeNotes({ expectedPlan, recording, alignment, options: partialOptions = {} }: GradeNotesInput): NoteGradingResult {
  const options = resolveNoteGradingOptions(partialOptions)
  const derived = deriveExpectedKeyTargets(expectedPlan, options)
  const targetsByGroup = new Map<string, ExpectedKeyTarget[]>()
  for (const target of derived.targets) {
    const group = targetsByGroup.get(target.onsetGroupId)
    if (group) group.push(target)
    else targetsByGroup.set(target.onsetGroupId, [target])
  }
  const inputMatches = alignment.expectedPlanId === expectedPlan.id && alignment.recordingId === recording.id
  let scopeResolution = resolveScope(alignment, options, inputMatches)
  const inScopeGradeableTargetCount = derived.targets.filter((target) => target.eligibility === 'gradeable' && scopeResolution.expectedGroupIds.has(target.onsetGroupId)).length
  if (scopeResolution.available && inScopeGradeableTargetCount === 0) {
    scopeResolution = { ...scopeResolution, expectedGroupIds: new Set(), performedGroupIds: new Set(), available: false, reliability: 'unavailable', unavailableReason: 'The selected grading scope contains no gradeable physical key targets.' }
  }

  const warnings: NoteGradingWarning[] = []
  if (!inputMatches) warnings.push({ code: 'INPUT_ID_MISMATCH', severity: 'warning', message: 'Expected plan, recording, and alignment IDs do not match; no grading semantics were inferred.' })
  if (!scopeResolution.available) warnings.push({ code: scopeResolution.unavailableReason?.includes('gradeable') ? 'NO_GRADEABLE_TARGETS' : 'ALIGNMENT_UNAVAILABLE', severity: 'warning', message: scopeResolution.unavailableReason ?? 'Note grading is unavailable.' })
  else if (scopeResolution.reliability === 'provisional') warnings.push({ code: 'PROVISIONAL_ALIGNMENT', severity: 'warning', message: 'Note results are provisional because the underlying alignment was ambiguous or structurally incomplete.' })
  if (derived.exclusions.length > 0 || derived.targets.some((target) => target.eligibility === 'excluded')) warnings.push({ code: 'EXPECTED_EVENTS_EXCLUDED', severity: 'info', message: 'Grace, cue, unsupported, or outside-standard-range expectations were preserved but excluded from the note-score denominator.' })

  const expectedResults: ExpectedTargetResult[] = []
  const performedResults: PerformedAttackResult[] = []
  const wrongPitchCorrespondences: WrongPitchCorrespondence[] = []
  const groupResults: GroupNoteResult[] = []
  const resolvedTargetIds = new Set<string>()
  const resolvedAttackIds = new Set<string>()
  let pairingGuardrailGroupCount = 0

  for (const step of alignment.groupAlignments) {
    const stepExpectedResults: ExpectedTargetResult[] = []
    const stepPerformedResults: PerformedAttackResult[] = []
    const expectedGroup = step.kind === 'performed-only' ? null : step.expectedGroup
    const performedGroup = step.kind === 'expected-only' ? null : step.performedGroup
    const targets = expectedGroup ? targetsByGroup.get(expectedGroup.id) ?? [] : []
    const expectedInScope = expectedGroup !== null && scopeResolution.available && scopeResolution.expectedGroupIds.has(expectedGroup.id)
    const performedInScope = performedGroup !== null && scopeResolution.available && scopeResolution.performedGroupIds.has(performedGroup.id)

    for (const target of targets) {
      if (target.eligibility === 'excluded') {
        const result: ExpectedTargetResult = { ...expectedResultBase(alignment.id, target, step.id), kind: 'excluded', reason: target.exclusionReason! }
        stepExpectedResults.push(result); expectedResults.push(result); resolvedTargetIds.add(target.id)
      } else if (!expectedInScope) {
        const result: ExpectedTargetResult = { ...expectedResultBase(alignment.id, target, step.id), kind: 'unattempted', reason: 'outside-grading-scope' }
        stepExpectedResults.push(result); expectedResults.push(result); resolvedTargetIds.add(target.id)
      }
    }

    if (step.kind === 'correspondence' && expectedInScope && performedInScope) {
      const targetByAttackId = new Map<string, ExpectedKeyTarget>()
      for (const target of targets) for (const attackId of target.sourceExpectedAttackIds) targetByAttackId.set(attackId, target)
      const performedById = new Map(step.performedGroup.attacks.map((attack) => [attack.id, attack]))
      const satisfiedTargetIds = new Set<string>()

      for (const pair of step.attacks.pairs) {
        const target = targetByAttackId.get(pair.expectedAttackId)
        const attack = performedById.get(pair.performedAttackId)
        if (!target || !attack || resolvedAttackIds.has(attack.id)) continue
        if (target.eligibility === 'excluded') {
          const result: PerformedAttackResult = { ...performedResultBase(alignment.id, attack, step.performedGroup, step.id), kind: 'outside-scope', reason: 'matched-excluded-target' }
          stepPerformedResults.push(result); performedResults.push(result); resolvedAttackIds.add(attack.id)
        } else if (!satisfiedTargetIds.has(target.id) && !resolvedTargetIds.has(target.id)) {
          const expectedResult: ExpectedTargetResult = { ...expectedResultBase(alignment.id, target, step.id), kind: 'correct', performedAttackId: attack.id }
          const performedResult: PerformedAttackResult = { ...performedResultBase(alignment.id, attack, step.performedGroup, step.id), kind: 'correct', expectedTargetId: target.id }
          stepExpectedResults.push(expectedResult); expectedResults.push(expectedResult); resolvedTargetIds.add(target.id); satisfiedTargetIds.add(target.id)
          stepPerformedResults.push(performedResult); performedResults.push(performedResult); resolvedAttackIds.add(attack.id)
        }
      }

      const remainingTargets = targets.filter((target) => target.eligibility === 'gradeable' && !resolvedTargetIds.has(target.id))
      const remainingAttacks = step.performedGroup.attacks.filter((attack) => !resolvedAttackIds.has(attack.id))
      const assignment = assignWrongPitches(remainingTargets, remainingAttacks, options)
      if (assignment.guarded) {
        pairingGuardrailGroupCount += 1
        warnings.push({ code: 'WRONG_PITCH_PAIRING_GUARDRAIL', severity: 'warning', groupAlignmentId: step.id, message: 'This onset exceeded the conservative substitution-assignment size limit; leftovers remain missed and additional.' })
      }
      if (assignment.ambiguous && assignment.pairs.length > 0) warnings.push({ code: 'WRONG_PITCH_PAIRING_AMBIGUOUS', severity: 'info', groupAlignmentId: step.id, message: 'Multiple minimum-distance wrong-pitch assignments were equally plausible; deterministic ordering was used and confidence is marked ambiguous.' })
      for (const pair of assignment.pairs) {
        const target = remainingTargets.find((candidate) => candidate.id === pair.targetId)!
        const attack = remainingAttacks.find((candidate) => candidate.id === pair.attackId)!
        const octaveDisplacement = pair.absoluteSemitoneDistance === options.wrongOctaveSemitones ? pair.semitoneDelta / options.wrongOctaveSemitones : null
        const confidence = assignment.ambiguous ? 'ambiguous' as const : 'likely' as const
        const expectedResult: ExpectedTargetResult = { ...expectedResultBase(alignment.id, target, step.id), kind: 'wrong-pitch', performedAttackId: attack.id, performedMidi: attack.midi, semitoneDelta: pair.semitoneDelta, absoluteSemitoneDistance: pair.absoluteSemitoneDistance, octaveDisplacement, confidence, pairingMethod: 'minimum-total-distance' }
        const performedResult: PerformedAttackResult = { ...performedResultBase(alignment.id, attack, step.performedGroup, step.id), kind: 'wrong-pitch', expectedTargetId: target.id, expectedMidi: target.midi, semitoneDelta: pair.semitoneDelta, absoluteSemitoneDistance: pair.absoluteSemitoneDistance, octaveDisplacement, confidence }
        const correspondence: WrongPitchCorrespondence = { id: `wrong-pitch:${stableHash(`${alignment.id}|${target.id}|${attack.id}`)}`, expectedTargetId: target.id, performedAttackId: attack.id, expectedMidi: target.midi, performedMidi: attack.midi, semitoneDelta: pair.semitoneDelta, absoluteSemitoneDistance: pair.absoluteSemitoneDistance, octaveDisplacement, groupAlignmentId: step.id, confidence, pairingMethod: 'minimum-total-distance' }
        stepExpectedResults.push(expectedResult); expectedResults.push(expectedResult); resolvedTargetIds.add(target.id)
        stepPerformedResults.push(performedResult); performedResults.push(performedResult); resolvedAttackIds.add(attack.id)
        wrongPitchCorrespondences.push(correspondence)
      }
      for (const target of remainingTargets.filter((target) => !resolvedTargetIds.has(target.id))) {
        const result: ExpectedTargetResult = { ...expectedResultBase(alignment.id, target, step.id), kind: 'missed' }
        stepExpectedResults.push(result); expectedResults.push(result); resolvedTargetIds.add(target.id)
      }
      for (const attack of remainingAttacks.filter((attack) => !resolvedAttackIds.has(attack.id))) {
        const result: PerformedAttackResult = { ...performedResultBase(alignment.id, attack, step.performedGroup, step.id), kind: 'additional' }
        stepPerformedResults.push(result); performedResults.push(result); resolvedAttackIds.add(attack.id)
      }
    } else {
      for (const target of targets.filter((target) => target.eligibility === 'gradeable' && !resolvedTargetIds.has(target.id))) {
        const result: ExpectedTargetResult = expectedInScope
          ? { ...expectedResultBase(alignment.id, target, step.id), kind: 'missed' }
          : { ...expectedResultBase(alignment.id, target, step.id), kind: 'unattempted', reason: 'outside-grading-scope' }
        stepExpectedResults.push(result); expectedResults.push(result); resolvedTargetIds.add(target.id)
      }
      if (performedGroup) for (const attack of performedGroup.attacks.filter((candidate) => !resolvedAttackIds.has(candidate.id))) {
        const result: PerformedAttackResult = performedInScope
          ? { ...performedResultBase(alignment.id, attack, performedGroup, step.id), kind: 'additional' }
          : { ...performedResultBase(alignment.id, attack, performedGroup, step.id), kind: 'outside-scope', reason: 'outside-grading-scope' }
        stepPerformedResults.push(result); performedResults.push(result); resolvedAttackIds.add(attack.id)
      }
    }
    groupResults.push(groupResult(step, stepExpectedResults, stepPerformedResults))
  }

  for (const target of derived.targets.filter((candidate) => !resolvedTargetIds.has(candidate.id))) {
    const result: ExpectedTargetResult = target.eligibility === 'excluded'
      ? { ...expectedResultBase(alignment.id, target, null), kind: 'excluded', reason: target.exclusionReason! }
      : scopeResolution.available && scopeResolution.expectedGroupIds.has(target.onsetGroupId)
        ? { ...expectedResultBase(alignment.id, target, null), kind: 'missed' }
        : { ...expectedResultBase(alignment.id, target, null), kind: 'unattempted', reason: 'outside-grading-scope' }
    expectedResults.push(result)
  }
  for (const group of alignment.performedGroups) for (const attack of group.attacks.filter((candidate) => !resolvedAttackIds.has(candidate.id))) {
    const result: PerformedAttackResult = scopeResolution.available && scopeResolution.performedGroupIds.has(group.id)
      ? { ...performedResultBase(alignment.id, attack, group, null), kind: 'additional' }
      : { ...performedResultBase(alignment.id, attack, group, null), kind: 'outside-scope', reason: 'outside-grading-scope' }
    performedResults.push(result)
  }

  const counts: NoteGradingCounts = {
    correct: expectedResults.filter((result) => result.kind === 'correct').length,
    wrongPitch: expectedResults.filter((result) => result.kind === 'wrong-pitch').length,
    missed: expectedResults.filter((result) => result.kind === 'missed').length,
    additional: performedResults.filter((result) => result.kind === 'additional').length,
    gradeableExpectedTargets: expectedResults.filter((result) => result.kind === 'correct' || result.kind === 'wrong-pitch' || result.kind === 'missed').length,
    gradedPerformedAttacks: performedResults.filter((result) => result.kind === 'correct' || result.kind === 'wrong-pitch' || result.kind === 'additional').length,
    excludedExpectedTargets: expectedResults.filter((result) => result.kind === 'excluded').length,
    outsideScopeExpectedTargets: expectedResults.filter((result) => result.kind === 'unattempted').length,
    outsideScopePerformedAttacks: performedResults.filter((result) => result.kind === 'outside-scope').length,
    excludedFlexibleEvents: derived.exclusions.length,
  }
  const status = scopeResolution.available && counts.gradeableExpectedTargets > 0 ? 'ready' as const : 'unavailable' as const
  const metrics = calculateNoteMetrics(counts, status === 'ready')
  const result: NoteGradingResult = {
    id: `note-grading:${stableHash(JSON.stringify({ expectedPlanId: expectedPlan.id, recordingId: recording.id, alignmentId: alignment.id, version: NOTE_GRADING_ENGINE_VERSION, options }))}`,
    status,
    reliability: status === 'ready' ? scopeResolution.reliability : 'unavailable',
    unavailableReason: status === 'ready' ? null : scopeResolution.unavailableReason ?? 'The selected scope contains no gradeable expected key targets.',
    expectedPlanId: expectedPlan.id,
    recordingId: recording.id,
    alignmentId: alignment.id,
    scope: scopeResolution.scope,
    expectedTargets: derived.targets,
    expectedExclusions: derived.exclusions,
    expectedResults,
    performedResults,
    wrongPitchCorrespondences,
    groupResults,
    counts,
    metrics,
    diagnostics: {
      noteGradingEngineVersion: NOTE_GRADING_ENGINE_VERSION,
      alignmentEngineVersion: alignment.diagnostics.alignmentEngineVersion,
      expectedKeyTargetCount: derived.targets.length,
      gradeableTargetCount: derived.targets.filter((target) => target.eligibility === 'gradeable').length,
      excludedTargetCount: derived.targets.filter((target) => target.eligibility === 'excluded').length,
      flexibleExclusionCount: derived.exclusions.length,
      groupResultCount: groupResults.length,
      ambiguousWrongPitchCount: wrongPitchCorrespondences.filter((correspondence) => correspondence.confidence === 'ambiguous').length,
      pairingGuardrailGroupCount,
    },
    warnings,
  }
  return deepFreeze(result)
}
