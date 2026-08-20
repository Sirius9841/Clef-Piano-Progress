# Expected performance model

`NormalizedScore` preserves notation truth. It cannot itself be treated as a list of required key presses: rests, ties, grace notes, cue notes, and non-MIDI pitches have different performance semantics. `buildExpectedPerformancePlan` creates the explicit, application-owned bridge required by a future alignment engine.

## Fixed expectations

- An ordinary playable note creates one required attack and one logical sounding note.
- Required attacks at the same reduced, exact absolute `MusicalTime` form one deterministic onset group, including attacks from different voices and staves.
- A safe `start → stop+start → stop` tie chain creates one attack and one sounding span referencing every source note segment.
- A malformed tie is preserved conservatively as separate material with `AMBIGUOUS_TIE_CHAIN`; continuity is never guessed.
- Rests create no attack.

Every score-derived ID and ordering decision is deterministic for the same score, options, and part selection. IDs are stable references for future alignment; real recording IDs are intentionally unique instead.

## Flexible and excluded notation

Grace notes are flexible events anchored at their score position and, where safe, a following main attack. They are not placed in fixed onset groups. Cue notes remain explicit excluded events. A microtonal or otherwise non-MIDI pitch remains an unsupported event and is never rounded. Valid MIDI notes outside A0–C8 remain required but carry a piano-range flag.

## Parts and exact time

A one-part score is automatically usable, including a grand staff. A multi-part score requires explicit included-part IDs because orchestral parts must never be silently merged into the pianist's plan.

Onsets, ends, durations, and group positions remain exact rational quarter-note `MusicalTime`. Tempo conversion integrates exact score-time segments and produces a floating-point number only at the millisecond boundary.

## Tempo and speed

The derived tempo timeline distinguishes authored events from an explicit fallback. When no authored tempo begins at zero, the caller-provided fallback is inserted and reported. Same-position authored conflicts use last source order deterministically and emit a warning. Practice speed scales real duration without mutating the reference timeline: duration is divided by `0.5`, `0.75`, `1`, or `1.25`.

The model contains no note matching, timing tolerance, correctness, or grade. Phase 4 consumes it through the isolated alignment layer without changing those score-side semantics.
