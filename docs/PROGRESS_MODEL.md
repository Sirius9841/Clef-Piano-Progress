# Long-term progress model

Phase 8 derives progress from immutable attempt summaries and completed PracticeSessions. It never stores a mutable “best score” as the only truth and never invents Mastery or an overall Performance Score.

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

The current progress model deliberately excludes Mastery, clean playable tempo, Dynamics, Articulation, Pedal, and Voicing personal bests/trends, Technique Lab ratings, reference-similarity trends, and an overall performance score. Phase 12 Technique facets remain challenge-qualified evidence on separate Technique attempts and do not enter repertoire charts, Practice Priority, personal bests, or headline progress. A selected reference is an interpretive comparison preference, never a record to beat.
