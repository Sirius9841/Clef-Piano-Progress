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

## Phase 13.1 — complete

Skill Model `1.1.0` bounds both rating and confidence evidence to the latest three attempts per exact template-aware context, separates quality recency from no-floor confidence authority, and distinguishes every material authored drill dimension including subdivision for Chords, Jumps, and Tempo Control. Mastery Model `1.1.0` gives demonstrated speed its own smooth current support, derives overall recency from the evidence distribution, and bounds confidence by effective attempt and session authority. UI provenance makes current speed support and the Progress range boundary explicit. Persistence remains schema 4 with no attempt-family changes.

## Phase 13.2 — complete

Skill Model `1.1.1` synchronizes challenge identity with the displayed envelope, exposes template, subdivision, event-count, and non-tonal starting-pitch provenance across all eight modules, and calls the retained latest-three evidence a model window rather than implying recency. Mastery Model `1.1.1` requires current, bucket-local effective session authority for High-confidence demonstrated speed, while preserving separate raw session provenance. Same-session repetitions may establish a speed but cannot produce High confidence; stale or other-speed sessions cannot substitute for current independent support. Persistence remains schema 4 with no new stores or record versions. Phase 13 is closed.

## Phase 14 — Intelligent Practice Planning Core — complete

Deterministic longitudinal section history, independent-session persistence, speed-aware progression, Mastery-aware verification, independent Technique recommendations, time-budget session composition, and structured recommendation provenance are complete in `practice-planning-1.0.0`. The core is a pure derived read model: frozen Phase 7 Practice Priority and all historical records remain unchanged, and IndexedDB remains schema 4.

Phase 14 UI integration is intentionally deferred while the final Clef interface is being designed. No unfinished UI is implied by the core milestone.

## Phase 14.1 — complete

Practice Planning `1.0.1` finalizes progression integrity with one deterministic highest-speed frontier, strictly consistent source/suggested speed actions, canonical one-section/one-block session composition with merged recommendation provenance, and one locked resolved policy shared by context and result. IndexedDB remains schema 4, historical records remain unchanged, and UI integration remains intentionally deferred. Phase 14 is closed.

## Phase 15 — Product Completion — in progress

## Phase 15.0 — Frozen V1 Interface Integration — complete

The frozen premium desktop interface is integrated with the real local repository, canonical OSMD path, MIDI/Practice lifecycle, immutable Results, Mastery, Skill, and Practice Planning read models. Dark/Light/System application appearance and Paper/Night score appearance are independent presentation preferences. No persistence schema, attempt family, analysis engine, or evidence semantics changed. Phase 15.1 remains release and data-safety hardening; Clef V1 is not yet marked released.

## Phase 15.0.1 — Final Frozen V1 Presentation Integrity — complete

Practice Planning actions now open the exact current persisted ScoreVersion with their suggested speed and session-local target identity, while Technique actions retain their dedicated routes. Current-result surfaces no longer borrow metrics, PBs, Voicing, or reference state from older ScoreVersions. Historical Results use one dominant score and a selectable seven-dimension saved-evidence inspector, with neutral reference context and current Phase 14 planning kept visibly separate from frozen Phase 7 take evidence. Repertoire rich cards are bounded while its filtered ledger remains complete. No domain model, engine, persistence schema, attempt family, or grading semantics changed.

## Phase 15.1 — V1 Data Safety & Release Hardening — complete

Clef now has deterministic lossless local backup format `1`, SHA-256 payload integrity, explicit database verification, inspect-before-mutate restore, atomic all-store replacement with rollback, and a narrow summary-only repair. Accessible destructive confirmations, product-route error recovery, truthful Web MIDI failure states, long-session coverage, bounded histories, exact planner speed presentation, current-ScoreVersion Home evidence, and a concrete release checklist complete the automated V1 hardening scope. IndexedDB remains schema `4`; historical attempt families and all musical engine/model versions remain unchanged.

Clef is a **V1 release candidate**, not a publicly released product. Real MIDI hardware and final manual checklist acceptance remain pending release gates.

## Phase 15.1.1 — Final Recovery Integrity Closure — complete

Summary repairability is now proven from a fully validated hypothetical post-repair snapshot rather than inferred from the currently visible issue families. The repair write path repeats that fail-before-mutation proof and returns only a healthy final report. Backup inspection also enforces unique logical Repertoire membership and unique attempt IDs within each PracticeSession. Schema `4`, backup format `clef-local-backup` version `1`, all historical record families, and every musical engine/model version remain unchanged.

## Phase 15.2 — Real-Performance Truth + Compact Take Review — complete

Recording now arms until the first Note On, score-region localization deterministically bounds partial takes before fine alignment, repetitive passages fail closed into explicit candidate confirmation, and downstream grading uses the immutable matched region. Timing rejects mismatched local-window geometry instead of clamping implausible BPM samples. Practice presents a compact matched-range Take Review with independent evidence dimensions, a bounded measure map, bounded issues, truthful unavailable Pedal/Voicing states, and lazy forensic detail. Alignment advances from `1.0.0` to `2.0.0`; Timing Analysis advances from `1.0.0` to `1.1.0`. PerformanceAttempt remains V4, IndexedDB remains schema `4`, no migration is required, and historical attempts remain frozen. The manual CA401 release gate is still pending.

## Phase 15.2.1 — Final Partial-Take Workflow — complete

Stopped takes now automatically progress through bounded Alignment, aligned-span Notes, Timing, and Performance Results into Take Review. Ambiguity goes directly to confirmation and resumes automatically; localization intent is part of the race-safe analysis identity; Phase 14 section hints use both bounds; and matrix safety applies to each candidate, coarse, and refined matrix actually constructed. Alignment advances to `2.0.1`; Timing remains `1.1.0`, PerformanceAttempt remains V4, IndexedDB remains schema `4`, and no migration is added. Historical Alignment `2.0.0` snapshots remain frozen and readable. Real CA401 validation remains pending.

Future notation work must replace the current overly dense OSMD `drawingParameters: compacttight` full-score posture with readable page-oriented engraving. It must remain renderer-only and must not change canonical score, localization, or analysis truth.

Reference performances will be comparison examples, style references, and interpretive alternatives—not absolute expressive ground truth. Future timing work must distinguish coherent rubato from uncontrolled timing instead of rewarding human-metronome conformity.

Notes, Rhythm, Tempo, Dynamics, Articulation, Pedal, and configured Voicing remain separate. Dynamics, Articulation, Pedal, and Voicing do not enter personal bests, trends, Practice Priority, Skill Ratings, or Mastery. Reference differences are neutral and have no aggregate score. Acoustic tone/loudness, calibrated half-pedal depth, an overall Performance Score, cloud sync, and accounts remain unimplemented.

The pre-Phase-9 hardening pass adds same-ID MIDI disconnect safety, truthful Library and Technique previews, conservative PB reliability eligibility, captured-speed locking, user-controlled Repertoire status and sorting, defensive persistence mutation/corruption handling, and validation CI. It does not add expressive grading.
