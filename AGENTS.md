# Piano Progress repository guidance

## Product

This repository builds a serious piano progress and performance-analysis application. Keep the experience premium, music-oriented, and focused on measurable progress. Avoid children's gamification, fake rewards, and claims that unfinished analysis is working.

## Important terminology

- **Work**: musical identity, such as *River Flows in You*.
- **Arrangement**: one playable realization of a Work.
- **Derived Work**: a separate Work inspired by another Work.
- **ScoreVersion**: the exact machine-readable score used for analysis.
- **PerformanceAttempt**: one recorded performance tied to an Arrangement and exact ScoreVersion.
- **Performance Score**: metrics for one attempt.
- **Mastery**: current knowledge of an Arrangement across time, consistency, coverage, tempo, and recency.
- **Skill Rating**: a transferable ability measured across repertoire or Technique Lab exercises.

## Domain rules

- Mastery belongs primarily to an Arrangement, never implicitly to every arrangement of a Work.
- Derived works may remain separate Works and reference their source with `derivedFromWorkId`.
- ScoreVersions are historically immutable. A changed import creates a new version.
- Future performances reference the exact ScoreVersion and grading-engine version used.
- Preserve historical performance semantics so results remain reproducible.
- Headline progress comparisons accept reliable and limited full-plan results only; provisional or unavailable results never create personal-best or trend claims.

## Engineering rules

- Keep TypeScript strict; avoid `any` and fix type or lint failures instead of suppressing them.
- Do not fake functionality. Label future and mock behavior honestly.
- Preserve existing conventions when they remain sensible.
- Keep domain and MIDI logic independent from React presentation.
- Work in small, independently verifiable milestones.
- Do not introduce a backend, database, or large dependency before it is requested.
- Keep dependencies lightweight and justified.

## MusicXML and score-model rules

- OSMD is a notation renderer, never the canonical score model. Do not import OSMD types into `features/musicxml` or future grading code.
- Application-owned `NormalizedScore` data is the source of truth for future expected-performance and grading work.
- MusicXML timing uses reduced, exact `MusicalTime` fractions in quarter-note units. Never replace score accumulation with floating-point arithmetic.
- Parser output and event IDs must remain deterministic for unchanged source XML.
- Keep the core parser framework-independent and independently testable. Do not parse MusicXML inside React rendering code.
- Treat uploaded XML and MXL as untrusted input. Keep size, archive-path, XML, DOCTYPE, root-structure, and external-resource validation intact.
- Preserve Work / Arrangement / ScoreVersion semantics. A changed score import will become a new immutable ScoreVersion when persistence exists.
- Make unsupported notation explicit with typed errors or structured warnings; do not guess musical meaning.
- Never put performance grading, hand assignment, fingering, or expected MIDI velocity into the renderer adapter.
- Any parser change affecting duration, cursor movement, chords, voices, or absolute positions requires focused exact-value tests.

## Performance-model and recording rules

- `NormalizedScore` is notation-side truth, `ExpectedPerformancePlan` is performance-expectation truth, and `PerformanceRecording` is observed MIDI truth. Keep these layers independent.
- Tied continuation segments do not create new required attacks when exact pitch, part, voice, staff, and onset continuity safely form one chain.
- Fixed score positions and durations remain exact `MusicalTime`; conversion to floating-point milliseconds happens only at the tempo-timeline boundary.
- MIDI performance intervals use a monotonic high-resolution timestamp. Wall-clock timestamps are session metadata only.
- Preserve arrival sequence for equal-timestamp MIDI events. Never reorder a recording solely by timestamp.
- React controls the recorder but never owns its authoritative event buffer or note-pairing semantics.
- Sustain events are preserved, but Phase 3 sustain does not extend physical key-release spans.
- Recording tests use injected clocks and IDs, never real sleeps.
- Treat a selected device whose ID remains present but whose state is no longer `connected` exactly like a removed device: clear selection, keys, and sustain, stop the recorder, and never resume the stopped take after reconnect.
- Do not infer correctness, alignment, timing quality, or grading inside recorder services or React components.

## Alignment rules

- Alignment is correspondence infrastructure, not grading. Grade semantics belong to later grading layers.
- Never compare expected and performed events by raw array index. Primary alignment operates on onset groups.
- Performed onset clustering must preserve every MIDI attack, including duplicate and equal-timestamp arrivals.
- Alignment paths are monotonic and must tolerate inserted, deleted, and substituted musical events without cascading shifts.
- Score timing remains exact `MusicalTime` until the explicit reference-millisecond conversion; recording timing remains monotonic milliseconds.
- Recording-start silence is represented by alignment offset, never interpreted directly as a rhythm error.
- Affine time-transform fitting must be deterministic, robust to outliers, bounded against absurd scales, and explicit about fallback semantics.
- Never mutate `ExpectedPerformancePlan` or `PerformanceRecording` during alignment. Results are immutable analysis snapshots.
- Sustain, releases, and velocity remain preserved inputs but do not control Phase 4 attack correspondence.
- Alignment-engine changes require focused regression tests for gaps, substitutions, chords, repeats, partial takes, and timing transforms.

