# Performance results

Phase 7 turns the immutable Phase 4–6 analysis snapshots into a deterministic, measure-grounded practice map. It does not realign MIDI, regrade pitch, or reinterpret score notation.

```text
NormalizedScore ───────────────┐
ExpectedPerformancePlan ──────┼─→ buildPerformanceResults → PerformanceResults
AlignmentResult ──────────────┤
NoteGradingResult ────────────┤
TimingAnalysisResult ─────────┘
```

`buildPerformanceResults` is pure, framework-independent, versioned, and returns a deeply frozen result. It validates that every input belongs to the same score/plan/alignment/grading snapshot. An identity mismatch or unavailable note grade produces an explicit unavailable result; unavailable timing leaves note results usable and Rhythm/Tempo null.

## Measure identity and scope

One `MeasureResult` represents one written measure index across the included plan parts. A piano grand staff therefore remains one coherent measure result while retaining every source measure ID, part ID, staff, score event, expected attack, and source note ID needed by notation adapters.

Exact `MusicalTime` values define measure and section spans. Phase 7 preserves the Phase 5 grading scope:

- aligned span leaves surrounding measures `outside-scope` and never counts them as missed;
- full plan includes every gradeable expected target;
- insufficient evidence is distinct from a score of zero.

## Dimension aggregation

Notes, Rhythm, and Tempo remain independent dimensions.

Notes reuse Phase 5 classifications and recompute precision, recall, and F1 from combined physical-target counts. Simultaneous duplicate notation pitches remain one observable key target while every source note and expected attack stays mapped.

Rhythm aggregates the underlying Phase 6 interval losses. It applies the Phase 6 robust median/trimmed-mean policy to the selected measure or section; it never averages displayed percentages. An interval belongs to the measure containing its destination expected onset, including across a barline, so it is counted exactly once.

Tempo aggregates underlying local tempo samples and reports accuracy, stability, trend, and evidence. Numeric authored changes remain authoritative. If more than one effective target occurs in a region, the result exposes the target range and `targetVaries`; it does not publish a fabricated single BPM. Qualitative directions retain observation outcomes and never become invented numeric curves.

## Evidence and Practice Priority

Every measure and section exposes evidence counts and a confidence weight/category. Low evidence reduces confidence; it never becomes a fake zero.

Practice Priority is a ranking utility, not an overall Performance Score, Mastery value, or Skill Rating. Available dimensions use these configured weights:

```text
Notes   45%
Rhythm  35%
Tempo   20%
```

Missing dimensions are removed and the remaining weights are renormalized. The weighted deficit is then confidence-adjusted, so one thin observation cannot outrank equally weak, well-supported evidence merely because it is extreme.

## Sections and mistakes

Sections are four-measure sliding windows by default. Their metrics are rebuilt from underlying result IDs, counts, rhythm observations, and tempo samples. Weak and strong candidates use explicit confidence/evidence thresholds. Ranking is deterministic, and overlap suppression removes near-duplicate windows while allowing genuinely distinct regions.

The mistake index is ordered by exact musical position, type, provenance, and stable ID. It contains:

- wrong-pitch and missed expected targets;
- additional attacks, attributed only when correspondence or two-sided score context supports it;
- significant early/late rhythm intervals, attributed to the destination-onset measure;
- weak local tempo regions and unfollowed qualitative directions.

A one-sided performed-only attack remains unattributed and carries no invented measure, expected attack, or source-note ID.

## Renderer boundary and UI

`ScoreHighlightModel` is application-owned. It translates result provenance into selected measure ranges, problem source notes, and measure-level markers. The OSMD adapter may display this model, but OSMD objects never enter aggregation, grading, or mapping contracts. Correct notes are not painted by default, keeping notation readable.

Practice builds results from existing snapshots without rerecording, reparsing MusicXML, or rerunning alignment. The results experience provides independent dimension cards, four heatmap modes, selected-measure evidence, filtered previous/next mistake navigation, weak and strong section review, scope switching, and honest processing/unavailable/provisional states. Raw Phase 4–6 diagnostics remain available as secondary technical detail.

## Deferred work

Phase 7 remains session-only. It does not add persistence, historical trends, an overall Performance Score, Mastery changes, personal bests, dynamics, articulation, pedal grading, or transferable Skill Ratings.
