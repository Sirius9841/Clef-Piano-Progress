# Technique Lab

Phase 12 adds eight measured Technique modules: Sight reading, Rhythm, Chord fluency, Scales, Arpeggios, Octaves, Keyboard jumps, and Tempo control. Technique is a separate product domain. A `TechniqueAttemptRecordV1` is never a Work, Arrangement, ScoreVersion, PracticeSession, or PerformanceAttempt.

## Exercise identity and compilation

Every exercise starts from an explicit `TechniqueExerciseSpec`: module, template, seed, tonic/mode, numeric target tempo, event count, direction, octave span, subdivision, inversion, jump span, and numeric tempo shape. `technique-exercise-1.0.0` deterministically generates event material and MusicXML. That XML goes through the existing application-owned MusicXML parser and expected-performance builder. OSMD only renders the resulting notation; it is not exercise or analysis truth.

The stable exercise-instance identity includes the entire specification and generated event sequence. Challenge metadata preserves target BPM, event count, exact score duration, expected milliseconds, pitch range/span, maximum chord and jump sizes, density, subdivision, tempo changes, octave span, and module-specific parameters. There is deliberately no scalar “difficulty” value.

## Evidence semantics

The workspace records real Web MIDI, then reuses the Phase 4 alignment, Phase 5 full-plan note grade, and Phase 6 timing analysis. `technique-analysis-1.0.0` consumes those immutable snapshots and never reparses, realigns, or regrades. Missing, wrong, additional, and unsafe pitch evidence cannot create a second timing penalty: interval facets use only adjacent perfect correct-note groups. Sparse evidence is unavailable, never zero.

Each module exposes only relevant, stable facets. Examples include Note accuracy, Pulse continuity, Chord synchronization, Octave integrity, Landing accuracy, Target-tempo control, and Tempo-transition control. Every facet carries its own status, reliability, coverage, evidence count, and exact challenge profile. Facets are not combined into an overall Technique score, Skill Rating, Mastery value, Performance Score, personal best, or headline trend.

Sight-reading novelty is identity-based and local-first. The first saved attempt for an exact generated instance may expose `sight-reading-first-pass`; later saves of that instance suppress that facet. Repeats still produce ordinary pitch and timing facets. Changing a seed creates a different instance, but no claim is made that it is perceptually novel to the player.

Phase 12 does not infer fingering, physical hand use, tension, relaxation, biomechanics, injury risk, acoustic tone, generic velocity quality, or pedal quality.

## Persistence and history

IndexedDB schema 4 adds `techniqueAttempts` and rebuildable `techniqueAttemptSummaries`, indexed by performed time, module, template, and exercise instance. Full attempt and summary save atomically and retry idempotently by attempt ID. The full record freezes the exact spec, generated XML, parser version, ExpectedPerformancePlan, lossless recording, AlignmentResult, NoteGradingResult, TimingAnalysisResult, TechniqueAnalysisResult, novelty state, challenge, and engine versions.

`/technique/history/:attemptId` reads those frozen snapshots and never silently reanalyzes them. Local clear includes both Technique stores. Technique summaries do not alter repertoire progress, practice-session time, or Notes/Rhythm/Tempo personal bests.