## Note-grading rules

- Alignment and grading are separate layers. Phase 5 note grading consumes `AlignmentResult` and never realigns raw MIDI.
- Simultaneous duplicate expected MIDI pitches form one physically observable key target while retaining every notation attack and source-note ID.
- Exact pitch correspondences take precedence over wrong-pitch substitution pairing.
- Wrong-pitch pairing is conservative, deterministic, bounded by centralized options, and limited to leftovers inside one aligned onset-group correspondence.
- Nearby wrong pitches receive no partial correctness credit; pitch distance only supports substitution provenance.
- Grace, cue, unsupported microtonal, and default outside-standard-range expectations are preserved as exclusions, never silently counted as missed.
- Grading scope is explicit. Aligned-span grading must not penalize unplayed material before or after a partial performance.
- The dedicated note score is precision/recall F1, not an arbitrary weighted formula or an overall performance score.
- Timing residuals, velocity, note duration, chord spread, and sustain never affect Phase 5 pitch correctness.
- Note-grading code remains framework- and renderer-independent, immutable, versioned, and provenance-rich for future measure results.

## Timing-analysis rules

- Rhythm and tempo are separate metrics. Global speed deviation must never become rhythm error automatically.
- Phase 6 consumes `AlignmentResult` and `NoteGradingResult`; it never realigns MIDI, reparses MusicXML, or changes Phase 5 pitch semantics.
- Practice-speed selection defines the effective numeric tempo target. Never apply the multiplier twice or compare practice directly with the original authored BPM.
- Phase 4 alignment offset removes recording-start silence from musical timing, and its affine transform remains the canonical coarse clock.
- Rhythm grading uses relative local intervals after robust tempo normalization, with tempo-scaled human tolerance and bounded robust aggregation.
- Tempo analysis compares local and global performance speed against the effective authored/fallback timeline. `timeScale` and `tempoRatio` are inverses.
- Numeric authored tempo changes are authoritative. Qualitative directions such as `rit.`, `rall.`, `accelerando`, and `a tempo` must never become invented exact BPM curves.
- Wrong-pitch aligned groups may still supply timing observations. Missing and additional notes reduce evidence but are not double-penalized by rhythm.
- Expected chords contribute one onset position; internal chord spread remains a separate conservative diagnostic.
- Grace events remain outside fixed timing grading. Velocity, releases, duration, articulation, and sustain never affect Phase 6 scores.
- Timing-analysis code remains React- and OSMD-independent, deterministic, immutable, versioned, and provenance-rich for future measure aggregation.
- Score-only expressive timing and future reference-performance timing remain conceptually distinct.

## Performance-results rules

- Phase 7 consumes existing normalized-score, plan, alignment, note-grading, and timing-analysis snapshots. It never reparses, realigns, or changes Phase 5/6 semantics.
- Aggregate Notes from physical-target counts, Rhythm from underlying interval losses, and Tempo from underlying local samples. Never average displayed percentages.
- Cross-measure rhythm intervals belong to the destination-onset measure and must be counted once.
- Preserve exact `MusicalTime`, grading scope, and all deterministic source IDs through measure, section, mistake, and renderer mapping.
- Sparse or unavailable evidence is `null`/insufficient, never a fake zero. Confidence must affect recommendations.
- Practice Priority uses 45% Notes, 35% Rhythm, and 20% Tempo across available dimensions, then confidence adjustment. It is not an overall Performance Score, Mastery, or Skill Rating.
- Section metrics are rebuilt from underlying evidence. Weak/strong ranking and overlap suppression remain deterministic and centralized.
- Additional attacks receive score provenance only from safe correspondence or two-sided contextual attribution; never invent notation IDs.
- Renderer highlighting consumes an application-owned mapping model. OSMD remains isolated and is never analysis truth.
- Performance-result logic remains React- and OSMD-independent, immutable, versioned, serializable, and tested for scopes, evidence, boundaries, duplicates, mapping, determinism, and long scores.

## Expression-analysis rules

