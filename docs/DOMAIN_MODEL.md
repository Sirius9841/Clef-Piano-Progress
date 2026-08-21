# Domain model

The application deliberately separates musical identity, playable realization, grading input, and recorded outcome.

```text
Work → Arrangement → ScoreVersion → PerformanceAttempt
```

## Work

A Work is the musical identity: title, composer, small metadata, and an optional `derivedFromWorkId`. It does not own arrangement-specific mastery.

## Arrangement

An Arrangement is one specific playable realization of a Work. Difficulty, target tempo, repertoire state, clean tempo, and mastery apply here.

```text
River Flows in You
├── Original solo arrangement
└── Simplified arrangement
```

A strong result on the simplified arrangement says nothing automatically about mastery of the original.

## Derived Work

A substantial derivative may have its own musical identity:

```text
Canon Fantasy
derived from → Canon in D
```

Canon Fantasy is therefore a separate Work with its own arrangements, score versions, performances, weak sections, and personal bests. This differs from a simplified or alternate arrangement of *Canon in D*.

## ScoreVersion

A ScoreVersion is the exact MusicXML/MXL input used for analysis. It is historically immutable. Editing an import creates another version so old results remain reproducible.

Phase 2 produces a `NormalizedScore` from validated canonical MusicXML. Phase 8 persists the exact canonical XML, source metadata, parser version, included-part arrangement setup, and SHA-256 fingerprint in a ScoreVersion. The normalized model is reconstructed for a new live session; historical attempts retain the exact derived plan and analysis snapshots they used.

`NormalizedScore` and `ScoreVersion` are related but not interchangeable. The normalized object describes score contents; a persisted ScoreVersion provides identity, canonical source, selected parts, provenance, creation metadata, and historical immutability. OSMD rendering objects belong to neither concept.

## PerformanceAttempt and Performance Score

A PerformanceAttempt is one persisted recording tied to an Arrangement, exact ScoreVersion, PracticeSession, timestamp, scope, speed, and engine versions. It retains lossless raw MIDI plus AlignmentResult, NoteGradingResult, TimingAnalysisResult, and PerformanceResults. Notes, Rhythm, and Tempo remain separate; no overall Performance Score is calculated in Phase 8.

## Mastery

Mastery estimates current knowledge of one Arrangement across multiple signals. It is not simply the best Performance Score. The final formula is intentionally deferred.

## SkillRating

A SkillRating measures a transferable ability such as sight reading, rhythm, chord fluency, scales, or tempo control. It is independent of arrangement mastery.

## Expected performance plan

`ExpectedPerformancePlan` is a deterministic, derived view of one `NormalizedScore` and an explicit part selection. It distinguishes required attacks, exact onset groups, logical sounding spans, and flexible or excluded notation. Tie continuations extend one sounding span, rests create no attacks, grace timing remains flexible, cue notes are excluded, and non-MIDI pitches are never rounded. The plan contains no observed performance and no grade.

## Performance recording

`PerformanceRecording` is session-local observed MIDI truth: ordered normalized events, physical key-press spans, device/context metadata, objective diagnostics, and a wall-clock start time. Fine timing is relative monotonic milliseconds. An open key has no invented release, an orphan Note Off remains an event and warning, and sustain is recorded independently from physical key release.

When the user explicitly saves a completed analysis, this recording is preserved inside a PerformanceAttempt without changing the frozen recording snapshot.

## Alignment result

`AlignmentResult` is an immutable, versioned correspondence snapshot between one `ExpectedPerformancePlan` and one `PerformanceRecording`. It contains performed onset groups, monotonic group correspondences, expected-only and performed-only groups, exact attack pairs, an affine reference-to-performance time transform, timing residuals, warnings, and objective diagnostics.

Alignment facts are deliberately neutral. An unpaired expected attack is not yet a “missed note,” an unpaired performed attack is not yet a “wrong note,” and a timing residual is not yet a rhythm judgment. Phase 5 and later grading layers will interpret these facts without changing the plan, recording, or alignment history.

## Note grading result

`NoteGradingResult` is the immutable, versioned Phase 5 interpretation of an `AlignmentResult`. It first collapses simultaneous notation attacks with the same MIDI pitch into a single physically observable `ExpectedKeyTarget`, retaining all attack, source-note, measure, part, staff, and voice provenance. It then classifies in-scope targets and observed attacks as correct, wrong-pitch, missed, additional, excluded, or outside scope.

Every result records aligned-span or full-plan scope and reliable, provisional, or unavailable status. Its dedicated note score is pitch-only precision/recall F1. It is not an overall `Performance Score`; timing, tempo, velocity, duration, articulation, chord spread, and pedal data remain uninterpreted by this layer.

## Timing analysis result

`TimingAnalysisResult` is the immutable, versioned Phase 6 interpretation of the existing alignment clock and the selected Phase 5 scope. Its `RhythmAnalysis` records matched-onset provenance, local interval ratios, tempo-normalized error, human-timing tolerance, robust rhythm score, chord-spread diagnostics, and measure foundations. Its separate `TempoAnalysis` records effective target tempo, global tempo ratio, local tempo samples, stability, trend, numeric tempo regions, and qualitative direction observations.

The global affine `timeScale` describes performed duration per unit of effective reference duration; the musically presented `tempoRatio` is its inverse. A 1.25× time scale therefore means approximately 80% of target tempo. Neither result uses pitch correctness as partial timing credit, and neither uses velocity, release duration, articulation, or pedal data. Notes, Rhythm, and Tempo are not combined into an overall Performance Score yet.

## Performance results

`PerformanceResults` is the immutable, versioned Phase 7 aggregation snapshot for one exact normalized score, expected plan, alignment, note grade, timing analysis, and grading scope. It contains measure results, sliding section results, weak and strong section recommendations, a deterministic musical-order mistake index, accessible heatmap data, and mappings back to expected attacks and normalized source IDs.

Its Practice Priority combines available dimension deficits at 45% Notes, 35% Rhythm, and 20% Tempo, renormalizes missing dimensions, and adjusts the ranking by evidence confidence. It answers “where should this take be reviewed first?” It is explicitly not the attempt's overall Performance Score, arrangement Mastery, a personal best, or a transferable SkillRating. Phase 8 persists the result inside its exact PerformanceAttempt; historical views are read-only and do not silently rerun newer engines.

## PracticeSession and RepertoireEntry

A PracticeSession represents one mounted practice visit and may own multiple PerformanceAttempts. Its persisted span runs from the first saved take's recording start through the latest saved take's end, intentionally including time between takes in that visit. Practice time is that completed session span, so recording several takes does not multiply minutes and an idempotent retry cannot extend it. A RepertoireEntry is removable membership/status for an Arrangement; removing it preserves the underlying Work, Arrangement, ScoreVersions, sessions, and attempt history, and an exact re-import recreates only membership.

## Personal bests and progress

Personal bests are derived from immutable attempt summaries rather than stored counters. Headline comparisons require the same Arrangement, ScoreVersion, full-plan scope, and practice-speed multiplier. Partial takes remain visible in history but never become headline records. Notes, Rhythm, and Tempo have separate records; there is no overall personal best.
