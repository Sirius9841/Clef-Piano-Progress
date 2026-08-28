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

## Musical interpretation rules

- Score fidelity and musical interpretation are distinct concepts. A metric may measure structural correctness or agreement with authored notation, but maximum literal conformity is never presented as the uniquely correct or most expressive performance.
- Musically coherent rubato, phrasing, dynamics, articulation, and pedaling may legitimately differ from a literal score-time realization. Technique and fidelity evidence must preserve that interpretive freedom while still identifying uncontrolled execution.
- Future reference performances are examples and comparison evidence, never absolute ground truth for musical expression. A difference from one reference is not automatically an error.
- Do not penalize the same expressive timing decision independently in several dimensions when one dimension already owns that behavior.
- Do not invent Emotion, Musicality, or Expressiveness scores from MIDI evidence. Artistic quality is not reducible to one objective numeric truth.

## Engineering rules

- Keep TypeScript strict; avoid `any` and fix type or lint failures instead of suppressing them.
- Do not fake functionality. Label future and mock behavior honestly.
- Preserve existing conventions when they remain sensible.
- Keep domain and MIDI logic independent from React presentation.
- Work in small, independently verifiable milestones.
- Do not introduce a backend, database, or large dependency before it is requested.
- Keep dependencies lightweight and justified.

## V1 interface rules

- The Phase 15.0 interface and its warm charcoal/umber, brass, sienna, and sage visual language are frozen for V1. Treat the reference artifact as presentation guidance only, never as a domain contract or data source.
- Application appearance (`Dark`, `Light`, `System`) and notation appearance (`Paper`, `Night`) are independent versioned UI preferences. Neither may alter canonical scores, analysis, or history.
- The interface must never invent an overall Performance Score, overall Skill score, inferred repertoire status, fabricated recommendation, or unavailable metric shown as zero.
- Repertoire status is manual. Mastery belongs to the exact Arrangement/current ScoreVersion, and demonstrated speed remains visibly separate from target speed and Mastery.
- Headline PB and trend presentation is limited to canonical Notes, Rhythm, and Tempo comparability. Expression dimensions remain independent evidence.
- Authored Pedal analysis and captured CC64 facts are separate. Voicing requires explicit intent. Reference performances are neutral comparison examples.
- Technique configuration and result presentation use the current domain definitions and render actual `TechniqueAnalysisResult.facets`; never duplicate fixture enums or facet maps.
- Phase 14 planning is a transient current read model with explicit provenance. Historical attempt snapshots remain immutable and Phase 7 per-take priority remains visually distinct.
- OSMD is the notation renderer only. UI fixtures, SVG sketches, and visual mock data must never become canonical score or analysis truth.

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

## Technique Lab rules

