# Advanced Voicing analysis

Phase 11 adds `voicing-analysis-1.0.0`, a pure analysis of configured foreground/support MIDI attack balance. It never reparses, realigns, regrades notes, or infers a melody.

## Inputs

The engine consumes the exact `NormalizedScore`, `ExpectedPerformancePlan`, `PerformanceRecording`, `AlignmentResult`, `NoteGradingResult`, `ExpressionAnalysisResult`, grading scope, ScoreVersion identity, and optional user intent. These immutable inputs must describe the same take and canonical included-part set.

## Voice lane identity

Voice lanes are deterministic `(partId, staff, voice)` identities with human labels such as “Piano · Staff 1 · Voice 1.” Pitch height, staff number, hand, voice number, and loudness never determine musical role. A lane with unspecified staff or voice remains descriptive and cannot be selected for scoring.

## Why melody is never guessed

Notation voice and staff are structural provenance, not guaranteed melody labels. Register and performed loudness are interpretation evidence, not score intent. Clef therefore never promotes the highest note, upper staff, right hand, Voice 1, or loudest lane to melody automatically.

## User-defined intent regions

`VoicingIntentProfile` is an explicit, ScoreVersion-specific preference. Non-overlapping measure regions each select at least one foreground and one support lane; the sets cannot overlap and every lane must exist in that exact score version. Importing another ScoreVersion never transfers old lane identities automatically.

## Same-onset target policy

The initial scored policy uses exact score-simultaneous cross-lane attacks only. One onset produces one musical target regardless of chord size. Phase 5 physical-key identity remains authoritative: a key carrying both foreground and support provenance is ambiguous, and a target with any wrong, missed, or unavailable required key loses coverage rather than receiving another penalty.

## Physical-key identity

Simultaneous duplicate notation pitches collapse to the same observable piano key while retaining their source-note provenance. A target is analyzed only when every required foreground and support physical key has one correct Phase 5 match with safe normalized velocity evidence.

## Relative velocity normalization

Voicing reuses Phase 9's one-attempt Q10/Q90 `normalizedIntensity`. Within one complete target it takes the median foreground and support intensities, then computes `focusAdvantage = foregroundIntensity - supportIntensity`.

It never maps MIDI velocity to acoustic loudness and never normalizes foreground/support lanes independently.

## Projection scoring

The versioned continuous heuristic maps approximately `-0.08` to poor projection, `0` to balanced, and `+0.08` to clearly projected. Larger separation receives no additional reward. The final score is the arithmetic mean of analyzed configured events, never raw-note or chord-size weighting.

## Dynamic and accent conflict exclusions

Lane-specific dynamics, asymmetric accents, and incompatible lane-specific wedges are conservatively excluded so generic Voicing does not fight or duplicate authored Dynamics. Global markings affecting both sides remain compatible.

## Coverage and reliability

Without explicit intent, Clef reports neutral lane sample counts and median relative intensity, while `score` remains null. `reliable` requires full-plan, trustworthy correspondence, at least three analyzed targets, and at least 70% coverage. Sparse or aligned-span evidence is `limited`, ambiguous correspondence is `provisional`, and absent safe evidence is `unavailable`.

Wrong and missed notes lower coverage; they never receive a second Voicing penalty.

## Limitations

MIDI attack balance is not acoustic loudness, tonal projection, timbre, or artistic quality. Phase 11 has no automatic melody detection, audio model, broad asynchronous accompaniment scoring, Voicing personal best/trend, Practice Priority change, or overall score.
