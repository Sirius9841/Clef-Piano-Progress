# Technique Lab

Phase 12.3 closes the evidence and notation integrity of the eight measured Technique modules: Sight reading, Rhythm, Chord fluency, Scales, Arpeggios, Octaves, Keyboard jumps, and Tempo control. Technique remains a separate product domain. A `TechniqueAttemptRecord` is never a Work, Arrangement, ScoreVersion, PracticeSession, or PerformanceAttempt.

## Versioned exercise identity

New exercises use `technique-exercise-1.1.1`. The normalized spec includes the module, template, explicit seed, tonic, precise mode (`major` or `natural-minor`), numeric target tempo, direction, octave span, subdivision, inversion, jump span, numeric tempo shape, event/repetition count where applicable, and user-declared hand context. Every musically relevant field contributes to the stable exercise-instance identity. The same normalized spec produces the same events, MusicXML, challenge profile, plan, and ID; changing a relevant field changes the ID.

Scale and arpeggio event counts are derived from musical range and direction. A one-octave up-and-down scale has 15 events and one true turn; a one-octave up-and-down arpeggio has seven. Keyboard-jump metadata distinguishes distant landing transitions from immediate recovery transitions. Tonal modules emit canonical major/natural-minor key signatures and key-aware enharmonic spelling (for example E-sharp in F-sharp major and flats in D-flat major); neutral non-tonal drills use C major notation. Generated MusicXML escapes text, uses exact parsed event pitches, and splits long exercises into structurally timed measures before passing through the application-owned MusicXML parser and expected-performance builder. OSMD remains a renderer only.

The challenge snapshot exposes tonic, mode, declared hand context, target BPM, event count, octave span, direction, subdivision, inversion, jump distance, tempo shape, exact duration, pitch range, chord/jump size, density, and authored tempo changes. Declared hand is user metadata only: MIDI cannot determine which physical hand played a note.

## Evidence semantics

New analysis uses `technique-analysis-1.1.2`. It consumes the frozen Alignment, NoteGrading, and TimingAnalysis snapshots and never reparses, realigns, or regrades. Before evidence preparation or module dispatch, the generated event count, exact positions, and MIDI multisets must match the aligned expected groups, and recording/alignment, note, timing, and novelty identities must describe the same take. A mismatch returns a deeply frozen deterministic unavailable result with the expected module facets, no observations/findings, and a warning. Technical interval evidence requires two adjacent, perfect correct-note groups. Wrong, missed, additional, ambiguous, and gap-bridged groups cannot become timing zeroes. Sparse evidence is unavailable rather than a fake zero.

Facets are independent measurements with explicit observation provenance, evidence family, context, minimum evidence, coverage, reliability, and exact challenge. They are not aliases:

- Rhythm precision symmetrically measures authored interval proportions; pulse continuity focuses on abnormal expansion or hesitation.
- Scale and octave evenness removes global speed offset with robust attempt-local centering; scale turn continuity uses only the actual turn neighborhood.
- Arpeggio consistency preserves register-boundary provenance.
- Chord accuracy gives one complete authored chord one vote; synchronization uses only complete correct chords and gives each chord one spread vote.
- Jump landing accuracy, distant-transition consistency, and post-landing recovery use separate event/transition populations.
- Target-tempo accuracy, attempt-local tempo stability, and authored numeric tempo-trajectory control remain separate.
- Sight reading exposes note accuracy and pulse continuity with `first-pass` or `repeat-practice` context. Novelty is eligibility metadata, not a third composite score.

The attempted span is the inclusive region between the first and last trustworthy reached aligned score positions. Untouched leading and trailing regions produce no pitch votes; wrong or missed events inside that span remain zero-valued pitch evidence. Completion separately reports actual authored-event coverage and the furthest reached span, so playing the first and final events may reach the end without creating full event coverage.

Facet coverage is trustworthy scored observations divided by attempted authored opportunities for that facet. Thus 8 trustworthy chord-spread observations from 20 attempted chords are 40% coverage, while wrong chords remain owned by Chord Accuracy and are not scored a second time as synchronization zeroes. Interval, jump, recovery, and turn denominators likewise use attempted relevant transitions rather than full-exercise length or the already-safe evidence population. Facet-specific coverage, overall event coverage, observation minima, and provisional correspondence all participate in reliability; a low score with strong coverage may still be reliable, while high but sparse evidence may not.

Tempo follows the same separation. A pure score-side helper shared with TimingAnalysis selects the established local-tempo window geometry without changing the TimingAnalysis engine. Technique rebuilds those windows only inside the attempted span. Target-tempo and stability coverage use attempted authored windows as the denominator; exact start/end expected-group IDs map surviving `LocalTempoSample`s to those opportunities. An unmappable sample is excluded, so an interior wrong or missing anchor lowers coverage but never adds a zero. Tempo-transition coverage uses adjacent authored window pairs whose numeric target delta meets the existing threshold; a missing middle sample can remove two observations while both attempted transitions remain opportunities. Steady drills have no transition opportunities, so that facet is unavailable rather than zero. Tempo scores describe the quality of trustworthy samples, coverage describes evidence completeness, completion describes the take, and reliability describes confidence—not performance quality.

Technical exactness is appropriate here because exactness is the declared exercise objective. It does not redefine repertoire performance: coherent rubato and interpretive timing remain contextual rather than errors merely for departing from a metronomic realization.

There is no overall Technique score, Skill Rating, Mastery, Performance Score, personal best, or headline trend. Phase 12.3 does not infer fingering, actual physical hand use, tension, relaxation, biomechanics, injury risk, acoustic tone, velocity quality, or pedal quality.

## Persistence and history

IndexedDB remains schema 4 with the existing `techniqueAttempts` and rebuildable `techniqueAttemptSummaries` stores. Phase 12 `TechniqueAttemptRecordV1` and legacy summaries remain exact frozen `1.0.0` history. V2 history accepts only three explicit exercise/analysis pairs: `1.1.0/1.1.0`, `1.1.1/1.1.1`, and current `1.1.1/1.1.2`. New V2 records keep `technique-exercise-1.1.1` and use `technique-analysis-1.1.2`; arbitrary versions and mixed pairs are corrupt. No V3 record shape or schema migration is introduced. V2 preserves generator/analysis engines, complete challenge, completion, novelty, and facet provenance for future summary-only aggregation.

Full attempts and derived summaries save atomically. Before writing, persistence requires the frozen generated events and ExpectedPerformancePlan onset groups to have identical counts, exact positions, and MIDI multisets/cardinality; the plan must contain only `P1`, and the recording score identity must equal the plan score identity. It validates the explicit supported V2 engine pairs rather than accepting arbitrary `1.1.x` values. An exact retry is idempotent; reusing an attempt ID with different frozen content is an immutable-record integrity failure. The transaction rechecks sight-reading novelty. Reads use engine-specific deep validation and surface malformed records as typed `CORRUPT_RECORD` failures. Missing or corrupt summaries are never silently rebuilt during navigation.

Phase 13 may consume only these frozen, validated summary snapshots. It must not regenerate, reanalyze, or reinterpret historical Technique attempts.

`/technique/history/:attemptId` renders the exact V1 or V2 snapshot and labels its saved engine versions. Historical records are never regenerated, rewritten, or silently analyzed with current semantics. Technique history remains separate from repertoire progress, practice time, and Notes/Rhythm/Tempo personal bests.
