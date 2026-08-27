# Long-term progress model

Progress remains derived from immutable attempt summaries and completed PracticeSessions. Phase 13.2 derives carefully qualified Arrangement Mastery and eight transferable Technique skill ratings with current-evidence authority; it still never stores a mutable “best score” as the only truth or invents an overall Performance Score.

## Comparable attempts

A headline personal-best or rolling-trend comparison requires the same:

- Arrangement;
- ScoreVersion;
- `full-plan` grading scope;
- practice-speed multiplier.

Partial aligned-span attempts remain first-class history but cannot become headline records. Unavailable full-plan attempts also cannot replace the latest headline context. A first comparable result is labelled as a first full-score result. Equality is not a new personal best. Notes, Rhythm, and Tempo are evaluated independently and unavailable evidence remains null; charts break or omit a series point instead of plotting null as zero.

The current aggregate reliability policy is intentionally conservative and simple:

- `reliable`: headline-comparable;
- `limited`: headline-comparable because the persisted aggregate can still contain legitimate, non-ambiguous evidence while one dimension is sparse or unavailable;
- `provisional`: never headline-comparable because ambiguous alignment must not produce celebratory claims;
- `unavailable`: never headline-comparable.

Metric-specific reliability would allow a finer policy, but it is not part of the Phase 8 aggregate record. Until that model exists, limited results retain real evidence and null unavailable dimensions, while provisional results are excluded from both personal bests and headline trend context.

## Rolling windows and trends

The Progress view selects the latest headline-comparable full-plan context and reports the average of its latest configurable window against the previous equal-sized window. Returned metadata always reports the requested window size and evidence counts. Personal-best history is derived in one deterministic pass by comparison context; results are ordered by timestamp and stable ID, and the UI does not average already-rounded display percentages.

## Practice volume

Practice time is the sum of completed PracticeSession durations in the selected 7-day, 30-day, or all-time range. Session count and attempt count are separate. Multiple takes inside one session therefore add analysis evidence without multiplying practice minutes. Active days are deduplicated from real timestamps in the user's local calendar rather than by their UTC ISO date.

Personal-best and trend logic deliberately excludes Mastery, Dynamics, Articulation, Pedal, Voicing, Technique ratings, reference similarity, and any overall performance score. Phase 13 presents Skill Ratings as a separate summary-derived section and Arrangement Mastery on exact Arrangement detail; neither enters repertoire charts, Practice Priority, or personal-best claims. A selected reference remains an interpretive comparison preference, never a record to beat.

The Progress page's 7-day, 30-day, and all-time selector applies only to practice volume and performance trends. Skill Ratings intentionally consume all eligible Technique history, then apply their own bounded per-context model window and current-state recency. “Model window” means count-bounded evidence, not necessarily recent evidence. Filtering Technique summaries by the Progress selector would discard the model's evidence semantics and is forbidden.

## Practice planning is a separate current read model

Phase 7 `PracticePriority` remains frozen per-attempt evidence. It answers which section looked weak in that one result and retains its historical 45/35/20 Notes/Rhythm/Tempo semantics. Phase 14 never changes or aggregates that number into progress.

Practice Planning instead derives current, exact-ScoreVersion section histories from the underlying frozen Notes, Rhythm, Tempo, confidence, reliability, speed, scope, and provenance. It protects independent-session evidence, decays current authority without a floor, and keeps mixed speed contexts separate. Its ordered recommendations are not a trend, personal best, Mastery mutation, or overall performance/practice score. See `PRACTICE_PLANNING.md`.
