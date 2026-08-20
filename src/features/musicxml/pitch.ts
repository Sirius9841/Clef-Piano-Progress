import type { ScorePitch, PitchStep, ScoreWarning } from './types'

const STEP_SEMITONES: Record<PitchStep, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
const ALTER_NAMES: Record<string, string> = { '-2': 'bb', '-1': 'b', '0': '', '1': '#', '2': '##' }

export function createScorePitch(step: PitchStep, alter: number, octave: number): ScorePitch {
  const integerAlter = Number.isInteger(alter)
  const midi = integerAlter ? (octave + 1) * 12 + STEP_SEMITONES[step] + alter : null
  const validMidi = midi !== null && midi >= 0 && midi <= 127 ? midi : null
  const alteration = ALTER_NAMES[String(alter)] ?? (alter === 0 ? '' : alter > 0 ? `+${alter}` : String(alter))
  return {
    step,
    alter,
    octave,
    midi: validMidi,
    spelling: `${step}${alteration}${octave}`,
    outsidePianoRange: midi !== null && (midi < 21 || midi > 108),
  }
}

export function pitchWarnings(pitch: ScorePitch, context: Omit<ScoreWarning, 'code' | 'severity' | 'message'>): ScoreWarning[] {
  const warnings: ScoreWarning[] = []
  if (!Number.isInteger(pitch.alter)) {
    warnings.push({ ...context, code: 'MICROTONAL_PITCH', severity: 'warning', message: `${pitch.spelling} uses a microtonal alteration and cannot map to a standard MIDI key.` })
  }
  if (pitch.outsidePianoRange) {
    warnings.push({ ...context, code: 'OUTSIDE_PIANO_RANGE', severity: 'warning', message: `${pitch.spelling} is outside the standard 88-key piano range (A0–C8).` })
  }
  return warnings
}
