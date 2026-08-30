# Performance localization

Phase 15.2 makes partial-take identity explicit before any grading. A real performance may start at the beginning, in a suggested section, or in an unannounced middle passage. Clef must identify where the take belongs without turning elapsed silence, a UI focus, or the first superficially similar notes into score truth.

## Armed recording

Starting capture moves `PerformanceRecorder` to `armed`. While armed, the musical timer remains zero and no `PerformanceRecording` exists. CC64 messages update the initial sustain context but are not appended as performed events. Note Off does not start a take. The first Note On atomically establishes monotonic time zero, the wall-clock `startedAt`, and the first recorded event. Cancelling, replacing, or disconnecting while armed returns safely to idle without a phantom take.

Practice speed and intended-start controls are locked for both armed and recording states so the eventual immutable snapshot cannot inherit a changed context.

## Localization before alignment

Alignment `2.0.1` has two stages:

1. Score-region localization proposes bounded contiguous regions from deterministic onset-group pitch fingerprints. Each proposal is evaluated by pitch cost, exact-anchor count and density, monotonic correspondence density, performed coverage, continuity gaps, and an explicit quality value. Timing is excluded from this decision.
2. After one region is resolved, the existing sequence aligner and robust affine time fit operate only inside those expected bounds. Expected material outside the bounds remains neutral expected-only correspondence data for compatibility, not evidence that it was attempted.

Every localization-candidate, bounded coarse, and bounded refined matrix is checked before allocation. The old hypothetical whole-score × performed matrix is never constructed or used as an early rejection. Unsafe candidates are skipped deterministically; when no required candidate can fit the explicit limit, alignment returns `INPUT_TOO_LARGE` without truncating either input.

The immutable `ScoreRegionLocalization` retains the intended-start hint, up to three explainable candidates, best-versus-second separation, resolution method, explanation, and optional `MatchedTakeRegion`. The matched region records exact expected and performed group bounds plus canonical measure indexes/numbers. This is the only modern played-region identity used by aligned-span grading.

## Intended-start hints

Direct Practice defaults to **Beginning**. A Phase 14 planning launch carries its exact `PlanningSectionIdentity`—ScoreVersion, start/end measure indexes, and source-measure IDs—as **Suggested Section**. Both measure bounds constrain the intended candidate; exact agreement means the candidate agrees with the full available section bounds, not merely its starting measure. ScoreVersion and source-measure IDs remain provenance because alignment groups do not carry source-measure identity. The user may choose **Auto**.

Hints constrain candidate choice only when the hinted region has credible independent structural evidence. They are never grades, persisted recommendations, or permission to force a poor match. Candidate confirmation freezes explicit expected group bounds and reruns the same engine; it does not edit the score or recording.

The localization hint has a canonical value key covering Auto, Beginning, exact section identity, and confirmed group bounds. Changing intent on a stopped unsaved take invalidates the current pipeline and automatically rebuilds Alignment, aligned-span Notes, Timing, and Performance Results. Generation guards prevent an older recording, intent, confirmation, discarded take, or unmounted component from publishing stale current-take evidence.

## Ambiguity and divergence

Repetitive music can make separated regions genuinely indistinguishable. When best and second candidates are materially close and no supported hint resolves them, localization status is `ambiguous`, `takeRegion` is null, and Take Review shows candidate ranges for confirmation. A structurally unrelated take is `divergent`. One onset is insufficient except when it covers the score's only onset group.

Ambiguous, divergent, and insufficient modern localizations fail closed: current aligned-span Notes, Rhythm, Tempo, measure results, and normal Save are unavailable. An explicit full-plan note-grade path remains for forensic compatibility, but it cannot masquerade as a localized normal take.

## Downstream semantics

- Note grading bounds aligned-span scope to `MatchedTakeRegion`.
- Timing `1.1.0` consumes that scope and rejects local samples whose expected/performed onset-index geometry differs. A valid unavailable Timing snapshot remains a result, not an execution failure.
- Performance Results aggregate the same frozen scope and preserve Notes plus bounded measures when Rhythm or Tempo is unavailable.
- Compact Take Review filters its measure map to the matched measure indexes and presents one independent evidence dimension at a time.
- Expression, Pedal, and Voicing then populate progressively through the same current-take identity boundary; unrun `null` state never proves no authored target or no configured intent.
- Take Review is the ordinary stopped-take destination. The technical engine panels are mounted only after the collapsed forensic disclosure is opened.
- Phase 7 Practice Priority remains a per-take weak-section aggregate. It is not played-region identity.
- Phase 14 Planning remains a transient current longitudinal read model. Its section hint does not become historical analysis truth.

After analysis, Pedal with captured CC64 but no authored pedal target is reported as captured but not graded. Completed Voicing analysis without exact configured intent is not configured. Before those snapshots exist, the dimensions say not analyzed or analyzing instead of inferring either fact. None is displayed as zero. There is no overall Performance Score.

## Versioning and history

Alignment advances from `2.0.0` to `2.0.1`; Timing Analysis remains `1.1.0`. PerformanceAttempt remains V4 because no new attempt-owned evidence family or store is introduced. IndexedDB remains schema `4`, so no migration is required.

Historical Alignment `1.0.0` snapshots remain readable without localization, and `2.0.0` snapshots remain readable with their frozen localization semantics. They are never reanalyzed or upgraded in place. Repository validation requires complete localization for Alignment `2.0.0` and `2.0.1`, and a non-negative rejected-window count for Timing `1.1.0`.

The automated Phase 15.2 milestone does not pass the manual V1 release gate. A real CA401 validation remains required. Future page-oriented notation work must replace the current overly dense OSMD `drawingParameters: compacttight` posture, strictly as renderer presentation rather than score or analysis truth.
