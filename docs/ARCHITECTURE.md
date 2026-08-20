# Frontend architecture

Phase 3 is a React, strict TypeScript, Vite, and Tailwind frontend with no backend. React Router provides the application shell and routes. Imports and Practice are lazy-loaded so score and capture workflows remain outside the initial Home route chunk.

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
            └──────────── future alignment ────────┘
                                ↓
                     future grading
```

The two Phase 3 outputs are deliberately independent. Alignment, grading, and persistence do not exist yet. OSMD remains a sibling consumer of validated XML, not an upstream dependency of `NormalizedScore` or `ExpectedPerformancePlan`.

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
