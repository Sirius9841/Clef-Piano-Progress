# Long-term progress model

Phase 8 derives progress from immutable attempt summaries and completed PracticeSessions. It never stores a mutable “best score” as the only truth and never invents Mastery or an overall Performance Score.

## Comparable attempts

A headline personal-best or rolling-trend comparison requires the same:

- Arrangement;
- ScoreVersion;
- `full-plan` grading scope;
- practice-speed multiplier.

Partial aligned-span attempts remain first-class history but cannot become headline records. A first comparable result is labelled as a first full-score result. Equality is not a new personal best. Notes, Rhythm, and Tempo are evaluated independently and unavailable evidence remains null.

## Rolling windows and trends

The Progress view selects the latest full-plan comparison context and reports the average of its latest five comparable attempts against the previous five. The window sizes and evidence counts are visible. Results are ordered deterministically by timestamp and stable ID; the UI does not average already-rounded display percentages.

## Practice volume

Practice time is the sum of completed PracticeSession durations in the selected 7-day, 30-day, or all-time range. Session count and attempt count are separate. Multiple takes inside one session therefore add analysis evidence without multiplying practice minutes. Active days come from real session timestamps.

The current model deliberately excludes Mastery, clean playable tempo, dynamics, articulation, pedal quality, Technique Lab ratings, and an overall performance score.
