/** Technical exercise heuristics, not universal laws of piano playing. */
export const TECHNIQUE_ANALYSIS_OPTIONS = Object.freeze({
  minimumEventCoverage: 0.55, minimumNoteEvents: 4, minimumRhythmIntervals: 4, minimumEvennessIntervals: 5,
  minimumChordEvents: 4, minimumChordSynchronizationEvents: 4, minimumJumpTransitions: 3, minimumTempoSamples: 3,
  minimumTempoStabilitySamples: 4, minimumTempoTransitionSamples: 3, evennessLogTolerance: 0.18,
  pulseExpansionGraceRatio: 1.12, pulseExtremePauseRatio: 1.8, chordTightSpreadMs: 35, chordMaximumSpreadMs: 120,
  turnNeighborhoodRadius: 1, tempoTargetLogTolerance: 0.22, tempoStabilityLogTolerance: 0.14, tempoTrajectoryLogTolerance: 0.16,
  reliableCoverageRatio: 0.8, minimumReliableFacetCoverage: 0.8, weakFindingScore: 65, chordFindingScore: 80, comparativeFindingGap: 20,
  minimumAuthoredTempoDelta: 0.005,
})
export type TechniqueAnalysisOptions = typeof TECHNIQUE_ANALYSIS_OPTIONS
