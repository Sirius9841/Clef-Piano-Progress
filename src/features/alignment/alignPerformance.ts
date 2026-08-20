import { comparePitchMultisets, pairGroupAttacks } from './costs'
import { deriveExpectedAlignmentGroups } from './expectedGroups'
import { ALIGNMENT_ENGINE_VERSION, resolveAlignmentOptions, type AlignmentOptions } from './options'
import { clusterPerformedOnsets, derivePerformedAttacks } from './performedGroups'
import { alignGroupSequences, type SequenceAlignmentResult } from './sequenceAlignment'
import { fitTimeTransform, type TimeFitAnchor } from './timeFit'
import type { ExpectedPerformancePlan } from '../expected-performance/types'
import type { PerformanceRecording } from '../performance/types'
import type {
  AlignmentDiagnostics,
  AlignmentResult,
  AlignmentStatus,
  AlignmentTimeTransform,
  AlignmentWarning,
  ExpectedAlignmentGroup,
  GroupAlignment,
  PerformedOnsetGroup,
} from './types'

function stableHash(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const ordered = [...values].sort((left, right) => left - right)
  const middle = Math.floor(ordered.length / 2)
  return ordered.length % 2 ? ordered[middle]! : (ordered[middle - 1]! + ordered[middle]!) / 2
}

function alignmentId(planId: string, recordingId: string, speed: number, options: AlignmentOptions): string {
  return `alignment:${stableHash(JSON.stringify({ planId, recordingId, speed, version: ALIGNMENT_ENGINE_VERSION, options }))}`
}

function fallbackTransform(): AlignmentTimeTransform {
  return { offsetMs: 0, scale: 1, source: 'fallback', anchorCount: 0, retainedAnchorCount: 0, offsetFitted: false, scaleFitted: false, scaleClamped: false }
}

function buildGroupAlignments(
  sequence: SequenceAlignmentResult,
  expectedGroups: readonly ExpectedAlignmentGroup[],
  performedGroups: readonly PerformedOnsetGroup[],
  transform: AlignmentTimeTransform,
): GroupAlignment[] {
  return sequence.steps.map((step, index) => {
    if (step.kind === 'expected-only') {
      const expectedGroup = expectedGroups[step.expectedIndex!]!
      return { id: `alignment-step:${index}:expected:${expectedGroup.id}`, kind: 'expected-only', expectedGroup }
    }
    if (step.kind === 'performed-only') {
      const performedGroup = performedGroups[step.performedIndex!]!
      return { id: `alignment-step:${index}:performed:${performedGroup.id}`, kind: 'performed-only', performedGroup }
    }
    const expectedGroup = expectedGroups[step.expectedIndex!]!
    const performedGroup = performedGroups[step.performedIndex!]!
    const predictedPerformedMs = transform.offsetMs + transform.scale * expectedGroup.referenceMs
    return {
      id: `alignment-step:${index}:pair:${expectedGroup.id}:${performedGroup.id}`,
      kind: 'correspondence',
      expectedGroup,
      performedGroup,
      predictedPerformedMs,
      timingResidualMs: performedGroup.representativeMs - predictedPerformedMs,
      attacks: pairGroupAttacks(expectedGroup, performedGroup),
      cost: step.cost!,
    }
  })
}

function timeAnchors(
  sequence: SequenceAlignmentResult,
  expectedGroups: readonly ExpectedAlignmentGroup[],
  performedGroups: readonly PerformedOnsetGroup[],
  options: AlignmentOptions,
): TimeFitAnchor[] {
  const anchors: TimeFitAnchor[] = []
  for (const step of sequence.steps) {
    if (step.kind !== 'correspondence') continue
    const expected = expectedGroups[step.expectedIndex!]!
    const performed = performedGroups[step.performedIndex!]!
    const pitch = comparePitchMultisets(expected.pitches, performed.pitches, options)
    if (pitch.exactPitchCount > 0 || pitch.cost < options.expectedSkipCost + options.performedSkipCost) anchors.push({ referenceMs: expected.referenceMs, performedMs: performed.representativeMs })
  }
  return anchors
}

