# Frontend architecture

Phase 15.0 is a React, strict TypeScript, Vite, and local-first application with no backend. React Router provides the application shell and routes. Imports, Practice, and historical Results are lazy-loaded so score, capture, alignment, grading, and notation workflows remain outside the initial Home route chunk.

```text
                    UI / React presentation
                      ↓                 ↓
browser MIDI boundary       score import boundary
                      ↓                 ↓
 normalized MIDI events      canonical MusicXML
            ↓                           ↙       ↘
 PerformanceRecorder          NormalizedScore       OSMD renderer
            ↓                           ↓
 PerformanceRecording      ExpectedPerformancePlan
            └──── score-region localization ──────┘
                                ↓
                    bounded fine alignment
                                ↓
                         AlignmentResult
                                ↓
                        NoteGradingResult
                                ↓
                       TimingAnalysisResult
                     ↙                      ↘
              RhythmAnalysis          TempoAnalysis
                                ↓
                      PerformanceResults
                     ↙          ↓          ↘
              measure map   sections   mistake index

 NormalizedScore + plan + recording + alignment + note grade
                                ↓
                    ExpressionAnalysisResult
                     ↙                     ↘
             relative Dynamics     key Articulation
                                ↓
 Normalized score + plan + recording + alignment + note grade + expression
                                ↓
                      PedalAnalysisResult
                     ↙                     ↘
             authored CC64 timing      damper/key context

 Normalized score + plan + correct matches + normalized intensity + explicit intent
                                ↓
                       VoicingAnalysisResult

 two immutable attempt profiles with compatible score identity and overlap
                                ↓
                    ReferenceComparisonResult
            (neutral dimension differences; no aggregate score)
```

The expected and observed Phase 3 outputs remain independent truth layers. Phase 4 produces neutral correspondence and its canonical affine clock. Phase 5 interprets pitch-only semantics. Phase 6 consumes the same alignment plus Phase 5 scope/provenance and produces separate rhythm and tempo analyses. Phase 7 aggregates those immutable snapshots into measure and section evidence without realignment or a composite overall score. OSMD remains a sibling renderer and is not an engine input.

## Source organization

- `src/app`: routing and the persistent application shell.
- `src/components`: shared presentation primitives.
- `src/domain`: centralized product terminology and relationships.
- `src/features/midi`: browser transport, pure MIDI parsing, normalized event types, React state, diagnostics, and piano visualizer.
- `src/features/musicxml`: untrusted-file loading, MXL extraction, XML validation, exact-time arithmetic, pure parsing, normalized score types, pitch conversion, statistics, and tests.
- `src/features/expected-performance`: pure plan construction, tie-chain reduction, exact onset grouping, tempo timelines, and score-time conversion.
- `src/features/performance`: framework-independent recorder, key-press derivation, statistics, immutable snapshots, and its React controller hook.
- `src/features/practice`: session-local transport of the imported score, plan, included parts, and practice speed.
- `src/features/alignment`: performed-onset derivation, deterministic score-region localization, multiset pitch costs, bounded monotonic sequence alignment, robust time fitting, immutable results, diagnostics, and neutral presentation.
- `src/features/note-grading`: physical expected-key targets, conservative wrong-pitch assignment, explicit grading scopes, note-result semantics, F1 metrics, immutable results, and pitch-only presentation.
- `src/features/timing-analysis`: anchor policy, robust tempo-normalized rhythm intervals, local tempo windows, speed/stability/trend metrics, qualitative tempo-direction observations, immutable results, and timing presentation.
- `src/features/performance-results`: pure measure/section aggregation, evidence and confidence, Practice Priority ranking, deterministic mistake and notation mapping, application-owned highlight models, result view state, and presentation.
- `src/features/expression-analysis`: correct-match observation mapping, robust performance-relative velocity normalization, authored dynamics targets, tempo-aware physical key articulation, independent evidence/reliability, and presentation.
- `src/features/pedal-analysis`: authored pedal-phrase pairing, exact/tempo-interpolated/residual-transfer local timing anchors with affine fallback, channel-specific raw/effective CC64 timelines, bounded monotonic transition matching, event-level coverage/reliability, damper-hold and key-interaction context, and presentation.
- `src/features/voicing-analysis`: deterministic score voice lanes, validated ScoreVersion-specific foreground/support regions, same-onset correct-key balance analysis using the existing normalized intensity population, immutable evidence, and intent editing/presentation.
- `src/features/reference-comparison`: immutable interpretation profiles and neutral overlap-only comparisons for tempo shape, Dynamics, Articulation, Pedal, and Voicing. It has no aggregate similarity or quality score.
- `src/features/persistence`: repository contract, serializable records, typed storage errors, local-calendar keys, SHA-256 score fingerprinting, indexed range queries, and the isolated versioned IndexedDB adapter.
- `src/features/progress`: pure personal-best, comparability, rolling-average, and trend derivations.
- `src/features/practice-planning`: bounded context preparation plus pure longitudinal section history, explainable recommendations, speed-context decisions, and optional time-budget composition.
- `src/features/preferences`: versioned browser-local application and score appearance preferences, including live system-theme resolution. These preferences are presentation-only and do not change IndexedDB schema 4.
- `src/features/repertoire`: deterministic presentation sorting for persisted Repertoire entries.
- `src/features/score-renderer`: the isolated OSMD adapter. This is the only feature that imports OSMD.
- `src/pages`: route-level compositions.
- `src/styles`: the design system and responsive layout.

