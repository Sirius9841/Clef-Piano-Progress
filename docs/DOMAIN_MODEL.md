# Domain model

The application deliberately separates musical identity, playable realization, grading input, and recorded outcome.

```text
Work → Arrangement → ScoreVersion → PerformanceAttempt
```

## Work

A Work is the musical identity: title, composer, small metadata, and an optional `derivedFromWorkId`. It does not own arrangement-specific mastery.

## Arrangement

An Arrangement is one specific playable realization of a Work. Difficulty, target tempo, repertoire state, clean tempo, and mastery apply here.

```text
River Flows in You
├── Original solo arrangement
└── Simplified arrangement
```

A strong result on the simplified arrangement says nothing automatically about mastery of the original.

## Derived Work

A substantial derivative may have its own musical identity:

```text
Canon Fantasy
derived from → Canon in D
```

Canon Fantasy is therefore a separate Work with its own arrangements, score versions, performances, weak sections, and personal bests. This differs from a simplified or alternate arrangement of *Canon in D*.

## ScoreVersion

A ScoreVersion is the exact MusicXML/MXL input used for analysis. It is historically immutable. Editing an import creates another version so old results remain reproducible.

## PerformanceAttempt and Performance Score

A PerformanceAttempt is one future recording tied to an Arrangement, exact ScoreVersion, timestamp, duration, and grading-engine version. Its Performance Score is the result for that single attempt, potentially containing note accuracy, rhythm, tempo, dynamics, and articulation metrics.

## Mastery

Mastery estimates current knowledge of one Arrangement across multiple signals. It is not simply the best Performance Score. The final formula is intentionally deferred.

## SkillRating

A SkillRating measures a transferable ability such as sight reading, rhythm, chord fluency, scales, or tempo control. It is independent of arrangement mastery.
