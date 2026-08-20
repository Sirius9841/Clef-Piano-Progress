# Correct-note grading

Phase 4 answers which expected and observed onset groups correspond. Phase 5 consumes that immutable `AlignmentResult` and answers a narrower grading question: were the expected physical piano keys played? It never independently realigns MIDI and does not judge timing, tempo, dynamics, articulation, duration, chord spread, or pedal use.

## Physical expected-key targets

Notation provenance and physical observability are different. If two simultaneous voices both contain C4, `ExpectedPerformancePlan` correctly preserves two notation attacks, but a piano exposes one C4 key. Phase 5 therefore derives one deterministic `ExpectedKeyTarget` per onset group and MIDI pitch. That target retains every source expected-attack ID, source-note ID, measure, part, staff, and voice.

Grace events remain flexible, cue events remain excluded, and unsupported microtonal pitches are never rounded into key targets. By default, valid MIDI pitches outside A0–C8 are preserved as excluded targets because a standard 88-key piano cannot produce them. None enters the note-score denominator.

## Result semantics

- **Correct:** Phase 4 supplied an exact MIDI-pitch correspondence for the physical target. Exact matches always win.
- **Wrong pitch:** after exact matches are removed inside one already aligned onset-group correspondence, a nearby performed attack is a plausible replacement for an expected target.
- **Missed:** an in-scope expected target has neither an exact match nor an accepted substitution.
- **Additional / Extra:** an in-scope performed attack is unused by exact or wrong-pitch correspondence.
- **Unattempted:** a gradeable expected target lies outside the selected scope.
- **Excluded:** the expectation is explicitly ungradeable under current policy.

Wrong-pitch assignment is an exact minimum-total-semitone-distance subset search within the small chord-sized leftover set. The default accepts distances up to three semitones plus an explicit ±12-semitone wrong-octave case. Larger distances remain missed plus additional. Equal optimal assignments resolve deterministically and carry ambiguous confidence; groups above the assignment guardrail receive no speculative pairing. Pitch distance provides provenance, never partial correctness credit.

Example:

```text
Expected:  C4  E4  G4
Played:    C4  F4  G4  Bb4
Result:    ✓   E4→F4  ✓   +Bb4
```

C4 and G4 are exact. E4/F4 is a likely one-semitone substitution. Bb4 remains additional.

## Grading scopes

**Played section** (`aligned-span`) is the safe default. The first and last credible expected/performed correspondences bound the graded region. Internal expected-only groups become missed and internal performed-only groups become additional, while untouched material before or after the span stays unattempted. A correspondence is credible for scope when it has an exact pitch pair or at least one leftover pitch within the conservative substitution policy.

**Full score** (`full-plan`) expresses whole-piece intent. Every gradeable expected target is in scope, so unplayed beginning and ending material may become missed and all recorded attacks are considered. An empty full-plan take can therefore produce a real zero note score; an aligned-span take with no credible correspondence is unavailable instead of displaying a false zero.

An aligned Phase 4 result produces reliable grading. An ambiguous or structurally incomplete alignment may produce a clearly labelled provisional result. Failed alignment guardrails and input-ID mismatches remain unavailable.

## Precision, recall, and note score

Let `C` be correct targets, `W` wrong-pitch substitutions, `M` missed targets, and `A` additional attacks.

```text
precision = C / (C + W + A)
recall    = C / (C + W + M)
noteScore = 2 × precision × recall / (precision + recall)
          = 2C / (2C + 2W + M + A)
```

Simple `correct / expected` would not penalize random additional notes. Precision handles wrong and additional performed attacks; recall handles wrong and missed expected targets; F1 balances both. A wrong-pitch substitution appears in both denominators because it is one unsatisfied expected target and one non-correct performed attack. Canonical values remain unrounded from zero to one; the UI presents percentages.

## Current limitations

- Wrong-pitch intent is inferred only inside an existing Phase 4 group correspondence; the grader never pairs across groups.
- One expected onset group still cannot align to multiple widely spread performed groups.
- Very large or highly ambiguous chords may remain missed plus additional rather than receive speculative substitutions.
- Extremely ambiguous repeated sections inherit Phase 4's provisional correspondence limits.
- Flexible grace-note correctness needs a future flexible-event alignment strategy.
- The UI deliberately avoids notation coloring and measure heatmaps until Phase 7.

Engine version `1.0.0` is centralized so future persisted attempts can retain historical grading semantics.
