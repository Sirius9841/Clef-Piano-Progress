# Sustain pedal analysis

Phase 10 adds Pedal as a sixth independent, score-relative evidence dimension beside Notes, Rhythm, Tempo, Dynamics, and Articulation. It does not produce an overall Performance, Musicality, Mastery, or Skill score and does not change Phase 7 Practice Priority.

```text
NormalizedScore + ExpectedPerformancePlan + PerformanceRecording
       + AlignmentResult + NoteGradingResult + ExpressionAnalysisResult
                                  ↓
                            analyzePedal
                ↙                 ↓                  ↘
       authored phrases     CC64 timeline      damper/key context
```

The pure engine version is `pedal-analysis-1.1.1`. It validates exact score, plan, recording, alignment, note-grade, expression, scope, and included-part provenance. It reuses Phase 4 correspondence and its affine fallback—both offset and scale—plus the existing practice-speed tempo timeline. It never reparses, realigns, regrades, mutates Phase 9 Articulation, or depends on React, IndexedDB, or OSMD.

## Authored phrases

MusicXML parser `musicxml-parser-1.2.0` preserves pedal start, stop, change, and continue directions with exact position, measure onset/number, part, staff, and voice. A start followed by zero or more change/continue events and one compatible stop forms one phrase. Continue is structural rather than a separate timing target. Null staff or voice is a conservative wildcard; explicit incompatible lanes never pair. Orphans, overlaps, and unclosed phrases are deterministic exclusions.

Aligned-span analysis admits only complete phrases wholly inside the exact NoteGrading scope. A phrase crossing either boundary is excluded rather than partially guessed.

## Musical timing vs literal score time

Pedal timing is primarily evaluated against the locally aligned musical performance where safe. A pianist may intentionally delay or advance a harmonic arrival through rubato; Clef checks whether the pedal follows that performed musical event, not whether the performer stayed on a globally affine clock. This avoids penalizing in Pedal the same interpretive timing shape already described by Rhythm/Tempo.

The deterministic anchor hierarchy is:

1. an exact trustworthy aligned performed onset at the pedal score position;
2. tempo-aware interpolation between the immediately surrounding trustworthy aligned onsets within the configured score-distance window, using their canonical affine-clock milliseconds rather than raw quarter-position distance;
3. one-sided transfer of the nearest trustworthy aligned onset's local residual within that same conservative window;
4. the existing affine score-clock prediction when local evidence is missing, distant, ambiguous, performed-only, expected-only, or unsupported by an exact pitch pair.

For one-sided evidence, Clef computes the nearby onset's residual from its own affine score-clock prediction and adds that residual to the pedal target's separate global prediction. For example, a nearby note predicted at 2000 ms and performed at 2500 ms contributes a +500 ms residual; a pedal target predicted at 3000 ms is therefore anchored at 3500 ms, never snapped backward to the note's 2500 ms timestamp. This works with an onset before or after the target, while distance still lowers confidence and eventually forces global fallback.

Every modern 1.1 target and observation retains the selected source, global prediction, local selected time, their difference, alignment group provenance, and confidence. Local and global times are never blindly averaged. This freedom is not “anything goes”: pedal timing that is poorly coordinated with the performed harmony still scores poorly.

## Controller timeline and scoring

Every raw CC64 value is retained with channel identity in `(relativeMs, sequence)` order. Effective state and transitions are derived independently per MIDI channel: an up on channel 1 never releases channel 0. Threshold-stable streams such as `64 → 80 → 127` produce one effective down transition, and `127 → 90 → 63` produces one up transition. Intermediate values establish `continuous-evidence`, but do not imply calibrated half-pedal depth or acoustic behavior. Binary-like, continuous-evidence, and unknown controller histories remain distinct.

A normal single-CC64-channel recording uses that channel as authoritative for authored notation. The recording-start sustain snapshot is global at capture time and is assigned only when one authoritative channel can be established. Multiple CC64 channels remain independent and make authored-pedal ownership unavailable rather than being merged or inferred from pitch; same-channel damper context can still be derived safely.

Starts, stops, and composite release/redown changes use a bounded dynamic-programming sequence matcher with explicit match, missed-target, and skipped-extra operations. Candidate windows scale from the local quarter-note duration with a conservative millisecond floor. Far future gestures cannot be stolen by an earlier miss; changes consume one up/down pair atomically, and transitions remain one-use and chronological. Timing tolerances scale similarly. Starts allow slightly more lateness than earliness; stops are approximately symmetric. Change timing and release/redown gap are graded continuously as one authored event. One phrase receives the mean of its safely analyzed subevents, and the final Pedal score is the arithmetic mean of phrase scores with numeric evidence—never note-, duration-, or sample-weighted.

No controller evidence is unavailable, not zero. Once trustworthy CC64 evidence exists, a missing authored transition is analyzed as a real miss with score zero. A final release too near recording stop is truncated/excluded. A known score-opening predepressed pedal may satisfy only that opening start, without invented timing precision, and caps reliability. Extra unnotated changes remain skipped diagnostics rather than blanket errors.

Every phrase reports authored, analyzed, truncated, and unavailable event counts, event coverage, and `complete`, `partial`, or `unanalyzed` completeness. A start scored at 95% with a truncated stop may retain numeric start evidence, but it is a partial phrase at 1/2 event coverage—not a fully analyzed 95% phrase. Top-level coverage separately counts complete, partial, and unavailable phrases plus analyzed/authored events.

## Damper hold and interaction context

For correctly matched physical keys, Phase 10 derives a damper-release interval from physical key release to the next observed same-channel pedal-up. If that channel's pedal is already up, extension is zero. If no later same-channel up exists, damper release remains null and the interval is marked open at recording end. These values are controller-derived damper intervals, not acoustic sound ends or durations.

Neutral interaction context may report a detached key continued by pedal or a positive slur key gap bridged by pedal. These observations never rewrite or double-penalize the frozen Phase 9 Articulation result.

## Reliability, persistence, and limits

Pedal independently reports reliable, limited, provisional, or unavailable evidence. Aligned-span scope, sparse or partial phrases, low event/controller-state/local-anchor coverage, predepression, truncation, or unavailable events cap reliability; ambiguous correspondence is provisional and ambiguous multi-channel authored ownership is unavailable. Unavailable values remain null.

New saves use `PerformanceAttemptRecordV3` and preserve the exact Pedal result and engine version beside the exact V2 expression snapshot. Frozen V3 `pedal-analysis-1.0.0` records remain readable without additive 1.1 anchor/channel/coverage diagnostics, and frozen `pedal-analysis-1.1.0` records retain their original timing semantics; neither is reanalyzed. New V3 records use `pedal-analysis-1.1.1` with the existing modern 1.1 result shape. V1/V2 history is shown as “Pedal not analyzed.” IndexedDB schema version remains 3 because no stores or indexes changed; AttemptSummary, personal bests, trends, Home, and Progress remain Notes/Rhythm/Tempo-only.

Pedal is authored pedal-coordination fidelity evidence, not objective emotional or artistic quality. Maximum literal conformity is not maximum musical quality.

Phase 10 covers authored damper notation and MIDI CC64 only. It does not grade una corda/soft pedal, sostenuto, acoustic resonance, pedal noise, half-pedal depth, instrument polarity overrides, audio, voicing, reference performance, or overall musicality.
