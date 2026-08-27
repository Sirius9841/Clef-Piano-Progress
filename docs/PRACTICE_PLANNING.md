# Practice Planning

Practice Planning answers one current product question: **given the trustworthy evidence Clef already has, what should the pianist practice next, and why?** It is a deterministic, explainable read model. It does not grade a new performance, rewrite history, judge musicality, manage repertoire, or claim universal piano pedagogy.

The current model version is `practice-planning-1.0.0`.

## Boundaries

The planning core is pure after context preparation, serializable, deeply immutable, explicit about `asOf`, and independent of React, OSMD, IndexedDB internals, and presentation copy. Its structured reason codes and evidence references are canonical; a future interface may turn them into prose without recomputing the decision.

Phase 14 ranks only Notes, Rhythm, and Tempo section evidence, Arrangement Mastery, and an independent lane of Technique Skill evidence. Dynamics, Articulation, Pedal, configured Voicing, Reference Comparison, and artistic interpretation are deliberately outside ranking. There is no overall Practice Score, Performance Score, pianist score, or claim that the ranking measures artistic quality.

The frozen Phase 7 per-attempt `PracticePriority` remains an answer to “which section looked weak in this attempt?” Phase 14 does not average it, alter it, or reinterpret it. Planning derives new longitudinal evidence from each supported frozen section's actual dimension metrics, confidence, reliability, speed, scope, and provenance.

## Bounded evidence selection

`preparePracticePlanningContext` uses `PianoProgressRepository` as its infrastructure boundary. It validates one exact Arrangement/current ScoreVersion and explicit `asOf`, then uses lightweight `AttemptSummary` values to select:

- that exact Arrangement and ScoreVersion;
- timestamps no later than `asOf`;
- reliable or limited summaries;
- the latest 8 distinct PracticeSessions;
- at most the latest 3 attempts in each selected session.

It therefore loads at most 24 authoritative full `PerformanceAttempt` snapshots with `getAttempt(id)`. It cross-checks attempt ID, Arrangement, ScoreVersion, PracticeSession, timestamp, duration, practice-speed multiplier, and grading scope against the summary. It consumes only ready reliable/limited frozen `PerformanceResults` with result aggregation `1.0.0`; it never re-runs a historical engine. Technique summaries remain lightweight inputs to current Skill Model `1.1.1`, and Mastery is derived with Mastery Model `1.1.1` at the same `asOf`.

## Exact section identity and scope

A section identity is the deterministic tuple:

```text
[scoreVersionId, startMeasureIndex, endMeasureIndex, sorted unique sourceMeasureIds]
```

`displayRange` is retained for presentation but is not identity. This prevents collisions across ScoreVersions, unrelated repeated display numbers, and different window lengths. Every observation also retains its frozen PerformanceResults, SectionResult, MeasureResult, note-result, rhythm-observation, and tempo-sample identifiers.

The referenced MeasureResults must form the exact contiguous section range and have source-measure provenance equal to the section's canonical source set. A partial-scope attempt contributes only when every constituent measure is inside the attempted scope. An unavailable dimension stays `null`; untouched or missing evidence never becomes zero or weakness.

## Attempt and session authority

For observation `i` at explicit planning time `asOf`:

```text
ageDays_i = max(0, (asOf - performedAt_i) / oneDay)
recency_i = 2 ^ (-ageDays_i / 45)
attemptAuthority_i = reliabilityWeight_i × sectionConfidenceWeight_i × recency_i
```

Reliable weight is `1.0`; limited weight is `0.65`. There is no recency floor. Values are bounded where required.

For one exact section, dimension, and PracticeSession, only the latest 3 relevant observations are retained. Their weighted quality is the session estimate, while:

```text
sessionAuthority = min(1, sum(retained attemptAuthority))
```

Cross-session quality is weighted by those capped session authorities. The output keeps raw attempt/session counts separate from effective attempt/session support. Six retries in one sitting can improve knowledge of that sitting, but they never masquerade as six independent sessions.

## Tentative and persistent weakness