- TechniqueAttempt is a separate immutable record family; never attach it to Work, Arrangement, ScoreVersion, PracticeSession, or PerformanceAttempt.
- Generated exercises are deterministic from an explicit spec, template, and seed, then compile through the canonical MusicXML parser and expected-performance builder.
- Technique history is frozen by explicit engine pair: V1 `1.0.0`; V2 `exercise-1.1.0`/`analysis-1.1.0`, `exercise-1.1.1`/`analysis-1.1.1`, and current `exercise-1.1.1`/`analysis-1.1.2`. Reject all other pairings. IndexedDB remains schema 4.
- Every Technique facet retains exact challenge context. Phase 12 analysis never collapses challenge into one difficulty number or directly creates Skill Rating, Mastery, or headline progress; only the summary-driven Phase 13 Skill Model may combine applicable facets under its explicit context-qualified rules.
- Technique analysis consumes frozen Alignment, NoteGrading, and TimingAnalysis snapshots; it never reparses, realigns, or regrades.
- Wrong, missed, additional, unsafe, or non-adjacent pitch evidence cannot become a second timing penalty. Sparse timing evidence is unavailable, never zero. Interior failures remain authored opportunities and can lower facet coverage without becoming zero-valued timing observations.
- Rhythm precision and hesitation continuity, global target tempo and local stability, scale-wide evenness and its turn, and jump landing and recovery use distinct observation semantics/populations.
- Actual event coverage, attempted prefix/tail span, and facet coverage are separate. Untouched leading/trailing material is outside attempted opportunity denominators; interior attempted opportunities remain. Facet-specific minimum evidence prevents tiny perfect fragments from producing strong claims.
- Tempo facet score, Tempo facet coverage, and completion are separate. `LocalTempoSample`s are trustworthy evidence, never the denominator; target/stability denominators are attempted authored local-window opportunities and transition denominators are attempted authored qualifying window transitions. Reliability expresses evidence confidence, not performance quality.
- Generated notation remains key-aware. Frozen exercise events must match aligned expected groups in count, exact position, and MIDI multiset, and all recording/alignment/note/timing/novelty identities must match before evidence preparation or module dispatch. Invalid inputs fail closed with deterministic unavailable facets and no observations/findings.
- Sight-reading novelty is first-pass/repeat context on independent facets, never a composite score. Transactional save remains authoritative for exact-instance novelty.
- Declared hand context is user metadata only; never infer the physical hand from MIDI.
- Technical exactness is valid only when it is the declared exercise objective. Do not transfer metronomic expectations to interpretation-aware repertoire timing.
- Do not infer fingering, physical hand use, tension, relaxation, biomechanics, injury risk, acoustic tone, velocity quality, or pedal quality from Phase 12 evidence.
- Phase 13 may consume only frozen, validated Technique summaries; it must not regenerate or reinterpret historical attempts.

## Skill and mastery model rules

- Skill Model `1.1.1` consumes only current-pair Technique V2 summaries (`exercise-1.1.1` / `analysis-1.1.2`). Older Technique evidence remains frozen history and never creates a current rating.
- Keep exactly eight independent Technique skill ratings. Never create an overall pianist score, universal level, percentile, or challenge difficulty multiplier.
- Skill attempt quality gives each applicable ready facet one equal vote. Reliability and coverage affect evidence authority, not the measured facet quality itself.
- Aggregate Technique evidence through challenge contexts before module ratings so repeated identical practice cannot dominate breadth. Tonics, modes, inversions, and declared hand context are descriptive breadth, not ranked difficulty or inferred physical execution.
- Skill and Mastery models require explicit `asOf`, use typed exclusions, preserve exact evidence IDs, and return immutable serializable projections. No evidence is null/unestablished, never zero.
- Arrangement Mastery belongs to one Arrangement and only its current ScoreVersion. It accepts reliable/limited full-plan summaries with Notes, Rhythm, and Tempo; old versions, partials, and provisional results remain history.
- Mastery keeps Control, demonstrated speed, consistency, recency, and confidence explicit. Practice time, attempt volume, expression, pedal, voicing, references, and repertoire status never inflate it.
- Demonstrated speed requires repeated dimension-qualified full-score evidence. Tempo accuracy at a reduced target is not full-speed mastery, and a single lucky take never establishes speed.
- A current-state component uses the recency of the evidence that supports that component; a recent unrelated attempt never refreshes stale demonstrated-speed or context evidence.
- Skill confidence uses only the bounded latest model evidence retained per challenge context. Older repeats remain eligible history but cannot inflate current confidence.
- Skill quality continuity and confidence authority use distinct recency semantics: old history may remain informative without proving current ability.
- Challenge-context identity includes every module-relevant configured dimension that materially changes the authored exercise, including template and subdivision where applicable, without assigning difficulty ranks.
- Challenge-context identity and its challenge envelope share one canonical per-module definition. Keep tonal-key tonic provenance separate from non-tonal starting-pitch provenance, and expose template, subdivision, and event-count breadth without interpreting them as difficulty.
- Call the bounded latest-three-per-context population the model window, never the current window; recency authority, not membership alone, determines whether evidence is current.
- Mastery demonstrated speed requires repeated current reliability/recency support in its exact speed bucket, not merely two qualifying performances at any age.
- Mastery High confidence requires current, session-capped authority inside the exact demonstrated-speed bucket. Keep raw supporting-session count distinct from effective session authority; stale, same-session, or other-speed support cannot masquerade as current independent repetition.
- Current-state recency and confidence are distribution-aware. The newest evidence item alone cannot refresh an otherwise stale population, and repeated same-session evidence has bounded confidence influence.

