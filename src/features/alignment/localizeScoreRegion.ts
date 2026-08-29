import { comparePitchMultisets } from './costs'
import { alignGroupSequences, type SequenceAlignmentResult } from './sequenceAlignment'
import type { AlignmentOptions } from './options'
import type {
  ExpectedAlignmentGroup,
  PerformedOnsetGroup,
  ScoreRegionCandidate,
  ScoreRegionLocalization,
  ScoreRegionLocalizationHint,
} from './types'

interface EvaluatedCandidate {
  readonly candidate: ScoreRegionCandidate
  readonly sequence: SequenceAlignmentResult
}

export interface LocalizationResult {
  readonly localization: ScoreRegionLocalization
  readonly selected: EvaluatedCandidate | null
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}

function pitchFingerprint(pitches: readonly number[]): string {
  return [...pitches].sort((left, right) => left - right).join(',')
}

function uniqueSorted(values: readonly number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right)
}

function displayRange(numbers: readonly string[]): string {
  if (numbers.length === 0) return 'Unresolved'
  if (numbers.length === 1) return `M${numbers[0]}`
  return `M${numbers[0]}–M${numbers[numbers.length - 1]}`
}

function gapLength(indices: readonly number[], total: number): number {
  if (indices.length === 0) return total
  let longest = indices[0]!
  for (let index = 1; index < indices.length; index += 1) longest = Math.max(longest, indices[index]! - indices[index - 1]! - 1)
  return Math.max(longest, total - indices[indices.length - 1]! - 1)
}

function hintAgreement(
  hint: ScoreRegionLocalizationHint,
  groups: readonly ExpectedAlignmentGroup[],
  startIndex: number,
): ScoreRegionCandidate['hintAgreement'] {
  if (hint.mode === 'auto') return 'none'
  if (hint.mode === 'confirmed') return startIndex === hint.expectedStartIndex ? 'exact' : Math.abs(startIndex - hint.expectedStartIndex) <= 2 ? 'near' : 'none'
  const measureIndex = groups[startIndex]?.measureIndices[0] ?? -1
  const intended = hint.mode === 'beginning' ? 0 : hint.startMeasureIndex
  return measureIndex === intended ? 'exact' : Math.abs(measureIndex - intended) <= 1 ? 'near' : 'none'
}

