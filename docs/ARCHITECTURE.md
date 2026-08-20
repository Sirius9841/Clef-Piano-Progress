# Frontend architecture

Phase 1 is a React, strict TypeScript, Vite, and Tailwind frontend with no backend. React Router provides the application shell and routes.

```text
UI / React presentation
        ↓
music domain + normalized MIDI events
        ↓
future performance/scoring engine
        ↓
future backend and persistence
```

Only the first two layers exist today. The interface consumes typed mock music data and a real browser MIDI state layer.

## Source organization

- `src/app`: routing and the persistent application shell.
- `src/components`: shared presentation primitives.
- `src/domain`: centralized product terminology and relationships.
- `src/data`: Phase 1 mock repertoire and progress data.
- `src/features/midi`: browser transport, pure MIDI parsing, normalized event types, React state, diagnostics, and piano visualizer.
- `src/pages`: route-level compositions.
- `src/styles`: the design system and responsive layout.

`WebMidiService` owns browser access and input subscriptions. `parseMidiMessage` is a pure boundary that converts bytes into typed events. `MidiProvider` exposes connection state, devices, selection, active notes, sustain, recent events, and errors without leaking raw messages into page components.

Future score parsing and scoring should follow the same direction: normalize data at the boundary, keep deterministic domain operations framework-independent, then expose results to the UI.
