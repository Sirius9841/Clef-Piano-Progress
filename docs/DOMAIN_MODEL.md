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

A ScoreVersion is the exact MusicXML/MXL input and canonical selected-part set used for analysis. It is historically immutable. Editing the score or changing that part set creates another version so old results remain reproducible; reordered or duplicate part IDs describe the same selection.

Phase 2 produces a `NormalizedScore` from validated canonical MusicXML. Phase 8 persists the exact canonical XML, source metadata, parser version, included-part arrangement setup, and SHA-256 fingerprint in a ScoreVersion. The normalized model is reconstructed for a new live session; historical attempts retain the exact derived plan and analysis snapshots they used.

`NormalizedScore` and `ScoreVersion` are related but not interchangeable. The normalized object describes score contents; a persisted ScoreVersion provides identity, canonical source, selected parts, provenance, creation metadata, and historical immutability. OSMD rendering objects belong to neither concept.

## PerformanceAttempt and Performance Score

A PerformanceAttempt is one persisted recording tied to an Arrangement, exact ScoreVersion, PracticeSession, timestamp, scope, speed, and engine versions. V1 retains lossless raw MIDI plus AlignmentResult, NoteGradingResult, TimingAnalysisResult, and PerformanceResults. Phase 9 V2 additionally retains the exact ExpressionAnalysisResult. Phase 10 V3 additionally retains the exact PedalAnalysisResult. Phase 11 V4 additionally freezes exact VoicingAnalysisResult and ReferenceComparisonResult snapshots. Notes, Rhythm, Tempo, Dynamics, Articulation, Pedal, and Voicing remain separate; no overall Performance Score is calculated.

A `TechniqueAttemptRecordV1` is a separate immutable measurement record. It identifies one deterministic Technique exercise instance and freezes its exercise specification, generated MusicXML, challenge profile, expected plan, raw MIDI, reused alignment/note/timing snapshots, Technique facets, novelty state, and engine versions. It has no Work, Arrangement, ScoreVersion, PracticeSession, or PerformanceAttempt identity. See `TECHNIQUE_LAB.md`.

## Mastery

Mastery Model `1.1.1` derives current command of one Arrangement from reliable/limited full-plan Notes, Rhythm, and Tempo summaries tied to its current immutable ScoreVersion. It keeps Control, currently supported repeated speed, consistency, distribution-aware recency, and confidence visible and uses a documented 55/30/15 formula before a modest recency factor. High confidence requires current effective session authority from the exact demonstrated-speed bucket, not only a raw historical session count. It is not a best Performance Score, artistic verdict, Work-level property, or automatic Repertoire status. A changed ScoreVersion begins a new evidence boundary. See `MASTERY_MODEL.md`.

## Skill Rating

Skill Model `1.1.1` derives exactly eight independent current Technique ratings from the exact current Technique engine pair. Attempt facets vote equally, repeated takes are bounded inside exact template-aware challenge contexts, and current confidence uses only retained context evidence with no-floor authority. Context identity and the displayed challenge envelope share one canonical module definition; non-tonal tonic values are starting pitches, not keys. There is no overall pianist rating, universal level, or scalar challenge difficulty. Historical Technique attempts remain unchanged. See `SKILL_MODEL.md`.

A SkillRating measures a transferable ability such as sight reading, rhythm, chord fluency, scales, or tempo control. It is independent of arrangement mastery.

## Practice Planning

Practice Planning `practice-planning-1.0.1` is a transient current-state projection for one Arrangement and exact current ScoreVersion at an explicit `asOf`. It combines supported frozen section evidence, current Mastery `1.1.1`, and independent Skill Ratings `1.1.1` into ordered actions with exact evidence provenance. A planning section is identified by ScoreVersion, exact measure-index bounds, and canonical source-measure IDs—not by display text or an attempt-local SectionResult ID. Its context and result expose one identical resolved policy, and each composed block identifies every recommendation it represents plus applicable speed provenance.

Planning is not a persisted entity, score, grade, repertoire status, or historical attempt. It may suggest practice and speed changes but never applies them. Technique targets are independent evidence lanes and never imply that a Skill caused a repertoire error. See `PRACTICE_PLANNING.md`.

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

## Expression analysis result

`ExpressionAnalysisResult` is the immutable, versioned Phase 9 interpretation of authored expression for the same exact score, plan, recording, alignment, note grade, and grading scope. Its Dynamics result uses one performance-relative robust velocity context for explicit changes, wedges, and accents. Its separate Articulation result measures tempo-aware physical key duration and conservative slur transitions. Only correct note matches contribute; pitch mistakes reduce coverage rather than receiving another penalty. Both dimensions retain independent score, reliability, coverage, targets, exclusions, and diagnostics and never alter Phase 7 Practice Priority.

## Pedal analysis result

`PedalAnalysisResult` is the immutable, versioned Phase 10 interpretation of complete authored damper-pedal phrases against lossless MIDI CC64 evidence. It retains raw controller samples, effective binary transitions, exact scope and provenance, equal-weight phrase scores, independent reliability, controller-based damper-hold intervals, and neutral pedal/key interaction context. Unknown controller state remains unavailable; intermediate values never become invented acoustic half-pedal depth. Pedal never rewrites Phase 9 Articulation or Phase 7 Practice Priority.

## Voicing and reference comparison

`VoicingAnalysisResult` is Phase 11 evidence about performance-relative MIDI attack balance across deterministic part/staff/voice lanes. A score exists only for explicit, region-specific foreground/support intent. `ReferenceComparisonResult` compares two immutable interpretation profiles across exact score overlap and has no correctness or similarity score. Arrangement preferences choose intent and a default saved reference per ScoreVersion; V4 attempts freeze the exact preferences and reference metadata used, so later preference changes cannot alter history.

## PracticeSession and RepertoireEntry

A PracticeSession represents one mounted practice visit and may own multiple PerformanceAttempts. Its persisted span runs from the first saved take's recording start through the latest saved take's end, intentionally including time between takes in that visit. Practice time is that completed session span, so recording several takes does not multiply minutes and an idempotent retry cannot extend it. A RepertoireEntry is removable membership/status for an Arrangement; its Learning, Practicing, Performance Ready, or Completed status is explicitly user-controlled rather than inferred Mastery. Changing status mutates only that entry. Removing it preserves the underlying Work, Arrangement, ScoreVersions, sessions, and attempt history, and an exact re-import recreates only membership.

## Personal bests and progress

Personal bests are derived from immutable attempt summaries rather than stored counters. Headline comparisons require the same Arrangement, ScoreVersion, full-plan scope, practice-speed multiplier, and a reliable or limited aggregate. Provisional, unavailable, and partial takes remain visible in history but never become headline records. Notes, Rhythm, and Tempo have separate records; there is no overall personal best.
