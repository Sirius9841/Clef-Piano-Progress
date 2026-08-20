import { describe, expect, it } from 'vitest'
import { calculateNoteMetrics } from '../metrics'
import { resolveNoteGradingOptions } from '../options'
import { assignWrongPitches } from '../wrongPitchAssignment'

describe('conservative wrong-pitch assignment', () => {
  const options = resolveNoteGradingOptions()

  it('finds a minimum-total-distance chord assignment', () => {
    const result = assignWrongPitches(
      [{ id: 'C4', midi: 60 }, { id: 'G4', midi: 67 }],
      [{ id: 'Cs4', midi: 61, sequence: 0 }, { id: 'Fs4', midi: 66, sequence: 1 }],
      options,
    )
    expect(result.pairs).toEqual([
      { targetId: 'C4', attackId: 'Cs4', expectedMidi: 60, performedMidi: 61, semitoneDelta: 1, absoluteSemitoneDistance: 1 },
      { targetId: 'G4', attackId: 'Fs4', expectedMidi: 67, performedMidi: 66, semitoneDelta: -1, absoluteSemitoneDistance: 1 },
    ])
  })

  it('refuses an unrelated distant pitch', () => {
    expect(assignWrongPitches([{ id: 'C4', midi: 60 }], [{ id: 'B6', midi: 95, sequence: 0 }], options).pairs).toEqual([])
  })

  it('accepts an explicitly configured wrong octave without calling it exact', () => {
    const result = assignWrongPitches([{ id: 'C4', midi: 60 }], [{ id: 'C5', midi: 72, sequence: 0 }], options)
    expect(result.pairs[0]).toMatchObject({ semitoneDelta: 12, absoluteSemitoneDistance: 12 })
  })

  it('marks equal minimum-distance assignments ambiguous but remains deterministic', () => {
    const targets = [{ id: 'a', midi: 60 }, { id: 'b', midi: 60 }]
    const attacks = [{ id: 'x', midi: 61, sequence: 0 }, { id: 'y', midi: 61, sequence: 1 }]
    const first = assignWrongPitches(targets, attacks, options)
    const second = assignWrongPitches(targets, attacks, options)
    expect(first.ambiguous).toBe(true)
    expect(first).toEqual(second)
  })

  it('returns no speculative substitutions beyond the assignment guardrail', () => {
    const guardedOptions = resolveNoteGradingOptions({ maxWrongPitchAssignmentSize: 1 })
    const result = assignWrongPitches([{ id: 'a', midi: 60 }, { id: 'b', midi: 62 }], [{ id: 'x', midi: 61, sequence: 0 }], guardedOptions)
    expect(result).toEqual({ pairs: [], ambiguous: false, guarded: true })
  })

  it('rejects invalid centralized grading options', () => {
    expect(() => resolveNoteGradingOptions({ wrongPitchMaxSemitones: -1 })).toThrow(RangeError)
    expect(() => resolveNoteGradingOptions({ maxWrongPitchAssignmentSize: 21 })).toThrow(RangeError)
  })
})

describe('note-score metrics', () => {
  it('calculates the exact precision, recall, and F1 count formula', () => {
    const metrics = calculateNoteMetrics({ correct: 8, wrongPitch: 1, missed: 2, additional: 1 })
    expect(metrics.precision).toBeCloseTo(8 / 10)
    expect(metrics.recall).toBeCloseTo(8 / 11)
    expect(metrics.noteScore).toBeCloseTo(16 / 21)
  })

  it('returns null precision, zero recall, and zero score for an all-missed full plan', () => {
    expect(calculateNoteMetrics({ correct: 0, wrongPitch: 0, missed: 5, additional: 0 })).toEqual({ precision: null, recall: 0, noteScore: 0 })
  })

  it('does not manufacture a score without gradeable expected targets', () => {
    expect(calculateNoteMetrics({ correct: 0, wrongPitch: 0, missed: 0, additional: 4 }, false)).toEqual({ precision: null, recall: null, noteScore: null })
  })

  it('keeps generated valid scores finite and within bounds', () => {
    for (let correct = 0; correct < 6; correct += 1) for (let wrongPitch = 0; wrongPitch < 4; wrongPitch += 1) {
      const metrics = calculateNoteMetrics({ correct, wrongPitch, missed: 3, additional: 7 })
      expect(metrics.noteScore).not.toBeNull()
      expect(Number.isFinite(metrics.noteScore!)).toBe(true)
      expect(metrics.noteScore).toBeGreaterThanOrEqual(0)
      expect(metrics.noteScore).toBeLessThanOrEqual(1)
    }
  })

  it('gives no partial credit to a nearby substituted pitch', () => {
    expect(calculateNoteMetrics({ correct: 0, wrongPitch: 1, missed: 0, additional: 0 }).noteScore).toBe(0)
  })
})
