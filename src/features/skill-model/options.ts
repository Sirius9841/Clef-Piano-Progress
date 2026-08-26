/** Product heuristics for qualifying current Technique evidence, not piano-pedagogy laws. */
export const SKILL_MODEL_OPTIONS = Object.freeze({
  minimumFacetCoverage: 0.55,
  contextAttemptWindow: 3,
  reliableWeight: 1,
  limitedWeight: 0.6,
  recencyHalfLifeDays: 105,
  recencyWeightFloor: 0.35,
  consistencyMadPenalty: 4,
  mediumConfidenceAttempts: 4,
  mediumConfidenceContexts: 2,
  highConfidenceAttempts: 8,
  highConfidenceContexts: 4,
  highConfidenceReliableFraction: 0.65,
  highConfidenceCoverage: 0.75,
  confidenceFreshnessDays: 120,
})
