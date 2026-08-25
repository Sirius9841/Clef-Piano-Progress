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

## Phase 11+

Reference-performance expression and advanced voicing, Technique Lab exercises, and transferable skill measurement.

Phase 10 keeps Notes, Rhythm, Tempo, Dynamics, Articulation, and Pedal separate. Dynamics, Articulation, and Pedal do not enter personal bests, trends, or Practice Priority. Acoustic tone/loudness, calibrated half-pedal depth, voicing, an overall Performance Score, Mastery, cloud sync, and accounts remain unimplemented.

The pre-Phase-9 hardening pass adds same-ID MIDI disconnect safety, truthful Library and Technique previews, conservative PB reliability eligibility, captured-speed locking, user-controlled Repertoire status and sorting, defensive persistence mutation/corruption handling, and validation CI. It does not add expressive grading.