Each of Notes, Rhythm, and Tempo has its own quality and weakness estimate; no artistic “section score” is created. A meaningful weakness begins at `0.20`. One-session evidence may produce `verify-section`, not persistent weakness.

An initial `focus-section` claim requires the weakness in at least one available dimension plus both:

- at least 2 distinct supporting sessions;
- at least `1.25` effective session support.

Three sessions and `2.25` effective session support qualify as strong evidence. These are centralized product heuristics, not universal teaching standards. Trend is intentionally `insufficient` in version 1.0.0; mixed practice speeds are never turned into a naive regression claim.

## Ranking and overlap

Recommendations are ordered deterministically, not assigned a pseudo-scientific aggregate score. Established repeated weakness precedes one-session uncertainty; then larger supported dimension deficit, greater effective independent-session support, newer evidence, musical order, and stable identity break ties. Overlapping section targets are suppressed within their action family at a centralized 50% overlap threshold, while distinct non-overlapping problems remain eligible. Each returned item has an explicit rank, exact target, reason codes, evidence strength, timestamps, and exact supporting attempt/session IDs.

## Practice-speed actions

Speed advice uses `practiceSpeedMultiplier`, never invented BPM. Speed contexts are evaluated separately. A single excellent take, or several excellent takes in one session, cannot trigger progression. A `+0.05` increase requires Notes, Rhythm, and Tempo control in the exact speed context, at least 2 distinct current sessions, and at least `1.5` effective session support for every dimension; suggestions are capped at `1.00`.

A reduction is never based on one take. Repeated same-speed weakness must first satisfy independent-session persistence; severe weakness (`0.30`) with progression-level support may suggest `-0.05`, bounded below by `0.50`, while less severe supported weakness holds the current speed. The planner only suggests actions and never changes practice speed automatically. Wider-context work is permitted only when actual safe context provenance exists; the core does not fabricate adjacent measure IDs.

## Mastery and Skill inputs

Mastery must match the exact Arrangement, current ScoreVersion, model `1.1.1`, and planning `asOf`. `needs-repetition` can request another qualifying full run at the candidate speed. `needs-current-support` requests current verification and never claims the speed is established. Planning never mutates Mastery or repertoire status.

Skill Ratings must use model `1.1.1` at the same `asOf`. A low-quality medium/high-confidence rating can independently suggest a Technique target; low-confidence evidence produces `refresh-technique-evidence` rather than a strong weakness claim. Sight Reading carries `requiresNewStimulus` so a later generator preserves first-pass semantics. Clef never claims a Technique Skill caused a repertoire mistake without explicit authored/user linkage.

## Optional session composition

When `availableMinutes` is omitted, only recommendations are returned. A supplied budget must be a positive integer. The deterministic composer uses at most 4 positive-duration blocks, never exceeds the budget, gives earlier supported priorities more time than later tentative work, and handles short sessions without zero-length filler.

A full-run block is included only when recent comparable accepted full-plan durations establish an evidence-backed median duration at the relevant Mastery speed and it fits. No duration is invented. The result labels composition as `product-heuristic-not-universal-pedagogy`; it is a scheduling aid, not a scientifically optimal lesson plan.

## Typed exclusions

Ordinary absence or incompatibility returns exclusions rather than crashing. Codes cover missing Arrangement/ScoreVersion identity, wrong Arrangement, different ScoreVersion, future or invalid summaries, provisional/unavailable evidence, bounded-history omissions, missing or unreadable full attempts, summary/full identity mismatch, unsupported result aggregation, incompatible results, malformed section topology/evidence, outside-scope sections, and dimensions with insufficient section evidence. Invalid caller contracts, such as malformed `asOf`, empty requested IDs, or impossible options/budgets, throw range errors.

## Persistence and interface status

Practice Planning is recomputed on demand and creates no records. IndexedDB remains schema 4 with the existing stores and PerformanceAttempt V1–V4 / TechniqueAttempt V1–V2 families. No historical snapshot is modified and no new attempt version exists.

Phase 14 UI integration is intentionally deferred while the final Clef interface is being designed. No unfinished UI is implied by the core milestone.
