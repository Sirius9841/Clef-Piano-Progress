import type { NoteGradingMetrics } from './types'

export interface ScoreCounts {
  readonly correct: number
  readonly wrongPitch: number
  readonly missed: number
  readonly additional: number
}

export function calculateNoteMetrics(counts: ScoreCounts, hasGradeableExpectedTargets = true): NoteGradingMetrics {
  if (!hasGradeableExpectedTargets) return { precision: null, recall: null, noteScore: null }
  const precisionDenominator = counts.correct + counts.wrongPitch + counts.additional
  const recallDenominator = counts.correct + counts.wrongPitch + counts.missed
  const precision = precisionDenominator === 0 ? null : counts.correct / precisionDenominator
  const recall = recallDenominator === 0 ? null : counts.correct / recallDenominator
  const scoreDenominator = 2 * counts.correct + 2 * counts.wrongPitch + counts.missed + counts.additional
  const noteScore = scoreDenominator === 0 ? null : 2 * counts.correct / scoreDenominator
  return { precision, recall, noteScore }
}
