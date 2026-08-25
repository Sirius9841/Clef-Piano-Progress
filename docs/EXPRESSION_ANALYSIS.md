# Dynamics and articulation analysis

Phase 9 adds two independent, score-relative expression dimensions. It does not create an overall Expression, Performance, Musicality, Mastery, or Skill score.

These dimensions describe authored fidelity evidence, not objective artistic quality. Dynamics evaluates authored contrast and direction without claiming one correct emotional curve; Articulation evaluates physical key behavior without claiming literal duration is the only expressive choice. Musically coherent interpretation may differ from a literal realization.

```text
NormalizedScore ────────────────┐
ExpectedPerformancePlan ───────┤
PerformanceRecording ──────────┼─→ analyzeExpression
AlignmentResult ────────────────┤          ├─ DynamicsAnalysis
NoteGradingResult ──────────────┘          └─ ArticulationAnalysis
```

The pure engine validates score, plan, recording, alignment, note-grading, scope, and included-part identity. It never reparses MusicXML, realigns MIDI, or depends on React, OSMD, or persistence. Only correctly matched Phase 5 physical-key targets become matched observations. Missed, wrong, additional, excluded, and outside-scope notes receive no second expression penalty; they reduce evidence coverage instead.

## Matched observation layer

Every correct match retains source-note and expected-attack IDs, physical target, performed attack, recorded key press, alignment group, part/staff/voice, measure, exact score position, MIDI pitch, velocity, attack/release times, and expected duration. IDs and ordering are deterministic, and returned snapshots are deeply immutable.

## Dynamics

Raw MIDI velocity is neither acoustic loudness nor an absolute `p`/`mf`/`f` scale. Clef normalizes all correct matched velocities in the current attempt and grading scope once, using deterministic Q10 and Q90 quantiles. It does not normalize hands, registers, or regions separately. A constant velocity offset therefore preserves the interpreted shape.

Guardrails require at least six matched attacks, four distinct velocity values, and a robust Q10–Q90 range of at least eight raw units. Sparse or compressed velocity data becomes limited or unavailable rather than being stretched into false contrast. Diagnostics retain sample count, distinct count, raw range, median, Q10, Q90, and robust range.

Supported authored targets are:

- ordinal explicit dynamic changes, evaluated from robust before/after contrast;
- paired crescendo and diminuendo wedges, evaluated from robust endpoint separation and Theil–Sen trend without requiring a linear curve;
- accent and strong-accent attacks, evaluated against nearby non-accent notes in the same part/staff/voice lane. Every expected physical target owned by any authored accent is excluded from every accent's ordinary local baseline.

An isolated dynamic marking has no absolute MIDI reference and is preserved as ungradeable. Wedges own overlapping endpoint changes so the same authored event is not counted twice. Ownership requires compatible part, staff, and voice provenance: explicit values must agree, while an unknown staff or voice is a conservative wildcard. A Voice 1 wedge therefore does not suppress an explicitly Voice 2 transition. Dynamics aggregate authored musical events, not raw note count; chords therefore cannot gain arbitrary weight.

## Articulation

Articulation measures physical piano-key behavior, not acoustic sounding duration. Sustain events are preserved as diagnostics but never extend key release.

For staccato, staccatissimo, and tenuto, the engine converts the exact expected score duration through the existing tempo timeline and practice-speed multiplier, then applies the alignment time scale:

```text
gate ratio = physical attack-to-release duration / predicted nominal performed duration
```

Versioned conservative starting heuristics use strong regions near gate ratio `≤ 0.65` for staccato, `≤ 0.45` for staccatissimo, and `0.85–1.20` for tenuto. Scores transition continuously through tolerance bands; these are implementation heuristics, not universal laws of piano playing.

Slur transitions are built only in an unambiguous part/staff/voice/number lane. The positive-gap tolerance is `max(35 ms, 5% of expected local IOI)`. Repeated pitches use a short controlled re-articulation model because one piano key cannot physically overlap itself while being attacked again. A grouped chord articulation target is analyzed only when every physical expected key has a correct match and safe release; one missing release leaves the whole authored target unanalyzed and lowers coverage without adding a second note penalty. Legato transitions likewise require both correct attacks and the current physical release. Chords, overlapping slurs, conflicting collapsed-key markings, ambiguous tie-chain markings, and missing releases are excluded rather than guessed. Accent belongs only to Dynamics; fermata remains unsupported for physical articulation.

## Authored-event aggregation

Each successfully analyzed authored musical target receives one bounded vote in its dimension. Final Dynamics and Articulation scores are the arithmetic mean of those target scores. This is authored-event weighting, not raw-note weighting: a chord does not outweigh a single note, and a long wedge does not gain weight from every contained attack. Robust medians remain in use inside targets for local windows, wedge endpoints, and grouped-key evidence.

## Coverage and reliability

Dynamics and Articulation each retain their own score, status, reason, target coverage, reliability, targets, observations, exclusions, warnings, and diagnostics.

- `reliable`: full-plan scope, at least three analyzed authored targets, at least 70% coverage, and trustworthy correspondence;
- `limited`: usable evidence with sparse targets, lower coverage, aligned-span scope, or pedal-affected Articulation interpretation;
- `provisional`: the underlying alignment or note grading is ambiguous;
- `unavailable`: no supported targets or no safe observation evidence.

Unavailable evidence is `null`, never a fabricated zero. One analyzed target out of many cannot appear fully trustworthy.

## Persistence and versioning

The Phase 9.1 engine version is `expression-analysis-1.1.0`. Parser provenance is recorded from the centralized MusicXML parser version. Historical Phase 9 imports retain `musicxml-parser-1.1.0`; new Phase 10 imports use `musicxml-parser-1.2.0`, whose added pedal provenance does not change dynamics or wedge semantics.

Phase 9 attempts use `PerformanceAttemptRecordV2` and preserve the exact `ExpressionAnalysisResult` plus expression engine version. Phase 10 V3 attempts preserve that same exact expression snapshot beside Pedal, and Phase 11 V4 attempts retain it beside Voicing and reference comparison. Existing versions remain unchanged and are never silently regraded. Those object-format extensions did not alter stores; Phase 12 later raises IndexedDB to schema 4 solely for separate Technique records.

Phase 11 Voicing reuses each correct match's already-computed performance-wide `normalizedIntensity`; it never renormalizes foreground and support lanes separately. Reference comparison then interprets Dynamics and Articulation relative to each take's own stable anchors. Neither consumer changes this frozen Phase 9 result.

## Phase 10 relationship

Phase 10 consumes this exact frozen expression snapshot only for correct-match and key-interaction context. Controller-derived damper intervals never replace physical key releases, change Articulation scores, or combine Dynamics, Articulation, and Pedal. See `PEDAL_ANALYSIS.md`.

Phase 10.1's rubato-aware Pedal anchors do not change Dynamics or Articulation scoring. Timing/Tempo owns temporal shape, physical Articulation remains key behavior, and Pedal contributes separate performed-structure coordination context.

## Explicit limitations

Phase 9 provides no audio/tone analysis, acoustic loudness, manufacturer-specific rules, instrument calibration, acoustic sounding duration, expression personal bests/trends, Practice Priority changes, or overall score. Phase 10 adds separate authored CC64 pedal analysis without changing those limits. Phase 11 adds explicit-intent performance-relative Voicing without guessing melody from register or pitch. Future optional calibration may improve cross-device or cross-session comparison, but current dynamics work performance-relatively without it.
