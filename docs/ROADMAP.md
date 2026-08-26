# Roadmap

## Phase 1 — complete

Foundation, premium UI, domain model, and Web MIDI connectivity.

## Phase 2 — complete

Production MusicXML/MXL loading and validation, exact rational score timing, deterministic normalized score representation, structural warnings/statistics, and lazy OSMD notation rendering.

## Phase 3 — complete

Expected performance model, exact score-time mapping, explicit part selection, session-local Practice flow, monotonic MIDI performance recording, key-press derivation, and objective capture statistics.

## Phase 4 — complete

Robust score ↔ MIDI performance alignment: deterministic performed-onset clustering, monotonic coarse/refined sequence alignment, affine time-transform fitting, attack correspondences, neutral diagnostics, and Practice integration.

## Phase 5 — complete

Physical expected-key targets, correct/wrong-pitch/missed/additional semantics, conservative substitution assignment, explicit grading scopes, precision/recall/F1 note scoring, and Practice note results.

## Phase 6 — complete

Tempo-normalized rhythm observations, robust rhythm scoring, effective practice-tempo targets, local tempo estimation, speed/stability/trend analysis, numeric tempo changes, qualitative direction context, and Practice timing results.

## Phase 7 — complete

Evidence-aware measure aggregation, underlying-data section metrics, confidence-adjusted weak/strong section ranking, deterministic notation-result mapping, musical-order mistake navigation, accessible performance heatmaps, and Practice result integration.

## Phase 8 — complete

Versioned IndexedDB persistence, real Work/Arrangement/ScoreVersion imports, repertoire reload, transactional PracticeSessions and PerformanceAttempts, lossless MIDI and analysis history, read-only historical results, context-safe personal bests, rolling trends, and real Home/Progress/Settings data.

## Phase 9 — complete

Dynamics and articulation analysis: performance-relative normalization, explicit changes, hairpins, accents, physical key gate ratios, conservative slur transitions, independent coverage/reliability, V2 frozen attempt snapshots, and Practice/history presentation.

## Phase 10 — complete

Authored damper-pedal phrase modeling, lossless CC64 timelines, tempo-aware start/stop/re-pedal timing, independent evidence and reliability, damper-hold/key-interaction context, V3 frozen attempt snapshots, and Practice/history presentation.

## Phase 10.1 — complete

Musical-integrity hardening: rubato-aware local pedal anchors, channel-safe CC64 state and damper holds, bounded non-cascading transition matching, honest partial event coverage, and a permanent distinction between score fidelity and musical interpretation.

## Phase 10.2 — complete

Final local timing-anchor correctness: tempo-aware interpolation between bracketing onsets and one-sided transfer of nearby onset residuals without collapsing distinct score positions. Phase 10 is closed.

## Phase 11 — complete

Advanced configured Voicing from real score lanes and interpretation-aware comparison with user-selected saved local takes, including V4 frozen snapshots and ScoreVersion-specific preferences.

## Phase 11.1 — complete

Interpretation-integrity hardening: current-intent reference Voicing with immutable comparison-only derivation, canonical full-plan duration bounds, exact Pedal engine compatibility, shared-pair Tempo centering, comparison provenance, and deep V4 corruption validation while preserving frozen 1.0.0 history.

## Phase 12+

## Phase 12 — complete

Technique Lab now provides eight deterministic, notation-backed MIDI exercise modules, challenge-qualified independent facets, exact-instance sight-reading novelty, dedicated local-first TechniqueAttempt persistence, and frozen historical results. It intentionally does not create an overall score, Skill Rating, Mastery, or repertoire progress claim.

## Phase 12.1 — complete

Phase 12.1 hardens that evidence boundary: musically exact scale/arpeggio generation, true turn/register/jump-transition identity, purpose-specific safe configuration, separate facet observation families, actual event coverage, V1/V2 frozen history, Phase-13-ready V2 summaries, deep repository validation, and same-ID collision protection. Generator/analysis engines advance to `1.1.0`; IndexedDB remains schema 4.

## Phase 12.2 — complete

Attempted-span semantics, facet-specific authored-opportunity coverage, key-aware notation, current `technique-exercise-1.1.1`, frozen exercise-plan validation, and fail-closed evidence integrity.

## Phase 12.3 — complete

Score-side Tempo opportunity denominators shared with TimingAnalysis window geometry, exact sample-to-opportunity mapping, authored transition coverage, pre-dispatch identity failure closure, and explicit frozen V2 engine-pair compatibility. Current analysis is `technique-analysis-1.1.2`; IndexedDB remains schema 4.

## Phase 13 — complete

Skill Model `1.0.0` now derives eight challenge-qualified current Technique ratings from the exact current summary engine pair, with two-stage context aggregation, repetition protection, confidence, consistency, recency, breadth envelopes, and typed exclusions. Mastery Model `1.0.0` derives current Arrangement/current-ScoreVersion command from reliable or limited full-score Notes, Rhythm, and Tempo summaries, keeping repeated demonstrated speed, control, consistency, recency, and confidence explicit. Both are pure immutable read models; persistence remains schema 4 and all historical attempt families remain untouched.

Reference performances will be comparison examples, style references, and interpretive alternatives—not absolute expressive ground truth. Future timing work must distinguish coherent rubato from uncontrolled timing instead of rewarding human-metronome conformity.

Notes, Rhythm, Tempo, Dynamics, Articulation, Pedal, and configured Voicing remain separate. Dynamics, Articulation, Pedal, and Voicing do not enter personal bests, trends, Practice Priority, Skill Ratings, or Mastery. Reference differences are neutral and have no aggregate score. Acoustic tone/loudness, calibrated half-pedal depth, an overall Performance Score, cloud sync, and accounts remain unimplemented.

The pre-Phase-9 hardening pass adds same-ID MIDI disconnect safety, truthful Library and Technique previews, conservative PB reliability eligibility, captured-speed locking, user-controlled Repertoire status and sorting, defensive persistence mutation/corruption handling, and validation CI. It does not add expressive grading.
