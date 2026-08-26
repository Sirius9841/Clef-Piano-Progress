# Arrangement Mastery Model

Mastery Model `mastery-model-1.1.0` answers: how strongly does current repeated evidence support command of this exact Arrangement and its current immutable ScoreVersion?

## Eligibility and meaning

Only lightweight `AttemptSummary` projections for the exact `arrangementId` and current `scoreVersionId` are considered. Evidence must be full-plan, aggregate reliable or limited, and contain finite Notes, Rhythm, and Tempo values. Partial, provisional, unavailable, malformed, future-dated, other-arrangement, and prior-ScoreVersion attempts remain history and receive typed exclusions.

Mastery near 100 means strong, current, repeated evidence of controlled full-score performance at or near selected target speed under this model. It does not mean artistic perfection, expressive correctness, concert readiness, or universal musicianship. Dynamics, Articulation, Pedal, Voicing, references, practice time, and Repertoire status do not enter it.

## Current evidence window and Control

The latest eight eligible attempts form model evidence. Attempt Control is the equal arithmetic mean of Notes, Rhythm, and Tempo. Control and the weakest aggregate dimension use reliability (`1.0` reliable, `0.65` limited) multiplied by no-floor exponential recency with a 120-day half-life. Recency here chooses which observations best describe current control; it does not change a take's frozen metrics.

Consistency is a separate median-absolute-deviation transformation over the eight control observations.

## Demonstrated speed

Practice speeds are rounded to `0.01`. A speed bucket first needs at least two full-plan takes satisfying Notes `>= 0.90`, Rhythm `>= 0.80`, and Tempo `>= 0.80`. Each supporting take then has current authority:

`speedSupportWeight = reliabilityWeight × 2^(-ageDays / 120)`

The bucket qualifies only when the sum is at least `1.10`. This smooth threshold allows two recent reliable or limited takes, may allow moderately old strong support, and causes year-old evidence to expire without a hard date cliff or history mutation. The highest bucket satisfying both requirements is demonstrated. Same-session takes may establish speed, but bounded session authority keeps confidence below equivalent multi-session evidence.

The result exposes established or candidate speed, status, qualifying-take count, session count, effective support, exact supporting IDs, and last supporting timestamp. Two year-old 100% takes plus one recent 60% take therefore report no demonstrated speed: the old 100% bucket is `needs-current-support`, and the unrelated recent take cannot refresh it. Two recent 100% qualifying takes still establish `1.0`.

## Formula and distribution-aware recency

The explicit component formula remains:

`55% Control + 30% demonstrated speed + 15% Consistency`

Unavailable repeated-speed or consistency components contribute no invented evidence, making early estimates intentionally conservative while their exposed values remain `null`. The final recency factor is:

`0.82 + 0.18 × mean(2^(-attemptAgeDays / 120))`

over the actual eight-attempt model window. It is modest and distribution-aware, so one fresh attempt cannot make an otherwise stale evidence population look fully fresh.

The three uses of recency have distinct roles. Control recency weights competing observations inside Control; speed recency determines whether the takes supporting that exact speed still have current authority; the modest final factor qualifies the overall evidence distribution. The final floor avoids turning legitimate old history into zero and prevents excessive double decay.

## Confidence authority

Confidence is separate from Mastery quality. `effectiveEvidenceSupport` sums each attempt's reliability × no-floor recency authority. Attempts are also grouped by PracticeSession; each session contributes at most one unit to `effectiveSessionSupport`, so ten same-session takes do not equal ten independent sessions.

Medium confidence needs `1.25` effective attempt support and `1.25` effective session support. High confidence needs `4.0` attempt support, `2.5` session support, an established speed supported across at least two sessions, and at least `0.60` of current authority from reliable evidence. One recent plus four very old takes cannot create High confidence; five genuinely recent reliable takes across several sessions can. High Mastery with Low confidence remains legal.

The projection is derived on read, deterministic, deeply immutable, serializable, React-independent, renderer-independent, and IndexedDB-independent. A new ScoreVersion starts a new evidence boundary without deleting old history or carrying state forward.