function evaluateCandidate(
  expectedGroups: readonly ExpectedAlignmentGroup[],
  performedGroups: readonly PerformedOnsetGroup[],
  startIndex: number,
  endIndex: number,
  options: AlignmentOptions,
  hint: ScoreRegionLocalizationHint,
  preserveBounds = false,
): EvaluatedCandidate | null {
  if (startIndex < 0 || endIndex < startIndex || startIndex >= expectedGroups.length) return null
  const boundedEnd = Math.min(endIndex, expectedGroups.length - 1)
  const segment = expectedGroups.slice(startIndex, boundedEnd + 1)
  const sequence = alignGroupSequences(segment, performedGroups, options, null)
  const correspondences = sequence.steps.filter((step) => step.kind === 'correspondence')
  const exact = correspondences.flatMap((step) => {
    const expected = segment[step.expectedIndex!]!
    const performed = performedGroups[step.performedIndex!]!
    const pitch = comparePitchMultisets(expected.pitches, performed.pitches, options)
    return pitch.exactPitchCount > 0 ? [{ expectedIndex: startIndex + step.expectedIndex!, performedIndex: step.performedIndex!, pairCount: pitch.exactPitchCount }] : []
  })
  const exactRuns: typeof exact[] = []
  for (const anchor of exact) {
    const run = exactRuns.at(-1)
    const previous = run?.at(-1)
    if (!run || !previous || Math.abs((anchor.expectedIndex - previous.expectedIndex) - (anchor.performedIndex - previous.performedIndex)) > 1) exactRuns.push([anchor])
    else run.push(anchor)
  }
  const dominantExact = exactRuns.sort((left, right) => right.length - left.length || left[0]!.expectedIndex - right[0]!.expectedIndex)[0] ?? []
  const proposalExact = performedGroups.flatMap((performed, performedIndex) => {
    const expectedIndex = performedIndex + startIndex
    const expected = expectedGroups[expectedIndex]
    if (!expected || pitchFingerprint(expected.pitches) !== pitchFingerprint(performed.pitches)) return []
    return [{ expectedIndex, performedIndex, pairCount: comparePitchMultisets(expected.pitches, performed.pitches, options).exactPitchCount }]
  })
  const structuralExact = proposalExact.length > dominantExact.length ? proposalExact : dominantExact
  const dominantExpectedStart = structuralExact[0]?.expectedIndex
  const dominantExpectedEnd = structuralExact.at(-1)?.expectedIndex
  const dominantPerformedStart = structuralExact[0]?.performedIndex
  const dominantPerformedEnd = structuralExact.at(-1)?.performedIndex
  const credible = correspondences.filter((step) => {
    const expected = segment[step.expectedIndex!]!
    const performed = performedGroups[step.performedIndex!]!
    const pitch = comparePitchMultisets(expected.pitches, performed.pitches, options)
    const globalExpectedIndex = startIndex + step.expectedIndex!
    const insideDominantRun = dominantExpectedStart === undefined || (globalExpectedIndex >= dominantExpectedStart && globalExpectedIndex <= dominantExpectedEnd! && step.performedIndex! >= dominantPerformedStart! && step.performedIndex! <= dominantPerformedEnd!)
    return insideDominantRun && (pitch.exactPitchCount > 0 || pitch.cost < options.expectedSkipCost + options.performedSkipCost)
  })
  if (credible.length === 0) return null
  const credibleExpected = credible.map((step) => startIndex + step.expectedIndex!)
  const crediblePerformed = credible.map((step) => step.performedIndex!)
  const resolvedStart = preserveBounds ? startIndex : structuralExact.length ? Math.min(...structuralExact.map((anchor) => anchor.expectedIndex)) : Math.min(...credibleExpected)
  const resolvedEnd = preserveBounds ? boundedEnd : structuralExact.length ? Math.max(...structuralExact.map((anchor) => anchor.expectedIndex)) : Math.max(...credibleExpected)
  const performedStart = preserveBounds ? 0 : structuralExact.length ? Math.min(...structuralExact.map((anchor) => anchor.performedIndex)) : Math.min(...crediblePerformed)
  const performedEnd = preserveBounds ? performedGroups.length - 1 : structuralExact.length ? Math.max(...structuralExact.map((anchor) => anchor.performedIndex)) : Math.max(...crediblePerformed)
  const measureIndices = uniqueSorted(expectedGroups.slice(resolvedStart, resolvedEnd + 1).flatMap((group) => group.measureIndices))
  const measureNumbers = [...new Set(expectedGroups.slice(resolvedStart, resolvedEnd + 1).flatMap((group) => group.measureNumbers))]
  const exactPerformedIndices = uniqueSorted(structuralExact.map((anchor) => anchor.performedIndex))
  const exactAnchorCount = exactPerformedIndices.length
  const exactPitchPairCount = structuralExact.reduce((sum, anchor) => sum + anchor.pairCount, 0)
  const expectedSpanCount = resolvedEnd - resolvedStart + 1
  const performedSpanCount = Math.max(1, performedEnd - performedStart + 1)
  const exactPitchAnchorDensity = exactAnchorCount / Math.max(1, Math.min(expectedSpanCount, performedSpanCount))
  const correspondenceDensity = credible.length / Math.max(1, Math.max(expectedSpanCount, performedSpanCount))
  const performedCoverage = credible.length / Math.max(1, performedGroups.length)
  const longestUnsupportedGap = gapLength(exactPerformedIndices, performedGroups.length)
  const normalizedPitchCost = sequence.cost / Math.max(1, expectedSpanCount + performedGroups.length)
  const gapPenalty = Math.min(1, longestUnsupportedGap / Math.max(1, performedGroups.length))
  const quality = clamp(
    exactPitchAnchorDensity * 0.46
      + correspondenceDensity * 0.22
      + performedCoverage * 0.2
      + (1 - Math.min(1, normalizedPitchCost / 1.25)) * 0.12
      - gapPenalty * 0.12,
    0,
    1,
  )
  const candidate: ScoreRegionCandidate = {
    id: `score-region:${stableHash(`${resolvedStart}|${resolvedEnd}|${performedStart}|${performedEnd}`)}`,
    expectedStartIndex: resolvedStart,
    expectedEndIndex: resolvedEnd,
    expectedStartGroupId: expectedGroups[resolvedStart]!.id,
    expectedEndGroupId: expectedGroups[resolvedEnd]!.id,
    performedStartIndex: performedStart,
    performedEndIndex: performedEnd,
    measureIndices,
    measureNumbers,
    displayRange: displayRange(measureNumbers),
    hintAgreement: hintAgreement(hint, expectedGroups, resolvedStart),
    evidence: {
      normalizedPitchCost,
      exactPitchAnchorCount: exactAnchorCount,
      exactPitchPairCount,
      exactPitchAnchorDensity,
      correspondenceCount: credible.length,
      correspondenceDensity,
      performedCoverage,
      longestUnsupportedGap,
      quality,
    },
  }
  return { candidate, sequence }
}

