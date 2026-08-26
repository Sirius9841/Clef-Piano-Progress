/** Product heuristics for qualifying current Technique evidence, not piano-pedagogy laws. */
export const SKILL_MODEL_OPTIONS = Object.freeze({
  minimumFacetCoverage: 0.55,
  contextAttemptWindow: 3,
  reliableWeight: 1,
  limitedWeight: 0.6,
  qualityRecencyHalfLifeDays: 105,
  qualityRecencyWeightFloor: 0.35,
  confidenceRecencyHalfLifeDays: 90,
  contextAuthorityNormalization: 1.5,
  consistencyMadPenalty: 4,
  mediumConfidenceModelAttempts: 2,
  mediumConfidenceContexts: 2,
  mediumConfidenceEffectiveSupport: 1.2,
  highConfidenceModelAttempts: 8,
  highConfidenceContexts: 4,
  highConfidenceEffectiveSupport: 3.2,
})
