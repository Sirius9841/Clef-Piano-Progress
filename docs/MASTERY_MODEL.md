# Arrangement Mastery Model

Mastery Model `mastery-model-1.0.0` answers: how strongly does recent repeated evidence support current command of this exact Arrangement and its current immutable ScoreVersion?

## Eligibility and meaning

Only lightweight `AttemptSummary` projections for the exact `arrangementId` and current `scoreVersionId` are considered. Evidence must be full-plan, aggregate reliable or limited, and contain finite Notes, Rhythm, and Tempo values. Partial, provisional, unavailable, malformed, future-dated, other-arrangement, and prior-ScoreVersion attempts remain history and receive typed exclusions.

Mastery near 100 means strong, recent, repeated evidence of controlled full-score performance at or near selected target speed under this model. It does not mean artistic perfection, expressive correctness, concert readiness, or universal musicianship. Dynamics, Articulation, Pedal, Voicing, reference similarity, practice time, and attempt count do not enter quality. Repertoire status remains manual and independent.

## Components

Attempt Control is the equal arithmetic mean of Notes, Rhythm, and Tempo. The model also publishes the weakest recent aggregate dimension so one collapse remains visible. It does not reuse Phase 7 Practice Priority weights.

Demonstrated speed is separate from Tempo accuracy. Speeds are rounded to `0.01`; the highest bucket needs at least two full-plan attempts satisfying Notes `>= 0.90`, Rhythm `>= 0.80`, and Tempo `>= 0.80`. These are product heuristics for demonstrated arrangement control, not universal musical standards. Same-session repetition can establish a speed with lower confidence; multiple sessions support stronger confidence. A single lucky take never establishes the speed.

The latest eight eligible attempts form current evidence. Reliable attempts have weight `1.0`, limited attempts `0.65`, with deterministic recency weighting. Consistency is a separate median-absolute-deviation transformation over recent control scores.

The explicit formula is:

`(55% Control + 30% demonstrated speed + 15% Consistency) × recency factor`

An unavailable repeated-speed or consistency component contributes no invented evidence, making early estimates intentionally conservative while their exposed component stays `null`. The smooth recency factor has a 120-day half-life and a `0.82` floor, so older evidence loses current-state authority without suddenly becoming “forgotten.” All calculations require explicit `asOf`.

Confidence is separate from Mastery. It considers eligible attempts, distinct sessions, reliable proportion, recency, and repeated-speed support. One strong take can yield a ready but low-confidence estimate; strongest confidence requires multiple recent attempts and sessions.

The result retains exact recent evidence attempt IDs and all typed exclusions. It is derived on read, deeply immutable, serializable, React-independent, renderer-independent, and IndexedDB-independent. A new ScoreVersion starts a new current Mastery evidence boundary without deleting old history or carrying its state forward.