function diagnostics(
  expectedGroups: readonly ExpectedAlignmentGroup[],
  performedGroups: readonly PerformedOnsetGroup[],
  alignments: readonly GroupAlignment[],
  transform: AlignmentTimeTransform,
  coarseCost: number,
  finalCost: number,
  matrixCellCount: number,
): AlignmentDiagnostics {
  const correspondences = alignments.filter((alignment) => alignment.kind === 'correspondence')
  const absoluteResiduals = correspondences.map((alignment) => Math.abs(alignment.timingResidualMs))
  return {
    alignmentEngineVersion: ALIGNMENT_ENGINE_VERSION,
    expectedGroupCount: expectedGroups.length,
    performedGroupCount: performedGroups.length,
    groupCorrespondenceCount: correspondences.length,
    expectedOnlyGroupCount: alignments.filter((alignment) => alignment.kind === 'expected-only').length,
    performedOnlyGroupCount: alignments.filter((alignment) => alignment.kind === 'performed-only').length,
    exactPitchPairCount: correspondences.reduce((total, alignment) => total + alignment.attacks.pairs.length, 0),
    coarseAlignmentCost: coarseCost,
    finalAlignmentCost: finalCost,
    fitAnchorCount: transform.anchorCount,
    retainedFitAnchorCount: transform.retainedAnchorCount,
    medianAbsoluteTimingResidualMs: median(absoluteResiduals),
    maximumAbsoluteTimingResidualMs: absoluteResiduals.length ? Math.max(...absoluteResiduals) : null,
    maximumPerformedGroupSpreadMs: performedGroups.length ? Math.max(...performedGroups.map((group) => group.spreadMs)) : 0,
    matrixCellCount,
  }
}

function freezeResult(result: AlignmentResult): AlignmentResult {
  for (const group of result.expectedGroups) {
    group.attacks.forEach((attack) => { Object.freeze(attack.sourceNoteIds); Object.freeze(attack.pitch); Object.freeze(attack.onset); Object.freeze(attack.expectedDuration); Object.freeze(attack) })
    Object.freeze(group.attacks); Object.freeze(group.attackIds); Object.freeze(group.pitches); Object.freeze(group.measureIndices); Object.freeze(group.measureNumbers); Object.freeze(group.position); Object.freeze(group)
  }
  for (const group of result.performedGroups) { group.attacks.forEach(Object.freeze); Object.freeze(group.attacks); Object.freeze(group.pitches); Object.freeze(group) }
  for (const step of result.groupAlignments) {
    if (step.kind === 'correspondence') { step.attacks.pairs.forEach(Object.freeze); Object.freeze(step.attacks.pairs); Object.freeze(step.attacks.unpairedExpectedAttackIds); Object.freeze(step.attacks.unpairedPerformedAttackIds); Object.freeze(step.attacks); Object.freeze(step.cost) }
    Object.freeze(step)
  }
  result.warnings.forEach(Object.freeze)
  Object.freeze(result.expectedGroups); Object.freeze(result.performedGroups); Object.freeze(result.groupAlignments); Object.freeze(result.unmatchedExpectedGroupIds); Object.freeze(result.unmatchedPerformedGroupIds); Object.freeze(result.timeTransform); Object.freeze(result.diagnostics); Object.freeze(result.warnings)
  return Object.freeze(result)
}

function finishResult(
  plan: ExpectedPerformancePlan,
  recording: PerformanceRecording,
  speed: number,
  options: AlignmentOptions,
  status: AlignmentStatus,
  expectedGroups: ExpectedAlignmentGroup[],
  performedGroups: PerformedOnsetGroup[],
  alignments: GroupAlignment[],
  transform: AlignmentTimeTransform,
  warnings: AlignmentWarning[],
  coarseCost: number,
  finalCost: number,
  matrixCellCount: number,
): AlignmentResult {
  return freezeResult({
    id: alignmentId(plan.id, recording.id, speed, options),
    status,
    expectedPlanId: plan.id,
    recordingId: recording.id,
    practiceSpeedMultiplier: speed,
    expectedGroups,
    performedGroups,
    groupAlignments: alignments,
    unmatchedExpectedGroupIds: alignments.filter((step) => step.kind === 'expected-only').map((step) => step.expectedGroup.id),
    unmatchedPerformedGroupIds: alignments.filter((step) => step.kind === 'performed-only').map((step) => step.performedGroup.id),
    timeTransform: transform,
    diagnostics: diagnostics(expectedGroups, performedGroups, alignments, transform, coarseCost, finalCost, matrixCellCount),
    warnings,
  })
}

