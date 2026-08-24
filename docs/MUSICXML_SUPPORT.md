# MusicXML support

Phase 2 intentionally targets realistic piano `score-partwise` files. Unsupported or ambiguous structures are surfaced as typed errors or structured warnings instead of being guessed.

| Feature | Phase 2 status |
| --- | --- |
| `score-partwise` | Supported |
| `score-timewise` | Detected; typed unsupported error |
| `.xml` / `.musicxml` | Supported and validated |
| `.mxl` | Supported via ZIP and `META-INF/container.xml`; conservative single-score fallback |
| Multiple parts / measures | Supported |
| Pitched notes and rests | Supported |
| Chords / cross-staff chord tones | Supported structurally |
| Multiple voices and staves | Supported; voice and staff remain distinct |
| `backup` / `forward` | Supported with exact cursor validation |
| Divisions changes | Supported sequentially |
| Exact fractional timing | Supported in quarter-note units |
| Grace notes | Preserved without invented duration or cursor advance |
| Cue notes | Preserved and marked; not yet performance expectations |
| Pitch spelling / accidentals | Preserved; integer alterations map to MIDI where within MIDI 0–127 |
| Microtonal pitch | Preserved with `midi: null` and warning |
| Pitches outside A0–C8 | Preserved with warning |
| Unpitched notes | Preserved without piano pitch and with warning |
| Sound and notation ties | Preserved separately |
| Tuplets | Exact MusicXML duration plus actual/normal ratio preserved |
| Dots | Count preserved; duration remains authoritative |
| Time signatures | Active context supported, including additive beat strings when safely calculable |
| Expected vs actual measure duration | Supported; mismatches warn and pickups remain valid |
| Key signatures | Fifths and optional mode supported |
| Clefs | Sign, line, octave change, and staff preserved |
| `<sound tempo>` | Supported |
| Metronome tempo | Common whole through 32nd beat units and dots normalized to quarter BPM |
| Dynamics | `ppp`, `pp`, `p`, `mp`, `mf`, `f`, `ff`, `fff` supported symbolically with part/measure/staff/voice provenance |
| Wedges | Crescendo, diminuendo, stop, and continue preserved with part/measure/staff/voice/number provenance |
| Pedal directions | Start, stop, change, and continue preserved; no grading semantics yet |
| Articulations | Staccato, staccatissimo, tenuto, accent, strong accent, and fermata preserved |
| Slurs | Start, stop, continue, and number preserved |
| External images/links | Rejected; no arbitrary resource fetching |
| XML DOCTYPE | Rejected |
| Playback, editing, annotations | Not implemented |
| Score-to-MIDI alignment and grading | Intentionally deferred to later phases |

## Input limits and errors

Source files are limited to 15 MB and canonical uncompressed MusicXML to 20 MB. Empty sources, unreadable archives, unsafe archive paths, ambiguous MXL roots, malformed XML, non-MusicXML roots, invalid essential timing/pitch data, and negative cursor movement are hard errors.

Warnings include microtonal or out-of-range pitch, unpitched notes, unsupported tempo/pedal forms, orphaned chord tones, and measure-duration mismatches. Every warning carries part, measure, and event context where practical.

Parser version `musicxml-parser-1.1.0` adds the lane and measure provenance used by Phase 9 wedge ownership. Existing immutable ScoreVersions keep their original parser provenance and are never rewritten.