The Phase 15 presentation layer consumes repository summaries and existing pure read models. `CurrentPracticePlanning` prepares and derives the current `practice-planning-1.0.1` projection for an exact Arrangement/current ScoreVersion and renders WHAT, WHY, evidence authority, speed provenance, and exact supporting identities without persisting recommendations. Home, Repertoire, Piece Detail, Progress, and historical Results derive Mastery, Skills, PBs, trends, and planning from their canonical owners rather than recreating formulas in JSX. See `UI_SYSTEM.md`.

Application appearance and score appearance are sibling concerns. `AppearanceProvider` persists a small versioned localStorage preference, retains `System` as the requested application value, resolves it through live `prefers-color-scheme`, and exposes an independent `Paper` or `Night` notation preference. CSS presentation may re-ink OSMD output for Night mode, but it never modifies MusicXML, `NormalizedScore`, expected plans, or frozen results.

`WebMidiService` owns browser access and input subscriptions. It detaches local selection and message handlers before awaiting browser-driver close, tolerates close rejection, and uses operation identity so stale async teardown/open work cannot clear or restore a newer selection. Re-requested access detaches the previous state handler. `parseMidiMessage` is a pure boundary that converts bytes into typed events carrying the browser's monotonic `MIDImessageEvent.timeStamp`. `MidiProvider` exposes connection state, devices, selection, active notes, sustain, recent events, errors, and normalized-event subscription without leaking raw messages into page components. Its own latest-request gate prevents a stale selection completion or error from changing React state after a newer select or deselect. Provider runtime state treats a same-ID port whose state becomes disconnected as unavailable, clears physical-key state, and drives the recorder's explicit disconnect lifecycle.

## Score import flow

`loadMusicXmlFile` accepts `.xml`, `.musicxml`, or `.mxl`, applies source limits, resolves MXL containers, validates XML safety, and returns one canonical XML string. That exact string branches independently to `parseMusicXml` and `OsmdScoreRenderer`.

`parseMusicXml` walks each part sequentially. Active divisions, signature context, measure cursor, and maximum cursor are explicit parser state. It returns deterministic application types using exact rational quarter-note positions. See `SCORE_MODEL.md` and `MUSICXML_SUPPORT.md`.

The renderer and Imports page are code-split. OSMD is dynamically imported inside the adapter, which owns instance creation, async-staleness guards, resize behavior, rerendering, errors, and cleanup. The light paper surface is contained within the dark application shell.

## Practice flow

Imports requires an explicit part choice for multi-part scores, classifies the musical relationship, and transactionally creates a Work, Arrangement, immutable ScoreVersion, and RepertoireEntry. Canonical XML and the canonical included-part set are persisted as ScoreVersion identity; the Practice plan is built from the returned persisted version rather than transient form state. A changed part set creates a new version under the same Arrangement while old attempts retain their version. Active renderer and analysis objects remain session-local. A saved Arrangement reconstructs its exact plan after reload. Successful clear-all also removes the in-memory Practice session only after repository deletion completes.

