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

## Engineering rules

- Keep TypeScript strict; avoid `any` and fix type or lint failures instead of suppressing them.
- Do not fake functionality. Label future and mock behavior honestly.
- Preserve existing conventions when they remain sensible.
- Keep domain and MIDI logic independent from React presentation.
- Work in small, independently verifiable milestones.
- Do not introduce a backend, database, or large dependency before it is requested.
- Keep dependencies lightweight and justified.

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

## Commands

- Install: `npm install`
- Development: `npm run dev`
- Test: `npm test`
- Type-check: `npm run type-check`
- Lint: `npm run lint`
- Production build: `npm run build`

## Git milestone rule

For a requested milestone: implement it, run tests, type-check, lint, and production build, inspect the complete diff and Git status, fix problems, then create the requested local commit. Never push unless explicitly instructed. Commit this file with relevant milestones.
