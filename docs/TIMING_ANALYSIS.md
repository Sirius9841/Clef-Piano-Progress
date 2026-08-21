# Rhythm and tempo analysis

Phase 6 answers two separate questions from one immutable `AlignmentResult`:

- **Rhythm:** were local written timing relationships preserved?
- **Tempo:** how closely and consistently did the performance follow the effective target speed?

The pure engine consumes `ExpectedPerformancePlan`, `PerformanceRecording`, `AlignmentResult`, and `NoteGradingResult`. It never realigns MIDI, reparses MusicXML, uses OSMD, or calculates inside React.

## Slow can still be rhythmic

```text
Target intervals:     500, 500, 500 ms
Performed intervals:  600, 600, 600 ms
```

Every performed interval is 20% longer, so the performance is slower. The proportions are still exact. Rhythm can therefore remain excellent while Tempo is lower. Treating the accumulating difference from the original timestamps as rhythm error would conflate two musical concepts.

Phase 4 provides the canonical coarse transform:

```text
performedMs ≈ offsetMs + timeScale × effectiveReferenceMs
```

Recording-start silence is absorbed by `offsetMs`. A robust median of structurally continuous local interval scales normalizes Phase 6 rhythm so one long pause cannot distort every otherwise steady interval. Phase 4's transform remains unchanged and remains the global tempo source.

## Rhythm observations

Each in-scope group correspondence preserves expected/performed group IDs, exact `MusicalTime`, measure context, reference and observed timestamps, Phase 4 prediction/residual, anchor quality, chord spread, and interval evidence.

Anchor policy is deterministic:

- a correspondence with an exact pitch pair, reasonable pitch cost, and bounded spread is a strong timing anchor;
- a Phase 5 wrong-pitch substitution may remain a usable rhythm observation;
- structurally weak or extremely spread correspondences are excluded.

Missing or additional groups break the affected adjacent interval. They are not charged again as rhythm mistakes. Grace events remain outside fixed timing analysis. One expected chord contributes one group onset; its internal `spreadMs` is reported separately and does not reduce the rhythm score.

For adjacent structurally continuous observations:

```text
referenceInterval = currentReferenceMs − previousReferenceMs
predictedInterval = referenceInterval × rhythmNormalizationTimeScale
performedInterval = currentObservedMs − previousObservedMs
logRatioError     = ln(performedInterval / predictedInterval)
```

The logarithm is symmetric: an interval twice as long and one half as long have equal-magnitude opposite errors.

## Human timing tolerance and rhythm score

The allowed deviation is the maximum of:

- a 22 ms absolute floor;
- 4% of the local performed beat duration;
- 3.5% of the predicted interval.

These are centralized first-pass piano defaults, not scientific final values. They can later vary by player, difficulty, or practice mode.

Errors inside tolerance receive no meaningful loss. Outside tolerance, a smooth bounded loss grows continuously. The final rhythm score combines 65% median loss with 35% trimmed-mean loss. This prevents one pause from dominating while still penalizing repeated uneven timing. Diagnostics expose observation count, median absolute normalized error, median residual, tolerance coverage, measure aggregates, and the largest interval issues.

## Effective target tempo

Numeric tempo evaluation uses the Phase 3 effective timeline. If the score says quarter note = 80 and Practice is set to 75%, the target is 60 BPM. The practice multiplier is already represented in alignment reference milliseconds and is not applied twice.

Authored numeric changes remain piecewise authoritative. If no numeric tempo begins the selected score, the explicit fallback remains labelled `fallback`; it is never presented as a composer marking.

Phase 4's time scale and performed tempo ratio are inverses:

```text
timeScale = 1.25
tempoRatio = 1 / 1.25 = 0.8
target 80 BPM → estimated 64 BPM
```

For variable-tempo music, one BPM is only a summary. The result retains every numeric region and exposes the global ratio instead of claiming the whole piece had one constant target.

## Local tempo, stability, and trend

Local tempo samples use strong anchors across a musical-time window of approximately one quarter-note beat, with at least two anchors. Each sample compares performed elapsed time with the already piecewise-integrated effective reference time:

```text
localTimeScale = performedInterval / effectiveReferenceInterval
localTempoRatio = 1 / localTimeScale
performedBpm = localTargetBpm × localTempoRatio
```

Because reference intervals already include numeric tempo changes, correctly following 120 → 60 BPM produces ratios near 1 in both regions. Stability is a robust median absolute log deviation around the median local ratio. Rushing/dragging uses a deterministic Theil–Sen trend across enough samples, not one early or late note.

Tempo score is transparent:

- 60% target-speed accuracy when available;
- 40% local stability when available.

Each component uses a smooth percentage tolerance. When stability lacks evidence, the score uses the available accuracy component and reliability is labelled limited.

## Qualitative expressive directions

MusicXML words are preserved as structured `ritardando`, `accelerando`, or `a-tempo` events with exact position and source text.

- `rit.` and `rall.` look conservatively for a downward local-tempo trend.
- `accelerando` looks for an upward trend.
- `a tempo` checks whether later samples return near the established numeric effective tempo.
- insufficient samples produce `insufficient-data`, never a failure claim.

A marking such as `rit.` does not define one exact tempo curve. Phase 6 therefore reports directional behavior separately from the numeric tempo score and explicitly sets `exactNumericCurveAvailable: false`. It never invents “expected 68 BPM here.” A future licensed or user-provided performance reference may supply an expressive curve, but reference-performance analysis is not implemented.

## Scope, reliability, and limitations

Timing copies the Phase 5 `aligned-span` or `full-plan` scope. Only in-scope matched correspondences participate; unperformed regions never create timing penalties. Reliable alignment can produce reliable timing, ambiguous alignment is provisional, two matched onsets are limited evidence, and one or zero matched onsets are unavailable rather than a false zero.

Current limitations:

- sparse passages yield fewer and wider local-tempo windows;
- qualitative markings support broad direction only, not exact expressive interpretation;
- grace-note timing remains excluded;
- intentionally rolled-chord interpretation is not inferred, so spread stays diagnostic;
- reference-performance expressive timing is not implemented;
- no dynamics, articulation, pedal, overall score, persistence, mastery, or heatmap exists in this phase.

Engine version `1.0.0` is centralized so future persisted attempts can reproduce these semantics.