- Dynamics and Articulation are separate dimensions. Never combine them into an Expression, Musicality, Performance, Mastery, or Skill score, and do not add them to Phase 7 Practice Priority or headline progress yet.
- Phase 9 consumes `NormalizedScore`, `ExpectedPerformancePlan`, `PerformanceRecording`, `AlignmentResult`, and `NoteGradingResult`; it never reparses MusicXML, realigns MIDI, or depends on React or OSMD.
- Only correctly matched, in-scope physical-key targets contribute expression observations. Wrong, missed, additional, excluded, and outside-scope notes reduce expression coverage and never receive a second grading penalty.
- Normalize velocity once per attempt/scope from the full correct-match population with robust quantiles and explicit low-sample/distinct-value/range guardrails. Never map raw MIDI velocity to absolute `p`/`mf`/`f`, normalize lanes separately, or add manufacturer rules.
- Dynamics targets are authored events: ordinal explicit changes, paired wedges, and local-lane accents. Suppress overlapping wedge/endpoint double-counting and bound chord weight by musical event rather than note count.
- Final Dynamics and Articulation scores are arithmetic means of successfully analyzed authored targets; robust within-target medians do not change that equal event weighting. Other authored accents never enter an accent's local baseline, and wedge overlap ownership uses compatible part/staff/voice provenance with unknown staff or voice treated as a conservative wildcard.
- Articulation measures physical attack-to-key-release duration. Sustain is diagnostic only and never extends release; pedal-aware sounding duration and pedal grading remain future work.
- A grouped articulation target is analyzed only when every required physical key has a correct match and complete safe release evidence. Incomplete targets lower coverage instead of receiving a second score penalty.
- Gate ratios use exact score duration through the existing tempo/practice-speed timeline and alignment scale. Slur transitions require an unambiguous part/staff/voice/number lane, with distinct repeated-pitch semantics.
- Expression results keep independent status, reliability, coverage, exclusions, warnings, and evidence for Dynamics and Articulation. Unavailable evidence is null, deterministic, deeply immutable, versioned, and never a fake zero.

## Persistence and progression rules

- Keep domain/services behind `PianoProgressRepository`; raw IndexedDB APIs belong only in the adapter.
- Persist canonical MusicXML and immutable ScoreVersion identity. Historical attempts always retain the exact ScoreVersion, expected plan, recording, analysis snapshots, and engine versions they used.
- ScoreVersion duplicate identity includes the canonical deduplicated part-selection set. Changing that set creates a new immutable version, and Arrangement part metadata mirrors the latest active version.
- PerformanceAttempt save, lightweight summary save, and PracticeSession linkage are one transaction and retries are idempotent by attempt ID.
- Before attempt persistence writes, the ScoreVersion, PerformanceAttempt, and ExpectedPerformancePlan must have canonically equivalent included-part sets.
- Before attempt persistence writes, the ExpectedPerformancePlan `scoreId` must match the exact persisted ScoreVersion `normalizedScoreId`.
- Preserve V1 attempts unchanged. New V2 attempts add an exact `ExpressionAnalysisResult` and expression engine version; validate score/plan/recording/alignment/note-grade/scope provenance and never reanalyze historical V1 records.
- V2 Expression scope provenance must exactly match NoteGrading scope type, expected indexes, and expected group IDs; malformed history is corrupt and is never repaired or reanalyzed.
- Keep raw MIDI lossless, including arrival order, velocities, releases, sustain, timestamps, device context, warnings, and statistics.
- Summary projections may accelerate queries but are rebuildable and never replace the authoritative attempt snapshot.
- Practice time sums completed PracticeSessions, not attempts. One session may contain multiple takes.
- Personal bests are derived separately for Notes, Rhythm, and Tempo. Headline comparison requires the same Arrangement, ScoreVersion, full-plan scope, and practice speed; equality and partial takes are not new records.
- Historical result views are read-only. Never silently regrade an old attempt with current engines.
- Removing Repertoire membership preserves Work, Arrangement, ScoreVersions, sessions, and attempts. Full local deletion requires explicit confirmation.
- Successful full local deletion also clears the active in-memory Practice session; a failed deletion preserves it for a safe retry.
- Treat local storage failures and corrupt records as typed, recoverable UI states. Never replace missing evidence with mock data or fake zeroes.
- Clear cached IndexedDB opens after failure, close, or version change so Retry performs a real reopen; keep healthy opens cached.
- Exact re-import after Repertoire removal restores only membership. Never recreate preserved Work, Arrangement, ScoreVersion, session, or attempt identity.
- Date-range progress queries use indexes, active days use the user's local calendar, and summary views never load raw MIDI snapshots.
- Headline context requires `isHeadlineComparable`; unavailable metrics remain null and must not be plotted as zero.
- Web MIDI teardown detaches local handlers and selection before awaiting device close. Close failures and stale async operations must never restore an old input or clear a newer one.
- MidiProvider state and errors follow only the latest async selection request; stale completions never override the service's authoritative input.

## Commands

- Install: `npm install`
- Development: `npm run dev`
- Test: `npm test`
- Type-check: `npm run type-check`
- Lint: `npm run lint`
- Production build: `npm run build`

## Git milestone rule

For a requested milestone: implement it, run tests, type-check, lint, and production build, inspect the complete diff and Git status, fix problems, then create the requested local commit. Never push unless explicitly instructed. Commit this file with relevant milestones.
