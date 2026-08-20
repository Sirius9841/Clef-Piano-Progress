# Normalized score model

`NormalizedScore` is the application-owned, renderer-independent representation of imported MusicXML. Future alignment and grading code consumes this model, never OpenSheetMusicDisplay objects.

## Exact musical time

All score positions and durations use immutable reduced `MusicalTime` fractions:

```ts
interface MusicalTime {
  readonly numerator: number
  readonly denominator: number
}
```

The canonical unit is one quarter note. An eighth note is `1/2`, a half note is `2/1`, a dotted quarter is `3/2`, and a triplet eighth can be `1/3`. Creation normalizes signs and common factors; addition, subtraction, multiplication, comparison, and equality remain exact. Conversion to JavaScript `number` is for display only.

MusicXML durations are interpreted as `duration / active divisions`. Divisions are sequential part state and may change between measures or within a measure. A timed event without valid divisions is a hard error.

## Hierarchy and position

```text
NormalizedScore
├─ metadata and statistics
├─ ordered parts
│  └─ ordered measures
│     └─ ordered note, rest, and forward events
├─ tempo and symbolic dynamic events
├─ wedge and pedal events
└─ structured warnings
```

Each measure records an exact `absoluteOnset`. Each event records both `onset` relative to its measure and `absoluteOnset` relative to the beginning of its part. Absolute positions advance by actual content duration, which correctly preserves pickup length, rather than forcing every measure to its nominal time signature.

Measures retain both `expectedDuration` from the active time signature and `actualContentDuration` from the furthest cursor position. Differences are warnings, not automatic failures; pickups and intentionally incomplete measures remain usable.

## Events and cursor semantics

A normal note or rest begins at the current cursor and advances it by its exact duration. A chord tone shares the preceding root onset and does not advance again. Chord roots and tones share a deterministic `chordId`, including cross-staff chord tones.

`backup` rewinds the measure cursor and enables overlapping voices; an impossible negative cursor is a hard error. `forward` is preserved as an event and advances the cursor. `maxCursorReached` tracks the furthest content position independently from later backups.

Notes preserve pitch spelling, piano MIDI mapping where exact, voice, staff, accidental text, dot count, tuplet ratio, sound and notation ties, common articulations, slurs, cue status, and grace status. Grace notes have no invented duration and do not advance the normal cursor. Rests remain first-class timing events.

## Context and directions

Measures snapshot active divisions, time signature, key signature, and per-staff clefs. Tempo events normalize supported markings to quarter-note BPM and retain exact absolute and measure-relative positions. Dynamic markings stay symbolic. Wedges and pedal directions retain exact positions and authored event types; no MIDI velocity or pedal grading values are invented.

## Identity and determinism

Score, measure, event, chord, tempo, dynamic, wedge, and pedal IDs are derived from stable source structure. Parsing unchanged XML twice produces equal IDs, ordering, timing, and output. This stability will allow later results and notation highlights to target exact score events.

## Renderer boundary

OSMD receives the same validated canonical XML for engraving, but its internal classes are not domain objects. Renderer upgrades, layout changes, or absence must not change parser output or prevent future headless grading. Renderer-specific preprocessing is not currently performed.