`PerformanceRecorder` consumes every normalized MIDI event directly, outside React render cycles. Start enters an armed state: pre-start CC64 updates the initial sustain context, while the first Note On establishes both musical zero and the persisted wall-clock start. Cancelling or disconnecting while armed creates no recording. The hook only batches presentation updates. A device disconnect stops an active take with an explicit reason, and a stopped recording is deeply frozen before presentation. Practice speed and intended-start context are locked while armed or recording; the captured speed is used in labels and grading. An unsaved take may be discarded; after Save, clearing the current take resets only the Practice workspace and explicitly preserves persisted history.

After a take stops, a small race-safe orchestrator dynamically runs the pure Alignment → aligned-span Notes → Timing → Performance Results pipeline and presents Take Review as the normal destination. Alignment `2.0.1` first proposes contiguous score regions from pitch fingerprints and evaluates them without timing. Beginning or a both-ends-bounded Phase 14 `PlanningSectionIdentity` may resolve a close candidate only when its own structural evidence remains credible. Ambiguous repeated passages expose bounded candidates for user confirmation and then resume automatically; divergent takes fail closed. Every actually constructed localization, coarse, and refined matrix is guarded before allocation, while a hypothetical whole-score matrix is irrelevant. The engine never updates recording or score state, and analysis remains session-only. See `PERFORMANCE_LOCALIZATION.md`.

Once an alignment snapshot exists, Practice can dynamically load the note-grading engine. Modern aligned-span grading uses only the frozen `MatchedTakeRegion`; unresolved localization makes downstream current-take grading unavailable instead of silently treating the whole score as played. Explicit full-plan scope remains a forensic choice. Changing scope reinterprets the same alignment without reparsing MusicXML or rerecording MIDI. The neutral alignment view remains available beneath the compact Take Review.

After note scope is established, Practice can dynamically load timing analysis. Rhythm uses structurally continuous matched-onset intervals normalized by a robust local scale, while Tempo compares the alignment/global and local speed ratios with the effective practice timeline. Timing `1.1.0` rejects local windows whose expected and performed onset-index geometry disagree; rejected windows lower evidence authority and never become cosmetically clamped BPM samples. Numeric tempo changes remain authoritative; preserved qualitative words produce directional observations without fabricated targets. Notes, Rhythm, and Tempo remain separate session-only metrics.

Practice can then dynamically build `PerformanceResults` from the existing normalized score, plan, alignment, note grade, and timing result. Compact Take Review presents the matched range, independent Notes/Rhythm/Tempo cards, a localization-bounded measure map, at most five problem measures, one selected evidence dimension, and truthful unavailable Pedal/Voicing states. Detailed engine panels remain lazy forensic disclosure. Phase 7 Practice Priority still describes one take and is never reused as played-region identity; Phase 14 planning remains a separate current read model. Scope changes recompute downstream snapshots but reuse the score, recording, and alignment. Phase 9 independently analyzes authored Dynamics and Articulation from the same immutable truths. Phase 10.2 compares authored damper phrases with channel-specific CC64 through trustworthy local Phase 4 correspondences. Phase 11 adds explicit-intent Voicing and optional neutral comparison. An explicit Save action writes the raw recording, plan, every analysis snapshot, engine versions, and PracticeSession linkage in one IndexedDB transaction. Summary-driven pages never deserialize raw MIDI. Historical Results read their exact frozen ScoreVersion and snapshots without regrading. See `PERFORMANCE_LOCALIZATION.md`, `PERFORMANCE_RESULTS.md`, `EXPRESSION_ANALYSIS.md`, `PEDAL_ANALYSIS.md`, `VOICING_ANALYSIS.md`, `REFERENCE_COMPARISON.md`, `PERSISTENCE.md`, and `PROGRESS_MODEL.md`.

## Fidelity, performance, and interpretation boundaries

Clef preserves four distinct layers:

```text
Structural truth       authored score notation
Performance truth      the observed MIDI performance
Interpretive timing    how the pianist shaped score time
Technique / fidelity   evidence about relevant authored relationships

Artistic quality       not reducible to one objective numeric truth
```

Score fidelity is not musical quality. Literal conformity may be relevant evidence, but coherent rubato, phrasing, dynamics, articulation, and pedaling can legitimately depart from a globally affine realization. Timing/Tempo owns temporal-shape evidence; Pedal asks whether CC64 coordinated with the resulting aligned musical structure so one expressive timing decision is not independently punished twice. Dynamics describes authored contrast/direction fidelity, not one mandatory emotional curve. Articulation remains physical key behavior.

