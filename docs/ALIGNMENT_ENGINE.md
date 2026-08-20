# Score ↔ performance alignment engine

Phase 4 answers one neutral question: which observed MIDI onset groups most plausibly correspond to which expected score onset groups? It does not decide whether a note is correct or whether timing is good.

## Why index comparison is invalid

Pairing `expected[i]` with `performed[i]` fails after one missing or additional event. Alignment therefore uses deterministic dynamic programming with three operations: group correspondence, expected-only group, and performed-only group. The path is monotonic, so correspondences never cross.

```text
Expected:   C   D   E   F   G
Performed:  C   D   F#  F   G
Path:       ↔   ↔   ↔   ↔   ↔
```

The E/F# group correspondence has no exact attack pair. Later groups remain stable, and no grade is inferred.

## Alignment units

Score-side units are Phase 3 `ExpectedOnsetGroup` objects. Their canonical positions remain exact `MusicalTime`; the existing tempo timeline converts each position to reference milliseconds at the recording's captured practice speed.

Performance-side units are derived from `RecordedKeyPress` attacks. Clustering preserves arrival sequence and every attack. A group grows while the local gap is at most 45 ms and total spread is at most 90 ms. A repeated physical pitch always begins another group, preventing fast repeated notes from collapsing into an impossible same-key chord. Group spread, velocity, channel, and key-press provenance remain available, while releases and sustain do not control attack correspondence.

## Two-pass strategy

The coarse pass uses pitch-multiset costs and explicit 1.25 expected/performed gap costs without absolute timing. Multiset comparison preserves duplicate pitch multiplicity. Unpaired expected and performed pitches cost 1.0 and 0.9 respectively, so a single substitution can remain a correspondence while a genuine inserted group is normally cheaper as a gap.

Plausible coarse correspondences become time anchors. The engine estimates:

```text
performedMs = offsetMs + scale × referenceMs
```

One anchor fits offset with a 1× scale fallback. Multiple anchors use a median pairwise-slope seed, median intercept, deterministic outlier rejection, and a retained-anchor least-squares refit. Scale is bounded to 0.35×–3× with a warning when clamped. Opening recording silence is therefore offset metadata, not a sequence gap or rhythm error.

The refined pass adds a bounded timing component. Absolute residual is normalized over 180 ms and capped at 0.35 cost, ensuring pitch structure generally dominates while timing can disambiguate repeated material. Dynamic-programming ties prefer correspondence, then expected-only, then performed-only.

## Results and reliability

`AlignmentResult` includes group and attack correspondences, unpaired group IDs, exact attack pairs, predicted/observed times, residuals, the fitted transform, engine version `1.0.0`, path costs, counts, spread statistics, and structured warnings. Status is `aligned`, `ambiguous`, `insufficient-data`, or `failed`. Results are deeply frozen, and neither input is sorted or mutated.

Empty inputs return typed insufficient-data snapshots. Partial prefixes and basic unique mid-piece passages are supported through ordinary gap operations. Inputs requiring more than 4,000,000 DP cells fail explicitly without truncation.

## Current limitations

- One expected onset group corresponds to at most one performed onset group. A chord spread beyond clustering limits may become several performed groups.
- A very rapid distinct-pitch melody and an intentionally rolled chord can be observationally indistinguishable inside the clustering window.
- Extremely ambiguous repeated passages use deterministic tie-breaking but may not reflect the player's intended repetition.
- Arbitrary section detection is sequence-driven; short non-unique fragments remain inherently ambiguous.
- Grace events remain outside fixed-group alignment because Phase 3 intentionally gives them no invented exact time.

Alignment engine versioning is centralized so future persisted analyses can retain historical semantics when algorithms change.
