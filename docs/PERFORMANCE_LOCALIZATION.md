# Performance localization

Phase 15.2 makes partial-take identity explicit before any grading. A real performance may start at the beginning, in a suggested section, or in an unannounced middle passage. Clef must identify where the take belongs without turning elapsed silence, a UI focus, or the first superficially similar notes into score truth.

## Armed recording

Starting capture moves `PerformanceRecorder` to `armed`. While armed, the musical timer remains zero and no `PerformanceRecording` exists. CC64 messages update the initial sustain context but are not appended as performed events. Note Off does not start a take. The first Note On atomically establishes monotonic time zero, the wall-clock `startedAt`, and the first recorded event. Cancelling, replacing, or disconnecting while armed returns safely to idle without a phantom take.

Practice speed and intended-start controls are locked for both armed and recording states so the eventual immutable snapshot cannot inherit a changed context.

## Localization before alignment

Alignment `2.0.0` has two stages:

1. Score-region localization proposes bounded contiguous regions from deterministic onset-group pitch fingerprints. Each proposal is evaluated by pitch cost, exact-anchor count and density, monotonic correspondence density, performed coverage, continuity gaps, and an explicit quality value. Timing is excluded from this decision.
2. After one region is resolved, the existing sequence aligner and robust affine time fit operate only inside those expected bounds. Expected material outside the bounds remains neutral expected-only correspondence data for compatibility, not evidence that it was attempted.

The immutable `ScoreRegionLocalization` retains the intended-start hint, up to three explainable candidates, best-versus-second separation, resolution method, explanation, and optional `MatchedTakeRegion`. The matched region records exact expected and performed group bounds plus canonical measure indexes/numbers. This is the only modern played-region identity used by aligned-span grading.

## Intended-start hints

Direct Practice defaults to **Beginning**. A Phase 14 planning launch carries its exact `PlanningSectionIdentity`—ScoreVersion, start/end measure indexes, and source-measure IDs—as **Suggested Section**. The user may choose **Auto**.

Hints constrain candidate choice only when the hinted region has credible independent structural evidence. They are never grades, persisted recommendations, or permission to force a poor match. Candidate confirmation freezes explicit expected group bounds and reruns the same engine; it does not edit the score or recording.

## Ambiguity and divergence

Repetitive music can make separated regions genuinely indistinguishable. When best and second candidates are materially close and no supported hint resolves them, localization status is `ambiguous`, `takeRegion` is null, and Take Review shows candidate ranges for confirmation. A structurally unrelated take is `divergent`. One onset is insufficient except when it covers the score's only onset group.

Ambiguous, divergent, and insufficient modern localizations fail closed: current aligned-span Notes, Rhythm, Tempo, measure results, and normal Save are unavailable. An explicit full-plan note-grade path remains for forensic compatibility, but it cannot masquerade as a localized normal take.

## Downstream semantics

- Note grading bounds aligned-span scope to `MatchedTakeRegion`.
- Timing `1.1.0` consumes that scope and rejects local samples whose expected/performed onset-index geometry differs.
- Performance Results aggregate the same frozen scope.
- Compact Take Review filters its measure map to the matched measure indexes and presents one independent evidence dimension at a time.
- Phase 7 Practice Priority remains a per-take weak-section aggregate. It is not played-region identity.
- Phase 14 Planning remains a transient current longitudinal read model. Its section hint does not become historical analysis truth.

Pedal with captured CC64 but no authored pedal target is reported as captured but not graded. Voicing without exact configured intent is not configured. Neither is displayed as zero. There is no overall Performance Score.

## Versioning and history

Alignment changes from `1.0.0` to `2.0.0`; Timing Analysis changes from `1.0.0` to `1.1.0`. New fields are version-gated inside those existing immutable snapshots. PerformanceAttempt remains V4 because no new attempt-owned evidence family or store is introduced. IndexedDB remains schema `4`, so no migration is required.

Historical `1.0.0` snapshots remain readable with no localization field or rejected-window diagnostic. They are never reanalyzed or upgraded in place. Repository validation requires complete localization for Alignment `2.0.0` and a non-negative rejected-window count for Timing `1.1.0`.

The automated Phase 15.2 milestone does not pass the manual V1 release gate. A real CA401 validation remains required. Future page-oriented notation work must replace the current overly dense OSMD `drawingParameters: compacttight` posture, strictly as renderer presentation rather than score or analysis truth.
