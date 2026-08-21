# Local-first persistence

Phase 8 stores musical history in browser IndexedDB behind `PianoProgressRepository`. Domain and React code never issue raw IndexedDB requests. The adapter uses schema version `2`, including an ordered v1→v2 ScoreVersion-part-selection migration; future schema changes must continue that migration sequence rather than rewrite historical values in place.

## Stores and indexes

| Store | Purpose | Important indexes |
| --- | --- | --- |
| `works` | Musical identities, including `derivedFromWorkId` | `updatedAt` |
| `arrangements` | Playable realizations and included parts | `workId` |
| `scoreVersions` | Immutable canonical XML, provenance, parser version, SHA-256 | `arrangementId`, `contentHash` |
| `repertoire` | Removable active membership and status | unique `arrangementId` |
| `practiceSessions` | One completed practice visit with one or more attempts | `arrangementId`, `startedAt` |
| `performanceAttempts` | Raw MIDI, expected plan, analysis snapshots, engine versions | arrangement, score version, session, date |
| `attemptSummaries` | Rebuildable lightweight query projection | arrangement, score version, session, date |

The summary store prevents Home, Repertoire, and Progress from deserializing raw MIDI and full measure maps. It is written in the same transaction as its source attempt and is never the sole source of a historical result.

## Import and duplicate policy

Canonical validated MusicXML is fingerprinted with SHA-256. An exact fingerprint in the same requested Work or relationship context returns the existing Arrangement and ScoreVersion instead of duplicating it. `createScoreVersion` adds a changed score to an existing Arrangement with the next monotonic version number while an exact duplicate returns the prior version. Historical ScoreVersion records have no update API.

Imports support a new Work, another Arrangement of an existing Work, or a separate Derived Work linked by `derivedFromWorkId`. All relationship references are validated before commit.

## Attempt transaction

`saveAttempt` validates the Arrangement, exact ScoreVersion, and PracticeSession identities, then atomically:

1. adds the full PerformanceAttempt;
2. adds its lightweight summary;
3. creates or extends the PracticeSession and idempotently links the attempt ID.

An existing attempt ID is a successful idempotent retry and creates no duplicate. Any intermediate failure aborts every write. Typed errors distinguish unavailable storage, corrupt records, broken references, immutable-identity conflicts, and transaction failures.

## Privacy and limitations

Data stays on the current browser profile and device. There is no account, server, upload, cloud sync, or remote backup. Browser or operating-system storage controls can erase the database. Settings reports record counts and offers one explicit destructive clear-all confirmation. Removing an Arrangement from active Repertoire preserves its history.
