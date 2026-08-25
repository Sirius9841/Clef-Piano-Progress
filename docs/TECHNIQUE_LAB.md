# Technique Lab

Phase 12.1 hardens the eight measured Technique modules: Sight reading, Rhythm, Chord fluency, Scales, Arpeggios, Octaves, Keyboard jumps, and Tempo control. Technique remains a separate product domain. A `TechniqueAttemptRecord` is never a Work, Arrangement, ScoreVersion, PracticeSession, or PerformanceAttempt.

## Versioned exercise identity

New exercises use `technique-exercise-1.1.0`. The normalized spec includes the module, template, explicit seed, tonic, precise mode (`major` or `natural-minor`), numeric target tempo, direction, octave span, subdivision, inversion, jump span, numeric tempo shape, event/repetition count where applicable, and user-declared hand context. Every musically relevant field contributes to the stable exercise-instance identity. The same normalized spec produces the same events, MusicXML, challenge profile, plan, and ID; changing a relevant field changes the ID.

Scale and arpeggio event counts are derived from musical range and direction. A one-octave up-and-down scale has 15 events and one true turn; a one-octave up-and-down arpeggio has seven. Keyboard-jump metadata distinguishes distant landing transitions from immediate recovery transitions. Generated MusicXML escapes text, uses exact parsed event pitches, and splits long exercises into structurally timed measures before passing through the application-owned MusicXML parser and expected-performance builder. OSMD remains a renderer only.

The challenge snapshot exposes tonic, mode, declared hand context, target BPM, event count, octave span, direction, subdivision, inversion, jump distance, tempo shape, exact duration, pitch range, chord/jump size, density, and authored tempo changes. Declared hand is user metadata only: MIDI cannot determine which physical hand played a note.

## Evidence semantics

New analysis uses `technique-analysis-1.1.0`. It consumes the frozen Alignment, NoteGrading, and TimingAnalysis snapshots and never reparses, realigns, or regrades. Technical interval evidence requires two adjacent, perfect correct-note groups. Wrong, missed, additional, ambiguous, and gap-bridged groups cannot become timing zeroes. Sparse evidence is unavailable rather than a fake zero.

Facets are independent measurements with explicit observation provenance, evidence family, context, minimum evidence, coverage, reliability, and exact challenge. They are not aliases:

- Rhythm precision symmetrically measures authored interval proportions; pulse continuity focuses on abnormal expansion or hesitation.
- Scale and octave evenness removes global speed offset with robust attempt-local centering; scale turn continuity uses only the actual turn neighborhood.
- Arpeggio consistency preserves register-boundary provenance.
- Chord accuracy gives one complete authored chord one vote; synchronization uses only complete correct chords and gives each chord one spread vote.
- Jump landing accuracy, distant-transition consistency, and post-landing recovery use separate event/transition populations.
- Target-tempo accuracy, attempt-local tempo stability, and authored numeric tempo-trajectory control remain separate.
- Sight reading exposes note accuracy and pulse continuity with `first-pass` or `repeat-practice` context. Novelty is eligibility metadata, not a third composite score.

Completion separates actual authored-event coverage from the furthest reached span. Playing the first and final events may reach the end but does not create full event coverage. Facet-specific observation minima and actual coverage prevent tiny cherry-picked fragments from producing reliable claims.

Technical exactness is appropriate here because exactness is the declared exercise objective. It does not redefine repertoire performance: coherent rubato and interpretive timing remain contextual rather than errors merely for departing from a metronomic realization.

There is no overall Technique score, Skill Rating, Mastery, Performance Score, personal best, or headline trend. Phase 12.1 does not infer fingering, actual physical hand use, tension, relaxation, biomechanics, injury risk, acoustic tone, velocity quality, or pedal quality.

## Persistence and history

IndexedDB remains schema 4 with the existing `techniqueAttempts` and rebuildable `techniqueAttemptSummaries` stores. Phase 12 `TechniqueAttemptRecordV1` and legacy summaries remain exact frozen `1.0.0` history. New `TechniqueAttemptRecordV2` and `TechniqueAttemptSummaryV2` use schema version 2 and preserve generator/analysis engines, complete challenge, completion, novelty, and facet provenance for future summary-only aggregation.

Full attempts and derived summaries save atomically. An exact retry is idempotent; reusing an attempt ID with different frozen content is an immutable-record integrity failure. The transaction rechecks sight-reading novelty. Reads use engine-specific deep validation and surface malformed records as typed `CORRUPT_RECORD` failures. Missing or corrupt summaries are never silently rebuilt during navigation.

`/technique/history/:attemptId` renders the exact V1 or V2 snapshot and labels its saved engine versions. Historical records are never regenerated, rewritten, or silently analyzed with current semantics. Technique history remains separate from repertoire progress, practice time, and Notes/Rhythm/Tempo personal bests.
