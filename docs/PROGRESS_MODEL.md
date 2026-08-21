# Long-term progress model

Phase 8 derives progress from immutable attempt summaries and completed PracticeSessions. It never stores a mutable “best score” as the only truth and never invents Mastery or an overall Performance Score.

## Comparable attempts

A headline personal-best or rolling-trend comparison requires the same:

- Arrangement;
- ScoreVersion;
- `full-plan` grading scope;
- practice-speed multiplier.

Partial aligned-span attempts remain first-class history but cannot become headline records. Unavailable full-plan attempts also cannot replace the latest headline context. A first comparable result is labelled as a first full-score result. Equality is not a new personal best. Notes, Rhythm, and Tempo are evaluated independently and unavailable evidence remains null; charts break or omit a series point instead of plotting null as zero.

## Rolling windows and trends

The Progress view selects the latest reliable full-plan comparison context and reports the average of its latest configurable window against the previous equal-sized window. Returned metadata always reports the requested window size and evidence counts. Personal-best history is derived in one deterministic pass by comparison context; results are ordered by timestamp and stable ID, and the UI does not average already-rounded display percentages.

## Practice volume

Practice time is the sum of completed PracticeSession durations in the selected 7-day, 30-day, or all-time range. Session count and attempt count are separate. Multiple takes inside one session therefore add analysis evidence without multiplying practice minutes. Active days are deduplicated from real timestamps in the user's local calendar rather than by their UTC ISO date.

The current model deliberately excludes Mastery, clean playable tempo, dynamics, articulation, pedal quality, Technique Lab ratings, and an overall performance score.
