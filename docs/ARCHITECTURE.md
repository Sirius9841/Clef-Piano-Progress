# Frontend architecture

Phase 7 is a React, strict TypeScript, Vite, and Tailwind frontend with no backend. React Router provides the application shell and routes. Imports and Practice are lazy-loaded so score, capture, alignment, grading, and result workflows remain outside the initial Home route chunk.

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
```

The expected and observed Phase 3 outputs remain independent truth layers. Phase 4 produces neutral correspondence and its canonical affine clock. Phase 5 interprets pitch-only semantics. Phase 6 consumes the same alignment plus Phase 5 scope/provenance and produces separate rhythm and tempo analyses. Phase 7 aggregates those immutable snapshots into measure and section evidence without realignment or a composite overall score. OSMD remains a sibling renderer and is not an engine input.

## Source organization

- `src/app`: routing and the persistent application shell.
- `src/components`: shared presentation primitives.
- `src/domain`: centralized product terminology and relationships.
- `src/data`: Phase 1 mock repertoire and progress data.
- `src/features/midi`: browser transport, pure MIDI parsing, normalized event types, React state, diagnostics, and piano visualizer.
- `src/features/musicxml`: untrusted-file loading, MXL extraction, XML validation, exact-time arithmetic, pure parsing, normalized score types, pitch conversion, statistics, and tests.
- `src/features/expected-performance`: pure plan construction, tie-chain reduction, exact onset grouping, tempo timelines, and score-time conversion.
- `src/features/performance`: framework-independent recorder, key-press derivation, statistics, immutable snapshots, and its React controller hook.
- `src/features/practice`: session-local transport of the imported score, plan, included parts, and practice speed.
- `src/features/alignment`: performed-onset derivation, multiset pitch costs, monotonic sequence alignment, robust time fitting, immutable results, diagnostics, and neutral presentation.
- `src/features/note-grading`: physical expected-key targets, conservative wrong-pitch assignment, explicit grading scopes, note-result semantics, F1 metrics, immutable results, and pitch-only presentation.
- `src/features/timing-analysis`: anchor policy, robust tempo-normalized rhythm intervals, local tempo windows, speed/stability/trend metrics, qualitative tempo-direction observations, immutable results, and timing presentation.
- `src/features/performance-results`: pure measure/section aggregation, evidence and confidence, Practice Priority ranking, deterministic mistake and notation mapping, application-owned highlight models, result view state, and presentation.
- `src/features/score-renderer`: the isolated OSMD adapter. This is the only feature that imports OSMD.
- `src/pages`: route-level compositions.
- `src/styles`: the design system and responsive layout.

`WebMidiService` owns browser access and input subscriptions. `parseMidiMessage` is a pure boundary that converts bytes into typed events carrying the browser's monotonic `MIDImessageEvent.timeStamp`. `MidiProvider` exposes connection state, devices, selection, active notes, sustain, recent events, errors, and normalized-event subscription without leaking raw messages into page components.

## Score import flow

`loadMusicXmlFile` accepts `.xml`, `.musicxml`, or `.mxl`, applies source limits, resolves MXL containers, validates XML safety, and returns one canonical XML string. That exact string branches independently to `parseMusicXml` and `OsmdScoreRenderer`.

`parseMusicXml` walks each part sequentially. Active divisions, signature context, measure cursor, and maximum cursor are explicit parser state. It returns deterministic application types using exact rational quarter-note positions. See `SCORE_MODEL.md` and `MUSICXML_SUPPORT.md`.

The renderer and Imports page are code-split. OSMD is dynamically imported inside the adapter, which owns instance creation, async-staleness guards, resize behavior, rerendering, errors, and cleanup. The light paper surface is contained within the dark application shell.

## Practice flow

Imports requires an explicit part choice for multi-part scores, builds an `ExpectedPerformancePlan`, and places the canonical XML, normalized score, plan, and speed in a session-local provider. Practice reuses the OSMD adapter and piano visualizer. Refreshing loses this in-memory session by design.

`PerformanceRecorder` consumes every normalized MIDI event directly, outside React render cycles. The hook only batches presentation updates. A device disconnect stops the active take with an explicit reason, and a stopped recording is deeply frozen before presentation.

After a take stops, Practice can dynamically load the pure alignment engine. The UI first exposes an explicit processing state, then presents correspondence counts, the affine time transform, a monotonic path, exact pitch pairings, and neutral unpaired groups. The engine never updates recording state or score state, and the analysis remains session-only.

Once an alignment snapshot exists, Practice can dynamically load the note-grading engine. The safe default grades only the credible aligned span; users can explicitly choose full-plan intent. Changing scope reinterprets the same alignment without reparsing MusicXML, rerecording MIDI, or rerunning alignment. The neutral Phase 4 view remains available beneath the capture, and the grading result remains session-only.

After note scope is established, Practice can dynamically load timing analysis. Rhythm uses structurally continuous matched-onset intervals normalized by a robust local scale, while Tempo compares the alignment/global and local speed ratios with the effective practice timeline. Numeric tempo changes remain authoritative; preserved qualitative words produce directional observations without fabricated targets. Notes, Rhythm, and Tempo remain separate session-only metrics.

Practice can then dynamically build `PerformanceResults` from the existing normalized score, plan, alignment, note grade, and timing result. Scope changes recompute the downstream note/timing/result snapshots but reuse the score, recording, and alignment. The results UI owns only selection/filter state; aggregation and notation mapping remain pure. `ScoreHighlightModel` forms the application boundary to the OSMD adapter, which displays measure/problem focus without becoming a source of grading truth. See `PERFORMANCE_RESULTS.md`.
