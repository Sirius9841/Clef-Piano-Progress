# Interpretation-aware reference comparison

Phase 11 adds `reference-comparison-1.0.0`.

## Reference philosophy

A reference is an interpretation, example, and possible realization—not a correct answer, ideal performance, or expressive ground truth. Difference is not failure or evidence that one take is better.

## Supported source

Phase 11 accepts manually selected saved local Clef attempts only. It never automatically chooses the latest, highest-scoring, or personal-best take.

## Exact ScoreVersion compatibility

References must share the current Arrangement, exact immutable ScoreVersion, and canonical included-part set, and cannot be the current attempt itself. Changing ScoreVersion never silently remaps a reference preference.

## Scope overlap

Different practice speeds are allowed. Full and partial takes compare only the intersection of their exact score scopes; evidence outside that overlap is ignored and no overlap is unavailable.

## Interpretation profile

The pure intermediate `InterpretationProfile` indexes frozen evidence by stable score provenance rather than recording-specific IDs:

- Tempo centers `log(localTempoRatio)` by the take's median, separating global speed from local shape.
- Dynamics uses frozen authored change, wedge, and accent observations paired by source IDs.
- Articulation uses frozen gate ratios or transition gaps relative to their tolerance.
- Pedal uses each frozen observation's timing error relative to that take's own aligned musical anchor, never absolute recording timestamps.
- Voicing uses the current user-configured intent for both takes and compares stable same-onset `focusAdvantage` evidence.

A 120 BPM reference and 90 BPM current take can therefore have similar tempo shape when their relative rubato agrees. Global BPM may be context, never a quality penalty.

## Tempo-shape centering

The profile centers `log(localTempoRatio)` by each take's median before pairing stable score windows. The comparison therefore describes relative local stretching and acceleration after global speed is removed.

## Dynamics comparison

Frozen authored dynamic changes, wedges, and accents pair through stable source IDs. Values are performance-relative normalized changes or trends, never absolute raw velocity.

## Articulation comparison

Frozen authored articulation targets pair through source-note provenance. Gate ratios and transition gaps are compared neutrally; literal conformity is not promoted to artistic truth.

## Pedal local-anchor comparison

Frozen pedal observations compare timing relative to each take's own aligned musical arrival. Absolute recording timestamps and recording-start silence never become reference differences. Pedal 1.0 global-clock and modern 1.1 local-anchor semantics are unavailable when a direct comparison would be unsafe.

## Voicing comparison

Both profiles use the current ScoreVersion-specific Voicing intent. Stable same-onset targets compare `focusAdvantage`; Clef never infers which lane the reference performer considered melody.

## Partial historical coverage

V1 references provide frozen Timing only; V2 adds frozen Dynamics/Articulation; V3 adds frozen Pedal; V4 adds frozen Voicing. Phase 11 may derive comparison-only Voicing for V2/V3 from immutable correct-match expression evidence and the current intent, recording the current Voicing engine, but historical pages never claim that Voicing originally existed. Missing dimensions remain unavailable without making other dimensions unavailable.

Historical Notes, Timing, Expression, and Pedal are never rerun or rewritten.

## No aggregate score

Each dimension reports shared coverage, reliability, neutral signed differences, similarity descriptors, and text such as “your cadence stretches more strongly.” Different never means wrong, worse, or failed. The UI uses neutral cards and an accessible native-SVG centered tempo-shape chart.

The public result deliberately has no aggregate score, accuracy, similarity percentage, quality score, Musicality score, personal best, or trend.

## Versioning and persistence

`reference-comparison-1.0.0` and its exact inputs are frozen in a V4 attempt. One optional default reference attempt ID is stored per ScoreVersion in Arrangement preferences. Preference changes never mutate historical attempts, and no new IndexedDB store or migration is required.

## Future reference sources

There is no audio/microphone import, external provider, commercial recording ingestion, or cross-ScoreVersion mapping. Future licensed/imported sources may add compatible profiles later without changing the principle that references are alternatives.
