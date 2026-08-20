# Frontend architecture

Phase 2 is a React, strict TypeScript, Vite, and Tailwind frontend with no backend. React Router provides the application shell and routes. The Imports route is lazy-loaded so the score workflow is absent from the initial Home route chunk.

```text
                    UI / React presentation
                      ↓                 ↓
browser MIDI boundary       score import boundary
                      ↓                 ↓
 normalized MIDI events      canonical MusicXML
                                        ↙       ↘
                         NormalizedScore       OSMD renderer
                                ↓
                  future alignment and grading
                                ↓
                   future backend/persistence
```

The score parser and MIDI normalization exist today; alignment, grading, and persistence do not. OSMD is deliberately a sibling consumer of validated XML, not an upstream dependency of `NormalizedScore`.

## Source organization

- `src/app`: routing and the persistent application shell.
- `src/components`: shared presentation primitives.
- `src/domain`: centralized product terminology and relationships.
- `src/data`: Phase 1 mock repertoire and progress data.
- `src/features/midi`: browser transport, pure MIDI parsing, normalized event types, React state, diagnostics, and piano visualizer.
- `src/features/musicxml`: untrusted-file loading, MXL extraction, XML validation, exact-time arithmetic, pure parsing, normalized score types, pitch conversion, statistics, and tests.
- `src/features/score-renderer`: the isolated OSMD adapter. This is the only feature that imports OSMD.
- `src/pages`: route-level compositions.
- `src/styles`: the design system and responsive layout.

`WebMidiService` owns browser access and input subscriptions. `parseMidiMessage` is a pure boundary that converts bytes into typed events. `MidiProvider` exposes connection state, devices, selection, active notes, sustain, recent events, and errors without leaking raw messages into page components.

## Score import flow

`loadMusicXmlFile` accepts `.xml`, `.musicxml`, or `.mxl`, applies source limits, resolves MXL containers, validates XML safety, and returns one canonical XML string. That exact string branches independently to `parseMusicXml` and `OsmdScoreRenderer`.

`parseMusicXml` walks each part sequentially. Active divisions, signature context, measure cursor, and maximum cursor are explicit parser state. It returns deterministic application types using exact rational quarter-note positions. See `SCORE_MODEL.md` and `MUSICXML_SUPPORT.md`.

The renderer and Imports page are code-split. OSMD is dynamically imported inside the adapter, which owns instance creation, async-staleness guards, resize behavior, rerendering, errors, and cleanup. The light paper surface is contained within the dark application shell.
