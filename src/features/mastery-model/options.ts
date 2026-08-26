/** Product heuristics for demonstrated arrangement control, not a universal standard of musical mastery. */
export const MASTERY_MODEL_OPTIONS = Object.freeze({
  recentAttemptWindow: 8,
  reliableWeight: 1,
  limitedWeight: 0.65,
  speedBucketPrecision: 100,
  speedQualification: Object.freeze({ notes: 0.9, rhythm: 0.8, tempo: 0.8, minimumAttempts: 2 }),
  weights: Object.freeze({ control: 0.55, demonstratedSpeed: 0.3, consistency: 0.15 }),
  recencyHalfLifeDays: 120,
  recencyFactorFloor: 0.82,
  consistencyMadPenalty: 4,
  mediumConfidenceAttempts: 2,
  mediumConfidenceSessions: 2,
  mediumConfidenceFreshnessDays: 180,
  highConfidenceAttempts: 5,
  highConfidenceSessions: 3,
  highConfidenceReliableFraction: 0.6,
  highConfidenceFreshnessDays: 45,
})