function proposalStarts(
  expectedGroups: readonly ExpectedAlignmentGroup[],
  performedGroups: readonly PerformedOnsetGroup[],
  hint: ScoreRegionLocalizationHint,
): number[] {
  const expectedByPitch = new Map<string, number[]>()
  expectedGroups.forEach((group, index) => {
    const key = pitchFingerprint(group.pitches)
    const indexes = expectedByPitch.get(key)
    if (indexes) indexes.push(index)
    else expectedByPitch.set(key, [index])
  })
  const votes = new Map<number, number>()
  performedGroups.forEach((group, performedIndex) => {
    for (const expectedIndex of expectedByPitch.get(pitchFingerprint(group.pitches)) ?? []) {
      const offset = expectedIndex - performedIndex
      votes.set(offset, (votes.get(offset) ?? 0) + 1)
    }
  })
  const starts = [...votes.entries()]
    .sort(([leftOffset, leftVotes], [rightOffset, rightVotes]) => rightVotes - leftVotes || leftOffset - rightOffset)
    .slice(0, 32)
    .map(([offset]) => clamp(offset, 0, Math.max(0, expectedGroups.length - 1)))
  if (hint.mode === 'beginning') starts.unshift(0)
  if (hint.mode === 'section') {
    const hinted = expectedGroups.findIndex((group) => group.measureIndices.includes(hint.startMeasureIndex))
    if (hinted >= 0) starts.unshift(hinted)
  }
  return uniqueSorted(starts.length ? starts : [0])
}

function overlapRatio(left: ScoreRegionCandidate, right: ScoreRegionCandidate): number {
  const overlap = Math.max(0, Math.min(left.expectedEndIndex, right.expectedEndIndex) - Math.max(left.expectedStartIndex, right.expectedStartIndex) + 1)
  return overlap / Math.max(1, Math.min(left.expectedEndIndex - left.expectedStartIndex + 1, right.expectedEndIndex - right.expectedStartIndex + 1))
}

