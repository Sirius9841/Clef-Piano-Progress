# MIDI performance recording

`PerformanceRecorder` consumes the existing normalized MIDI event stream. It never parses raw bytes and knows nothing about MusicXML.

## Clocks and lifecycle

Browser MIDI events carry `MIDImessageEvent.timeStamp`, a monotonic high-resolution timestamp. The recorder subtracts an injected monotonic start time to create `relativeMs`. `startedAt` is a separate ISO wall-clock value describing when the session happened; it is never used for musical intervals.

The explicit lifecycle is `idle → recording → stopped`. Pre-start timestamps are rejected rather than clamped. Arrival sequence is assigned before any derivation and remains authoritative when timestamps are equal. A stopped recording is a deeply frozen snapshot; another take receives a new ID and buffer.

## Key presses

Note On creates a physical key press. Note Off pairs FIFO with the earliest unmatched Note On of the same MIDI channel and pitch, which handles repeated same-pitch activity deterministically. A held key at Stop keeps `releaseMs = null`. An orphan Note Off is preserved in events, creates no fake press, and produces a warning/statistic.

Sustain changes are preserved and counted, but they do not extend the physical key-release span in Phase 3. Acoustic/pedal interpretation belongs to later analysis.

## Disconnects and statistics

A selected-device disconnect stops capture with `device-disconnected`, retaining all data collected so far. A disconnect means either that the selected ID disappears or that the same ID remains present with a state other than `connected`. The provider clears selection, active keys, and sustain; its recording lifecycle then finalizes the active take. Reconnecting only makes the input available for explicit reselection. It never appends to or resumes the frozen take, and a subsequent Start creates a fresh recording ID and buffer.

The exact lifecycle is:

```text
connected and selected
→ removed or same-ID disconnected
→ provider clears input/keys/sustain
→ recorder stops with device-disconnected
→ reconnect remains unselected and does not resume
→ explicit reselect + Start creates a new take
```

Diagnostics include event, attack, release, unique-pitch, sustain-change, open-note, and orphan-release counts plus attack-velocity minimum, maximum, and average. They are capture facts, not performance-quality scores.

React controls Start, Stop, Record Again, and Discard, but the authoritative event buffer and all semantics remain in the domain service. Visual updates are animation-frame batched without dropping recorder events.
