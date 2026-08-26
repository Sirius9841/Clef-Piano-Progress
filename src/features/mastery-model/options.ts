/** Product heuristics for demonstrated arrangement control, not a universal standard of musical mastery. */
export const MASTERY_MODEL_OPTIONS = Object.freeze({
  recentAttemptWindow: 8,
  reliableWeight: 1,
  limitedWeight: 0.65,
  speedBucketPrecision: 100,
  speedQualification: Object.freeze({ notes: 0.9, rhythm: 0.8, tempo: 0.8, minimumAttempts: 2 }),
  minimumDemonstratedSpeedSupport: 1.1,
  weights: Object.freeze({ control: 0.55, demonstratedSpeed: 0.3, consistency: 0.15 }),
  recencyHalfLifeDays: 120,
  recencyFactorFloor: 0.82,
  consistencyMadPenalty: 4,
  mediumConfidenceEffectiveEvidenceSupport: 1.25,
  mediumConfidenceEffectiveSessionSupport: 1.25,
  highConfidenceEffectiveEvidenceSupport: 4,
  highConfidenceEffectiveSessionSupport: 2.5,
  highConfidenceDemonstratedSpeedSessionSupport: 1.5,
  highConfidenceReliableAuthorityFraction: 0.6,
})