## Practice-planning rules

- Practice Planning `practice-planning-1.0.1` is a current derived read model, separate from frozen Phase 7 per-attempt Practice Priority. Never rewrite or aggregate historical `confidenceAdjustedPriority` to rank current work.
- Planning consumes only supported frozen PerformanceResults `1.0.0` semantics from the exact Arrangement/current ScoreVersion. Use lightweight summaries to bound full reads to the latest 8 sessions and latest 3 attempts per session; never regrade history.
- Canonical section identity includes ScoreVersion, exact start/end measure indexes, and canonical source-measure IDs. Display text is never identity, and a partial take contributes only when the full section window is inside scope.
- Notes, Rhythm, and Tempo remain independent planning dimensions. Unavailable evidence stays null; Dynamics, Articulation, Pedal, Voicing, references, and artistic quality remain outside Phase 14 ranking.
- Planning authority is reliability × section confidence × no-floor 45-day recency. Retain at most three dimension observations per session and cap each session's authority at one.
- Persistent weakness requires independent-session evidence. Same-session repetition never equals independent persistence; one poor take may request verification but cannot establish a main problem or speed reduction.
- Keep speed contexts separate. Mixed practice speeds never create a naive regression claim, and progression or reduction requires repeated current support at the exact speed.
- Speed advice comes only from the highest meaningfully attempted frontier. Lower historical control cannot emit an increase past already-attempted or controlled higher work; target-speed control emits no increase.
- Every speed action retains its source multiplier. `increase-speed` must be numerically greater, `reduce-speed` strictly lower, and `hold-speed` equal; no suggestion may fall outside the configured 0.50–1.00 bounds.
- Recommendation ordering uses explicit evidence and deterministic tie-breaks, not an overall Practice Score. Reasons retain exact source evidence, attempt/session provenance, and timestamps.
- Mastery and Skill inputs must match their current model versions and the exact planning `asOf`. Technique may be an independent target but is never asserted to have caused a repertoire problem.
- Planning may suggest sections, Technique work, speed changes, or verification. It never mutates Mastery, repertoire status, or practice speed.
- Session composition is a bounded product heuristic, not universal pedagogy. Never invent full-run duration evidence.
- One canonical section target receives at most one timed session block. Merge compatible recommendation IDs and speed advice into that block; primary and secondary sections must be distinct identities.
- Context preparation owns one deeply frozen resolved planning policy. Derivation uses and exposes that exact policy and rejects independent derive-time overrides.
- The Practice Planning core remains independent of React, OSMD, IndexedDB internals, and UI copy. It creates no store, attempt version, or persisted recommendation.

## Pedal-analysis rules