export function alignPerformance(
  plan: ExpectedPerformancePlan,
  recording: PerformanceRecording,
  partialOptions: Partial<AlignmentOptions> = {},
): AlignmentResult {
  const options = resolveAlignmentOptions(partialOptions)
  const speed = options.practiceSpeedMultiplier ?? recording.practiceContext.speedMultiplier ?? 1
  const expected = deriveExpectedAlignmentGroups(plan, speed)
  const performed = clusterPerformedOnsets(recording.id, derivePerformedAttacks(recording), options)
  const warnings = [...expected.warnings, ...performed.warnings]
  if (recording.practiceContext.expectedPerformancePlanId && recording.practiceContext.expectedPerformancePlanId !== plan.id) warnings.push({ code: 'PLAN_CONTEXT_MISMATCH', severity: 'warning', message: 'The recording references a different expected-performance plan. Alignment continues but context reliability is reduced.' })

  if (expected.groups.length === 0 || performed.groups.length === 0) {
    if (expected.groups.length === 0) warnings.push({ code: 'EMPTY_EXPECTED_PLAN', severity: 'warning', message: 'The expected plan contains no fixed required onset groups.' })
    if (performed.groups.length === 0) warnings.push({ code: 'INSUFFICIENT_ATTACKS', severity: 'info', message: 'The recording contains no note attacks to align.' })
    const alignments: GroupAlignment[] = [
      ...expected.groups.map((expectedGroup, index) => ({ id: `alignment-step:${index}:expected:${expectedGroup.id}`, kind: 'expected-only' as const, expectedGroup })),
      ...performed.groups.map((performedGroup, index) => ({ id: `alignment-step:${expected.groups.length + index}:performed:${performedGroup.id}`, kind: 'performed-only' as const, performedGroup })),
    ]
    return finishResult(plan, recording, speed, options, 'insufficient-data', expected.groups, performed.groups, alignments, fallbackTransform(), warnings, 0, 0, (expected.groups.length + 1) * (performed.groups.length + 1))
  }

  const matrixCellCount = (expected.groups.length + 1) * (performed.groups.length + 1)
  if (matrixCellCount > options.maxMatrixCells) {
    warnings.push({ code: 'INPUT_TOO_LARGE', severity: 'warning', message: `Alignment requires ${matrixCellCount} matrix cells, exceeding the explicit ${options.maxMatrixCells} safety limit. No input was truncated.` })
    const alignments: GroupAlignment[] = [
      ...expected.groups.map((expectedGroup, index) => ({ id: `alignment-step:${index}:expected:${expectedGroup.id}`, kind: 'expected-only' as const, expectedGroup })),
      ...performed.groups.map((performedGroup, index) => ({ id: `alignment-step:${expected.groups.length + index}:performed:${performedGroup.id}`, kind: 'performed-only' as const, performedGroup })),
    ]
    return finishResult(plan, recording, speed, options, 'failed', expected.groups, performed.groups, alignments, fallbackTransform(), warnings, 0, 0, matrixCellCount)
  }

  const coarse = alignGroupSequences(expected.groups, performed.groups, options, null)
  const fit = fitTimeTransform(timeAnchors(coarse, expected.groups, performed.groups, options), options)
  warnings.push(...fit.warnings)
  const refined = alignGroupSequences(expected.groups, performed.groups, options, fit.transform)
  const alignments = buildGroupAlignments(refined, expected.groups, performed.groups, fit.transform)
  const resultDiagnostics = diagnostics(expected.groups, performed.groups, alignments, fit.transform, coarse.cost, refined.cost, refined.matrixCellCount)
  let status: AlignmentStatus = resultDiagnostics.groupCorrespondenceCount === 0 ? 'insufficient-data' : resultDiagnostics.exactPitchPairCount === 0 ? 'ambiguous' : 'aligned'
  if (status === 'ambiguous') warnings.push({ code: 'AMBIGUOUS_ALIGNMENT', severity: 'warning', message: 'Group order produced structural correspondences but no exact pitch anchors; the path is deterministic and should be treated cautiously.' })
  if (resultDiagnostics.groupCorrespondenceCount > 0 && (resultDiagnostics.expectedOnlyGroupCount > 0 || resultDiagnostics.performedOnlyGroupCount > 0)) warnings.push({ code: 'PARTIAL_PERFORMANCE', severity: 'info', message: 'The alignment contains neutral expected-only or performed-only groups, consistent with a partial or structurally divergent take.' })
  if (warnings.some((warning) => warning.code === 'PLAN_CONTEXT_MISMATCH') && status === 'aligned') status = 'ambiguous'
  return finishResult(plan, recording, speed, options, status, expected.groups, performed.groups, alignments, fit.transform, warnings, coarse.cost, refined.cost, refined.matrixCellCount)
}
