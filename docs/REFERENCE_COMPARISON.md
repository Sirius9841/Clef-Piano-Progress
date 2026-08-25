# Interpretation-aware reference comparison

Phase 11 added `reference-comparison-1.0.0`. Phase 11.1 hardens current-intent Voicing, canonical scope bounds, paired-population Tempo centering, and Pedal compatibility in `reference-comparison-1.1.0`.

## Reference philosophy

A reference is an interpretation, example, and possible realization—not a correct answer, ideal performance, or expressive ground truth. Difference is not failure or evidence that one take is better.

## Supported source

Phase 11 accepts manually selected saved local Clef attempts only. It never automatically chooses the latest, highest-scoring, or personal-best take.

## Exact ScoreVersion compatibility

References must share the current Arrangement, exact immutable ScoreVersion, and canonical included-part set, and cannot be the current attempt itself. Changing ScoreVersion never silently remaps a reference preference.

## Scope overlap

Different practice speeds are allowed. Full and partial takes compare only the intersection of their exact score scopes; evidence outside that overlap is ignored and no overlap is unavailable. A full-plan profile spans score time zero through `ExpectedPerformancePlan.statistics.totalScoreDuration`, not merely through the last attack onset, so final score events such as a release after the last note onset remain eligible.

## Interpretation profile

The pure intermediate `InterpretationProfile` indexes frozen evidence by stable score provenance rather than recording-specific IDs:

- Tempo preserves raw `log(localTempoRatio)` until the two takes have been overlap-filtered and paired by stable score window.
- Dynamics uses frozen authored change, wedge, and accent observations paired by source IDs.
- Articulation uses frozen gate ratios or transition gaps relative to their tolerance.
- Pedal uses each frozen observation's timing error relative to that take's own aligned musical anchor, never absolute recording timestamps.
- Voicing uses the current user-configured intent for both takes and compares stable same-onset `focusAdvantage` evidence. A frozen V4 result is reused only when its intent snapshot is semantically equivalent to the current intent; otherwise the reference-side result is derived in memory for this comparison only.

A 120 BPM reference and 90 BPM current take can therefore have similar tempo shape when their relative rubato agrees. Global BPM may be context, never a quality penalty.

## Tempo-shape centering

The profile stores raw `log(localTempoRatio)`. Comparison first intersects scope, filters evidence, and pairs stable score windows. It then computes one median for each take over that exact shared population and centers the paired values. Unmatched or out-of-overlap samples therefore cannot shift either center. The comparison describes relative local stretching and acceleration after global speed is removed; recording-start silence remains outside this model because Phase 4's alignment offset already removes it.

## Dynamics comparison

Frozen authored dynamic changes, wedges, and accents pair through stable source IDs. Values are performance-relative normalized changes or trends, never absolute raw velocity.

## Articulation comparison

Frozen authored articulation targets pair through source-note provenance. Gate ratios and transition gaps are compared neutrally; literal conformity is not promoted to artistic truth.

## Pedal local-anchor comparison

Frozen pedal observations compare timing relative to each take's own aligned musical arrival. Absolute recording timestamps and recording-start silence never become reference differences. Direct Pedal comparison requires exact pedal-analysis engine-version equality. Even nearby versions such as 1.1.0 and 1.1.1 are unavailable because their timing-anchor semantics differ; equal versions remain comparable when shared evidence exists.

## Voicing comparison

Both profiles use the current ScoreVersion-specific Voicing intent. Intent equivalence ignores preference IDs, timestamps, region IDs/order, and lane-set ordering, but preserves ScoreVersion, measure ranges, and foreground/support role meaning. If current intent is null, reference Voicing is unavailable even when an old V4 attempt has configured frozen Voicing. Stable same-onset targets compare `focusAdvantage`; Clef never infers which lane the reference performer considered melody.

## Partial historical coverage

V1 references provide frozen Timing only; V2 adds frozen Dynamics/Articulation; V3 adds frozen Pedal; V4 can provide Voicing under the current intent. Phase 11.1 may derive comparison-only Voicing for V2/V3/V4 from immutable correct-match expression evidence and the current intent, recording the current Voicing engine in the prepared profile. Semantically equivalent V4 intent reuses the exact frozen result and frozen engine provenance. Neither path mutates the attempt, and historical pages always render the original frozen V4 panels. Missing dimensions remain unavailable without making other dimensions unavailable.

Historical Notes, Timing, Expression, and Pedal are never rerun or rewritten.

## No aggregate score

Each dimension reports shared coverage, reliability, neutral signed differences, similarity descriptors, and text such as “your cadence stretches more strongly.” Different never means wrong, worse, or failed. The UI uses neutral cards and an accessible native-SVG centered tempo-shape chart.

The public result deliberately has no aggregate score, accuracy, similarity percentage, quality score, Musicality score, personal best, or trend.

## Versioning and persistence

New comparisons use `reference-comparison-1.1.0`; frozen V4 `reference-comparison-1.0.0` snapshots remain readable and are never upgraded. V4 reads deeply validate Voicing lanes, targets, observations, target references, counts, coverage, finite numeric values, and every reference dimension/observation before accepting the snapshot. One optional default reference attempt ID is stored per ScoreVersion in Arrangement preferences. Preference changes never mutate historical attempts, and no new IndexedDB store or migration is required.

## Future reference sources

There is no audio/microphone import, external provider, commercial recording ingestion, or cross-ScoreVersion mapping. Future licensed/imported sources may add compatible profiles later without changing the principle that references are alternatives.