- Pedal is an independent dimension based on authored damper notation and MIDI CC64. Extra controller changes are diagnostics and are never automatically wrong.
- Preserve every raw CC64 value and distinguish binary-like from continuous controller evidence without inferring acoustic half-pedal depth.
- Unknown initial sustain state remains unknown. Never silently reinterpret a historical missing field as pedal-up.
- Controller-derived damper intervals are not acoustic sound ends or sounding durations.
- Pedal/key interaction context never rewrites or double-penalizes frozen Phase 9 Articulation.
- Pedal timing primarily follows trustworthy local Phase 4 expected/performed onset correspondence: exact onset, tempo-aware bounded interpolation, one-sided transfer of a bounded nearby onset's residual from the affine score clock, then that affine score clock as fallback. A nearby note never substitutes its timestamp directly for a different pedal score position, and Pedal never independently refits timing.
- Pedal evaluates coordination with the musical structure the pianist actually performed. Rhythm/Tempo may describe rubato; Pedal must not independently punish the same global timing departure when the controller follows the aligned harmonic arrival.
- CC64 state and effective transitions are channel-specific. Damper holds use the recorded key's own channel; multi-channel authored-pedal ownership remains explicitly ambiguous rather than merged or guessed.
- Authored and performed pedal events use bounded, deterministic, non-cascading monotonic matching with explicit match, miss, and skipped-extra semantics. A missed earlier phrase must never steal a later gesture.
- Phrase and metric coverage distinguish complete, partial, and unanalyzed evidence. Truncated or unknown events reduce coverage and reliability; a trustworthy real miss remains analyzed with score zero.
- Persist V1 and V2 attempts unchanged and never silently reanalyze their pedal. V3 retains the exact expression and pedal snapshots plus engine versions.
- Notes, Rhythm, Tempo, Dynamics, Articulation, and Pedal remain separate. Pedal does not enter Practice Priority, personal bests, trends, Mastery, Skill Rating, or an overall score.

## Voicing and reference-comparison rules

- Never infer melody or foreground from highest pitch, staff, hand, voice number, or performed loudness. Scored Voicing requires explicit user foreground/support intent tied to one exact ScoreVersion.
- Voicing measures performance-relative MIDI attack balance at safe simultaneous cross-lane events, not acoustic loudness, timbre, or tonal projection. Wrong or missed notes reduce coverage and never receive another Voicing penalty; one musical onset gets one vote regardless of chord size.
- Lane-specific authored dynamics, accents, or wedges that conflict with generic projection are exclusions, never double-graded evidence.
- A reference performance is a manually selected interpretive example, never expressive ground truth. Reference comparison has no aggregate score, accuracy, quality grade, Musicality score, or correctness color semantics.
- Different global practice speed never makes an interpretation worse. Reference Tempo centers local tempo shape separately from global speed only after overlap filtering and stable-key pairing; unmatched samples never influence either center. Pedal compares timing relative to each take's own aligned musical anchor.
- References require the same Arrangement, exact ScoreVersion, and canonical part selection. Comparisons use only exact scope overlap.
- Full-plan reference scope ends at the ExpectedPerformancePlan's canonical total score duration, not the last attack onset.
- Pedal reference evidence is directly comparable only when both takes use the exact same pedal-analysis engine version; incompatible versions make only Pedal unavailable.
- Reference Voicing always follows current user intent. Reuse frozen V4 Voicing only for semantically equivalent intent; otherwise derive comparison-only V2/V3/V4 Voicing in memory with explicit current-engine provenance. Null current intent means Voicing comparison is unavailable. Never mutate the attempt or change its historical panels.
- V4 persistence reads deeply validate Voicing and every reference dimension, observation, coverage relationship, finite numeric value, overlap bound, and provenance. Preserve frozen reference-comparison 1.0.0 attempts; new attempts use 1.1.0 without a schema/store migration.
- Historical reference evidence uses frozen Timing, Expression, and Pedal snapshots without regrading or mutating old attempts. Comparison-only Voicing derivation never changes historical presentation.
- Future professional or imported reference performances remain alternative realizations, not the correct answer.

## Commands

- Install: `npm install`
- Development: `npm run dev`
- Test: `npm test`
- Type-check: `npm run type-check`
- Lint: `npm run lint`
- Production build: `npm run build`

## Git milestone rule

For a requested milestone: implement it, run tests, type-check, lint, and production build, inspect the complete diff and Git status, fix problems, then create the requested local commit. Never push unless explicitly instructed. Commit this file with relevant milestones.
