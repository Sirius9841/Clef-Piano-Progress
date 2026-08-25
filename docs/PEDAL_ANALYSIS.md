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

The pure engine version is `pedal-analysis-1.0.0`. It validates exact score, plan, recording, alignment, note-grade, expression, scope, and included-part provenance. It reuses the Phase 4 affine transform—both offset and scale—and the existing practice-speed tempo timeline. It never reparses, realigns, regrades, mutates Phase 9 Articulation, or depends on React, IndexedDB, or OSMD.

## Authored phrases

MusicXML parser `musicxml-parser-1.2.0` preserves pedal start, stop, change, and continue directions with exact position, measure onset/number, part, staff, and voice. A start followed by zero or more change/continue events and one compatible stop forms one phrase. Continue is structural rather than a separate timing target. Null staff or voice is a conservative wildcard; explicit incompatible lanes never pair. Orphans, overlaps, and unclosed phrases are deterministic exclusions.

Aligned-span analysis admits only complete phrases wholly inside the exact NoteGrading scope. A phrase crossing either boundary is excluded rather than partially guessed.

## Controller timeline and scoring

Every raw CC64 value is retained in `(relativeMs, sequence)` order. Threshold-stable streams such as `64 → 80 → 127` produce one effective down transition, and `127 → 90 → 63` produces one up transition. Intermediate values establish `continuous-evidence`, but do not imply calibrated half-pedal depth or acoustic behavior. Binary-like, continuous-evidence, and unknown controller histories remain distinct.

Starts, stops, and composite release/redown changes are matched monotonically and one-to-one. Timing tolerances scale from the local quarter-note duration with a conservative millisecond floor. Starts allow slightly more lateness than earliness; stops are approximately symmetric. Change timing and release/redown gap are graded continuously as one authored event. One phrase receives the mean of its gradeable subevents, and the final Pedal score is the arithmetic mean of analyzed phrase scores—never note-, duration-, or sample-weighted.

No controller evidence is unavailable, not zero. Once trustworthy CC64 evidence exists, a missing authored transition may receive zero. A final release too near recording stop is truncated/excluded. A known score-opening predepressed pedal may satisfy only that opening start, without invented timing precision, and caps reliability. Extra unnotated changes remain diagnostics rather than blanket errors.

## Damper hold and interaction context

For correctly matched physical keys, Phase 10 derives a damper-release interval from physical key release to the next observed pedal-up. If pedal is already up, extension is zero. If no later up exists, damper release remains null and the interval is marked open at recording end. These values are controller-derived damper intervals, not acoustic sound ends or durations.

Neutral interaction context may report a detached key continued by pedal or a positive slur key gap bridged by pedal. These observations never rewrite or double-penalize the frozen Phase 9 Articulation result.

## Reliability, persistence, and limits

Pedal independently reports reliable, limited, provisional, or unavailable evidence. Aligned-span scope, sparse phrases, low controller-state coverage, predepression, or truncation cap reliability; ambiguous correspondence is provisional. Unavailable values remain null.

New saves use `PerformanceAttemptRecordV3` and preserve the exact Pedal result and engine version beside the exact V2 expression snapshot. V1/V2 history is shown as “Pedal not analyzed” and is never reanalyzed. IndexedDB schema version remains 3 because no stores or indexes changed; AttemptSummary, personal bests, trends, Home, and Progress remain Notes/Rhythm/Tempo-only.

Phase 10 covers authored damper notation and MIDI CC64 only. It does not grade una corda/soft pedal, sostenuto, acoustic resonance, pedal noise, half-pedal depth, instrument polarity overrides, audio, voicing, reference performance, or overall musicality.
