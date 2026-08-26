# Skill Model

Skill Model `skill-model-1.0.0` derives carefully qualified current Technique state from immutable `TechniqueAttemptSummary` projections. It never reads raw MIDI, reparses an exercise, realigns a performance, regrades a facet, or mutates historical Technique records.

## Meaning and boundary

Clef publishes exactly eight independent ratings, one for each Technique Lab module. There is no overall pianist score, universal level, percentile, or difficulty-independent claim. `qualityEstimate` means current execution quality supported across the eligible challenge contexts represented in local Clef history. It must be read with confidence and the challenge envelope.

Only the exact current engine pair `technique-exercise-1.1.1` / `technique-analysis-1.1.2` is eligible. V1 and earlier V2 summaries remain valid frozen history but are excluded from current Skill Model evidence. Sight-reading accepts only an exact instance's first saved attempt with `first-pass` facet context.

## Evidence qualification

Applicable core facets are centralized per module. Ascending/descending-only scales do not require direction-change continuity, and steady Tempo Control exercises without authored tempo changes do not require transition control. Every applicable facet must be ready, reliable or limited, finite, and have at least `0.55` coverage. This threshold reuses the conservative Phase 12 evidence boundary as a product heuristic, not a law of piano pedagogy.

One attempt's quality is the arithmetic mean of its applicable facet scores. Each facet votes once regardless of observation count. Reliability never multiplies quality: it affects only evidence weight and confidence.

## Contexts and aggregation

Challenge identity uses only module-relevant authored configuration such as tonic, mode, declared hand context, BPM, subdivision, octave span, direction, inversion, jump distance, or tempo shape. It excludes attempt IDs, recording IDs, timestamps, and generated seed/instance identity. Thus distinct first-pass stimuli can support one sight-reading challenge context, while repeated identical scales remain one context.

Aggregation has two stages:

1. The latest three attempts in each exact context produce one context estimate. Reliable evidence has weight `1.0`, limited evidence `0.6`; facet coverage and gentle recency also affect evidence weight.
2. Context estimates receive equal structural influence with only gentle recency adjustment. Fifty repetitions in one context cannot outweigh all other contexts.

Current-state recency uses a 105-day half-life with a `0.35` historical floor. This is a transparent product heuristic, not a claim about neurological forgetting. All calculations require an explicit `asOf`; future-dated evidence is excluded.

Consistency is a separate robust median-absolute-deviation transformation and is not folded into quality. Confidence is `unestablished`, `low`, `medium`, or `high` and considers attempts, contexts, reliable proportion, coverage, recency, and breadth—not the score itself. No eligible evidence produces `null`, never zero.

## Challenge envelope

Every result describes the demonstrated boundary: eligible attempts and contexts, BPM range, declared hand contexts, and last measurement. Module-relevant breadth includes tonics, modes, octave spans, directions, chord inversions, jump distances, subdivisions, tempo shapes, and distinct sight-reading first-pass instances. Tonics, modes, inversions, and declared hand context are breadth evidence; Phase 13 assigns them no arbitrary difficulty rank and never infers physical hand use.

The result retains exact eligible attempt IDs, context ratings, and typed exclusions. It is deterministic, serializable, deeply immutable, React-independent, renderer-independent, and persistence-adapter-independent.
