# Frontend architecture

Phase 10 is a React, strict TypeScript, Vite, and Tailwind local-first application with no backend. React Router provides the application shell and routes. Imports, Practice, and historical Results are lazy-loaded so score, capture, alignment, grading, and notation workflows remain outside the initial Home route chunk.

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
            └────────────── alignment ─────────────┘
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
- `src/features/alignment`: performed-onset derivation, multiset pitch costs, monotonic sequence alignment, robust time fitting, immutable results, diagnostics, and neutral presentation.
- `src/features/note-grading`: physical expected-key targets, conservative wrong-pitch assignment, explicit grading scopes, note-result semantics, F1 metrics, immutable results, and pitch-only presentation.
- `src/features/timing-analysis`: anchor policy, robust tempo-normalized rhythm intervals, local tempo windows, speed/stability/trend metrics, qualitative tempo-direction observations, immutable results, and timing presentation.
- `src/features/performance-results`: pure measure/section aggregation, evidence and confidence, Practice Priority ranking, deterministic mistake and notation mapping, application-owned highlight models, result view state, and presentation.
- `src/features/expression-analysis`: correct-match observation mapping, robust performance-relative velocity normalization, authored dynamics targets, tempo-aware physical key articulation, independent evidence/reliability, and presentation.
- `src/features/pedal-analysis`: authored pedal-phrase pairing, raw/effective CC64 timelines, affine-clock timing correspondence, independent score/reliability, damper-hold and key-interaction context, and presentation.
- `src/features/persistence`: repository contract, serializable records, typed storage errors, local-calendar keys, SHA-256 score fingerprinting, indexed range queries, and the isolated versioned IndexedDB adapter.
- `src/features/progress`: pure personal-best, comparability, rolling-average, and trend derivations.
- `src/features/repertoire`: deterministic presentation sorting for persisted Repertoire entries.
- `src/features/score-renderer`: the isolated OSMD adapter. This is the only feature that imports OSMD.
- `src/pages`: route-level compositions.
- `src/styles`: the design system and responsive layout.

`WebMidiService` owns browser access and input subscriptions. It detaches local selection and message handlers before awaiting browser-driver close, tolerates close rejection, and uses operation identity so stale async teardown/open work cannot clear or restore a newer selection. Re-requested access detaches the previous state handler. `parseMidiMessage` is a pure boundary that converts bytes into typed events carrying the browser's monotonic `MIDImessageEvent.timeStamp`. `MidiProvider` exposes connection state, devices, selection, active notes, sustain, recent events, errors, and normalized-event subscription without leaking raw messages into page components. Its own latest-request gate prevents a stale selection completion or error from changing React state after a newer select or deselect. Provider runtime state treats a same-ID port whose state becomes disconnected as unavailable, clears physical-key state, and drives the recorder's explicit disconnect lifecycle.

## Score import flow

`loadMusicXmlFile` accepts `.xml`, `.musicxml`, or `.mxl`, applies source limits, resolves MXL containers, validates XML safety, and returns one canonical XML string. That exact string branches independently to `parseMusicXml` and `OsmdScoreRenderer`.

`parseMusicXml` walks each part sequentially. Active divisions, signature context, measure cursor, and maximum cursor are explicit parser state. It returns deterministic application types using exact rational quarter-note positions. See `SCORE_MODEL.md` and `MUSICXML_SUPPORT.md`.

The renderer and Imports page are code-split. OSMD is dynamically imported inside the adapter, which owns instance creation, async-staleness guards, resize behavior, rerendering, errors, and cleanup. The light paper surface is contained within the dark application shell.

## Practice flow

Imports requires an explicit part choice for multi-part scores, classifies the musical relationship, and transactionally creates a Work, Arrangement, immutable ScoreVersion, and RepertoireEntry. Canonical XML and the canonical included-part set are persisted as ScoreVersion identity; the Practice plan is built from the returned persisted version rather than transient form state. A changed part set creates a new version under the same Arrangement while old attempts retain their version. Active renderer and analysis objects remain session-local. A saved Arrangement reconstructs its exact plan after reload. Successful clear-all also removes the in-memory Practice session only after repository deletion completes.

`PerformanceRecorder` consumes every normalized MIDI event directly, outside React render cycles. The hook only batches presentation updates. A device disconnect stops the active take with an explicit reason, and a stopped recording is deeply frozen before presentation. Practice speed is captured in that recording's context; while a take exists the selector is locked and the captured speed is used in labels and grading. An unsaved take may be discarded; after Save, clearing the current take resets only the Practice workspace and explicitly preserves persisted history.

After a take stops, Practice can dynamically load the pure alignment engine. The UI first exposes an explicit processing state, then presents correspondence counts, the affine time transform, a monotonic path, exact pitch pairings, and neutral unpaired groups. The engine never updates recording state or score state, and the analysis remains session-only.

Once an alignment snapshot exists, Practice can dynamically load the note-grading engine. The safe default grades only the credible aligned span; users can explicitly choose full-plan intent. Changing scope reinterprets the same alignment without reparsing MusicXML, rerecording MIDI, or rerunning alignment. The neutral Phase 4 view remains available beneath the capture, and the grading result remains session-only.

After note scope is established, Practice can dynamically load timing analysis. Rhythm uses structurally continuous matched-onset intervals normalized by a robust local scale, while Tempo compares the alignment/global and local speed ratios with the effective practice timeline. Numeric tempo changes remain authoritative; preserved qualitative words produce directional observations without fabricated targets. Notes, Rhythm, and Tempo remain separate session-only metrics.

Practice can then dynamically build `PerformanceResults` from the existing normalized score, plan, alignment, note grade, and timing result. Scope changes recompute downstream snapshots but reuse the score, recording, and alignment. Phase 9 independently analyzes authored Dynamics and Articulation from the same immutable truths. Phase 10 then compares authored damper phrases with the raw CC64 timeline through the existing affine clock and adds neutral pedal/key interaction context without rewriting Articulation. Neither layer changes the Phase 7 measure map or Practice Priority. An explicit Save action writes the raw recording, plan, every analysis snapshot, engine versions, and PracticeSession linkage in one IndexedDB transaction. Summary-driven pages never deserialize raw MIDI. Piece history batch-loads the Arrangement's ScoreVersions so every row names its attempt's actual version; Historical Results read that exact canonical ScoreVersion and snapshots without regrading. See `PERFORMANCE_RESULTS.md`, `EXPRESSION_ANALYSIS.md`, `PEDAL_ANALYSIS.md`, `PERSISTENCE.md`, and `PROGRESS_MODEL.md`.

Technique Lab and Library remain honest future-state previews. Technique exposes no fabricated personal ratings or history, and Library exposes metadata only with unavailable score actions plus a link to the real import flow. Validation-only GitHub Actions runs tests, strict type-checking, lint, build, and dependency audit with read-only repository permissions.
