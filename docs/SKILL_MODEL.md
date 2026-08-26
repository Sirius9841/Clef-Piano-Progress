# Skill Model

Skill Model `skill-model-1.1.1` derives carefully qualified current Technique state from immutable `TechniqueAttemptSummary` projections. It never reads raw MIDI, reparses an exercise, realigns a performance, regrades a facet, or mutates historical Technique records.

## Meaning and boundary

Clef publishes exactly eight independent ratings, one for each Technique Lab module. There is no overall pianist score, universal level, percentile, or difficulty-independent claim. `qualityEstimate` means current execution quality supported across the eligible challenge contexts represented in local Clef history. It must be read with confidence and the challenge envelope.

Only the exact current engine pair `technique-exercise-1.1.1` / `technique-analysis-1.1.2` is eligible. V1 and earlier V2 summaries remain valid frozen history but are excluded from current Skill Model evidence. Sight-reading accepts only an exact instance's first saved attempt with `first-pass` facet context.

## Evidence populations

Every applicable core facet must be ready, reliable or limited, finite, and have at least `0.55` coverage. One attempt's quality is the arithmetic mean of applicable facet scores, with every facet voting once. Reliability and coverage affect authority, never the measured quality.

The model keeps two populations explicit:

- eligible historical evidence contains every qualifying current-engine summary;
- bounded model evidence is the union of the latest three eligible attempts retained inside each exact challenge context.

Context quality, module quality, consistency, and confidence use bounded model evidence. Older eligible repeats remain visible in historical counts and breadth diagnostics but cannot strengthen current confidence.

This is the model window, not a claim that every retained take is recent. The window is count-bounded; explicit recency weights determine how much current authority its takes retain.

## Context identity

Every context includes `templateId`; different templates never collapse. Seed, generated instance ID, attempt ID, recording ID, and timestamps never enter normal context identity. Exact module dimensions are:

- Sight Reading: template, tonic, mode, declared hand context, target BPM, subdivision, event count.
- Rhythm: template, starting tonic, declared hand context, target BPM, subdivision, event count.
- Chord Fluency: template, tonic, mode, declared hand context, target BPM, subdivision, inversion, event count.
- Scales: template, tonic, mode, declared hand context, target BPM, subdivision, octave span, direction.
- Arpeggios: template, tonic, mode, declared hand context, target BPM, subdivision, octave span, direction.
- Octaves: template, starting tonic, declared hand context, target BPM, subdivision, event count.
- Keyboard Jumps: template, starting tonic, declared hand context, target BPM, subdivision, jump distance, event count.
- Tempo Control: template, starting tonic, declared hand context, target BPM, subdivision, tempo shape, event count.

For Sight Reading, Chord Fluency, Scales, and Arpeggios, tonic is tonal-key provenance. For Rhythm, Octaves, Keyboard Jumps, and Tempo Control, the same source field is starting-pitch provenance and must never be presented as a key. Keyboard Jumps uses `60 + tonic` as the actual starting pitch; register is not otherwise independently configurable. Context distinction describes different authored drills; it never ranks one key, register, subdivision, hand declaration, or template as inherently harder.

## Quality and confidence recency

Quality continuity uses a 105-day half-life with a `0.35` floor. Within a context it weights the latest three attempts by reliability (`1.0` reliable, `0.6` limited), coverage, and quality recency. Contexts then receive equal structural influence with gentle quality recency. Fifty repetitions in one context therefore cannot outweigh another context.

Confidence uses a separate no-floor 90-day half-life. For a retained attempt:

`attemptAuthority = reliabilityWeight × coverage × 2^(-ageDays / 90)`

For a context:

`contextAuthority = min(1, sum(attemptAuthority) / 1.5)`

`effectiveEvidenceSupport` is the sum of context authority. Medium confidence needs at least two retained attempts, two contexts, and `1.2` effective support. High confidence needs at least eight retained attempts, four contexts, and `3.2` effective support. Thus old history can remain informative to quality while losing authority to claim that the ability is current. One recent context cannot refresh several ancient contexts, and 50 repeats in one context contribute at most three model attempts and one authority unit.

Consistency is a separate median-absolute-deviation transformation over bounded model-attempt qualities. All calculations require an explicit `asOf`; future-dated evidence is excluded. No eligible evidence yields `null`/unestablished, never a zero score.

## Challenge envelope and provenance

Every result exposes eligible historical count and IDs separately from bounded model count and IDs, exact context ratings, effective authority, typed exclusions, BPM range, declared hand contexts, last measurement, and module-relevant breadth. The challenge envelope is derived from the same canonical per-module context definition used to create context identity, so a material identity dimension cannot silently disappear from displayed provenance.

The envelope includes tonal `tonics`, non-tonal `startingTonics`, `modes`, `subdivisions`, `eventCounts`, `octaveSpans`, `directions`, `chordInversions`, `jumpSemitones`, `tempoShapes`, `templateIds`, and `distinctTemplateCount`, using only dimensions applicable to that module. Subdivision breadth is retained for all eight modules because it changes authored event timing and density. Template and event-count provenance remain descriptive; neither creates a difficulty rank. Sight Reading also reports distinct first-pass exercise instances.

The projection is deterministic, serializable, deeply immutable, React-independent, renderer-independent, and persistence-adapter-independent.