Saved reference performances remain examples, style references, and interpretive alternatives. Clef reports dimension-specific differences, but the reference is never the absolute expressive answer and no composite closeness score is calculated. No Emotion, Musicality, or Expressiveness score is implied by this architecture.

Technique Lab is a separate Phase 12 domain. Deterministic specs compile key-aware MusicXML to the canonical normalized score and an ExpectedPerformancePlan; real MIDI then reuses alignment, note grading, and timing before Technique-only facet analysis. Frozen TechniqueAttempt V1 (`1.0.0`) and the three explicit V2 engine pairs (`1.1.0/1.1.0`, `1.1.1/1.1.1`, and current `1.1.1/1.1.2`) live in dedicated schema-4 stores, so they do not contaminate Work, Arrangement, ScoreVersion, PracticeSession, PerformanceAttempt, or repertoire progress. Current V2 analysis excludes untouched material outside the attempted aligned span, retains failures inside it, and defines facet coverage as trustworthy observations over attempted authored opportunities. Tempo shares TimingAnalysis's pure local-window geometry: authored attempted windows define opportunity denominators, while surviving mapped `LocalTempoSample`s define score quality. Exercise/alignment structure and every frozen take identity are verified before evidence preparation or module dispatch; persistence separately verifies exercise/plan structure plus P1 and score identity. Historical views render their exact saved version without reanalysis. See `TECHNIQUE_LAB.md`.

Phase 13.2 finalizes the two pure, derived read models above persistence summaries. `features/skill-model` consumes only validated Technique summaries, qualifies the exact current engine pair, centralizes template-aware authored challenge identity and its synchronized display envelope, caps each context to its latest three model attempts, and separates gentle quality continuity from no-floor confidence authority. `features/mastery-model` consumes only lightweight performance summaries for one Arrangement and its current ScoreVersion; demonstrated speed has attempt and independently capped session authority from its own exact supporting bucket, while overall recency and confidence reflect the full bounded evidence distribution. Neither model imports React, IndexedDB, OSMD, MIDI, or raw analysis engines; neither creates a store or mutates frozen history. See `SKILL_MODEL.md` and `MASTERY_MODEL.md`.

Phase 14 adds a third derived read-model boundary. `preparePracticePlanningContext` resolves and freezes one planning policy, filters lightweight summaries to one Arrangement/current ScoreVersion, latest eight sessions, and three attempts per session before loading at most 24 frozen attempts through the repository. The pure planner reuses that exact policy to build exact source-measure section histories, session-capped authority, one coherent highest-speed frontier, Mastery verification, independent Technique targets, and an optional bounded session composition. Composition merges multiple actions for one canonical section into one block while retaining recommendation IDs and speed provenance. The planner neither imports React/OSMD nor calls IndexedDB, never regrades or mutates evidence, and preserves Phase 7 Practice Priority unchanged. See `PRACTICE_PLANNING.md`.

## V1 release-safety architecture

Phase 15.1 keeps all data operations behind `PianoProgressRepository`. A consistent nine-store snapshot feeds the shared deep/cross-store integrity verifier, deterministic SHA-256 backup export, inspect-only restore preview, and one-transaction replacement. The external backup format is versioned independently from IndexedDB schema `4`; it is not a migration or a new persisted model. The only repair path rebuilds the two deterministic summary stores and refuses authoritative corruption.

Product routes sit inside a top-level non-destructive error boundary. Unexpected rendering failures provide Home, reload, and Local Data recovery actions without clearing storage or exposing production stacks. Performance-history and Technique-history DOM populations are incremental, and `listRepertoire` groups versions, summaries, and session statistics in single passes rather than rescanning full collections per Arrangement. OSMD remains isolated in its lazy renderer chunk. See `BACKUP_AND_RECOVERY.md` and `RELEASE_CHECKLIST.md`.

Phase 15.2.1 advances Alignment from `2.0.0` to `2.0.1`; Timing Analysis remains `1.1.0`. `PerformanceAttemptV4` remains the current record family and IndexedDB stays at schema `4`; no migration is required. Alignment `1.0.0` and `2.0.0` snapshots remain readable, frozen, and never upgraded in place.