function resolvedTakeRegion(candidate: ScoreRegionCandidate, performed: readonly PerformedOnsetGroup[], confidence: 'confident' | 'limited') {
  return {
    expectedStartIndex: candidate.expectedStartIndex,
    expectedEndIndex: candidate.expectedEndIndex,
    expectedStartGroupId: candidate.expectedStartGroupId,
    expectedEndGroupId: candidate.expectedEndGroupId,
    performedStartIndex: candidate.performedStartIndex,
    performedEndIndex: candidate.performedEndIndex,
    performedStartGroupId: performed[candidate.performedStartIndex]!.id,
    performedEndGroupId: performed[candidate.performedEndIndex]!.id,
    measureIndices: [...candidate.measureIndices],
    measureNumbers: [...candidate.measureNumbers],
    displayRange: candidate.displayRange,
    confidence,
  } as const
}

export function localizeScoreRegion(
  expectedGroups: readonly ExpectedAlignmentGroup[],
  performedGroups: readonly PerformedOnsetGroup[],
  options: AlignmentOptions,
): LocalizationResult {
  const hint = options.localizationHint
  if (expectedGroups.length === 0 || performedGroups.length === 0) {
    return {
      selected: null,
      localization: {
        status: 'insufficient-data', resolution: 'unresolved', intendedStart: hint, selectedCandidateId: null, candidates: [], bestVsSecondQualitySeparation: null, takeRegion: null,
        explanation: 'At least one expected and performed onset group is needed to begin score-region localization.',
      },
    }
  }

  if (hint.mode === 'confirmed') {
    const confirmed = evaluateCandidate(expectedGroups, performedGroups, hint.expectedStartIndex, hint.expectedEndIndex, options, hint, true)
    if (!confirmed) {
      return { selected: null, localization: { status: 'divergent', resolution: 'unresolved', intendedStart: hint, selectedCandidateId: null, candidates: [], bestVsSecondQualitySeparation: null, takeRegion: null, explanation: 'The confirmed score region has no credible correspondence with this take.' } }
    }
    const confidence = confirmed.candidate.evidence.exactPitchAnchorDensity >= 0.6 ? 'confident' : 'limited'
    return {
      selected: confirmed,
      localization: {
        status: confidence, resolution: 'user-confirmed', intendedStart: hint, selectedCandidateId: confirmed.candidate.id, candidates: [confirmed.candidate], bestVsSecondQualitySeparation: null,
        takeRegion: resolvedTakeRegion(confirmed.candidate, performedGroups, confidence),
        explanation: `The user confirmed ${confirmed.candidate.displayRange}; grading remains bounded to that frozen region.`,
      },
    }
  }

  if (performedGroups.length === 1) {
    const matchIndex = expectedGroups.findIndex((group) => pitchFingerprint(group.pitches) === pitchFingerprint(performedGroups[0]!.pitches))
    const evaluated = evaluateCandidate(expectedGroups, performedGroups, Math.max(0, matchIndex), Math.max(0, matchIndex), options, hint, true)
    const wholePlan = expectedGroups.length === 1 && evaluated !== null
    return {
      selected: evaluated,
      localization: {
        status: wholePlan ? 'limited' : 'insufficient-data', resolution: wholePlan ? 'automatic' : 'unresolved', intendedStart: hint, selectedCandidateId: wholePlan ? evaluated.candidate.id : null, candidates: evaluated ? [evaluated.candidate] : [], bestVsSecondQualitySeparation: null,
        takeRegion: wholePlan ? resolvedTakeRegion(evaluated.candidate, performedGroups, 'limited') : null,
        explanation: wholePlan ? 'The take covers the score’s only onset group; region identity is bounded but evidence remains limited.' : 'One onset can supply a time anchor, but not enough structural evidence to localize a score region.',
      },
    }
  }

  const windowLength = Math.max(performedGroups.length + 4, Math.ceil(performedGroups.length * 1.35))
  const evaluated = proposalStarts(expectedGroups, performedGroups, hint)
    .map((start) => evaluateCandidate(expectedGroups, performedGroups, start, start + windowLength - 1, options, hint))
    .filter((candidate): candidate is EvaluatedCandidate => candidate !== null)
  const deduplicated = new Map<string, EvaluatedCandidate>()
  for (const item of evaluated) {
    const key = `${item.candidate.expectedStartIndex}:${item.candidate.expectedEndIndex}`
    const previous = deduplicated.get(key)
    if (!previous || item.candidate.evidence.quality > previous.candidate.evidence.quality) deduplicated.set(key, item)
  }
  const ranked = [...deduplicated.values()].sort((left, right) => right.candidate.evidence.quality - left.candidate.evidence.quality || left.candidate.expectedStartIndex - right.candidate.expectedStartIndex)
  if (ranked.length === 0) {
    return { selected: null, localization: { status: 'divergent', resolution: 'unresolved', intendedStart: hint, selectedCandidateId: null, candidates: [], bestVsSecondQualitySeparation: null, takeRegion: null, explanation: 'The performed pitch structure does not provide a credible contiguous score-region match.' } }
  }

  const automaticBest = ranked[0]!
  const hinted = ranked.find((item) => item.candidate.hintAgreement === 'exact')
  const selected = hinted && hinted.candidate.evidence.quality >= automaticBest.candidate.evidence.quality - 0.12 && hinted.candidate.evidence.exactPitchAnchorDensity >= 0.4 ? hinted : automaticBest
  const alternatives = ranked.filter((item) => item.candidate.id !== selected.candidate.id && overlapRatio(item.candidate, selected.candidate) < 0.5)
  const second = alternatives[0] ?? ranked.find((item) => item.candidate.id !== selected.candidate.id)
  const separation = second ? selected.candidate.evidence.quality - second.candidate.evidence.quality : null
  const minimumAnchors = Math.max(2, Math.ceil(performedGroups.length * 0.15))
  const completePlanEvidence = selected.candidate.expectedStartIndex === 0
    && selected.candidate.expectedEndIndex === expectedGroups.length - 1
    && selected.candidate.performedStartIndex === 0
    && selected.candidate.performedEndIndex === performedGroups.length - 1
    && selected.candidate.evidence.exactPitchAnchorDensity >= 0.6
  const divergent = selected.candidate.evidence.exactPitchAnchorCount < minimumAnchors || selected.candidate.evidence.exactPitchAnchorDensity < 0.25 || selected.candidate.evidence.performedCoverage < 0.35
  const hintResolved = selected.candidate.hintAgreement === 'exact' && selected.candidate.evidence.exactPitchAnchorDensity >= 0.4
  const ambiguous = !divergent && !completePlanEvidence && !hintResolved && second !== undefined && Math.abs(separation ?? 0) < 0.06
  const confident = !divergent && !ambiguous && selected.candidate.evidence.exactPitchAnchorDensity >= 0.6 && selected.candidate.evidence.correspondenceDensity >= 0.65 && selected.candidate.evidence.longestUnsupportedGap <= Math.max(3, Math.ceil(performedGroups.length * 0.2))
  const status = divergent ? 'divergent' : ambiguous ? 'ambiguous' : confident ? 'confident' : 'limited'
  const resolution = status === 'confident' || status === 'limited' ? (hintResolved ? 'intended-start' : 'automatic') : 'unresolved'
  const candidates = [selected, ...alternatives].slice(0, 3).map((item) => item.candidate)
  const takeRegion = status === 'confident' || status === 'limited' ? resolvedTakeRegion(selected.candidate, performedGroups, status) : null
  const explanation = status === 'ambiguous'
    ? 'More than one separated score region has similarly strong pitch-structure evidence.'
    : status === 'divergent'
      ? 'The take lacks enough continuous exact-pitch anchors for a trustworthy score-region claim.'
      : `${selected.candidate.displayRange} is supported by ${selected.candidate.evidence.exactPitchAnchorCount} exact-pitch onset anchors.`
  return { selected, localization: { status, resolution, intendedStart: hint, selectedCandidateId: takeRegion ? selected.candidate.id : null, candidates, bestVsSecondQualitySeparation: separation, takeRegion, explanation } }
}
