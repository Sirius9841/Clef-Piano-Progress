# Local-first persistence

Phase 8 stores musical history in browser IndexedDB behind `PianoProgressRepository`. Domain and React code never issue raw IndexedDB requests. The adapter uses schema version `3`: v2 preserved ScoreVersion part selection and v3 added the session `endedAt` range index. Migrations are ordered and never rewrite immutable historical identity.

Database-open promises are cached only while pending or successfully usable. A rejected, blocked, closed, or version-changed connection clears the cache so the UI Retry action performs a real new open; a healthy connection remains cached.

## Stores and indexes

| Store | Purpose | Important indexes |
| --- | --- | --- |
| `works` | Musical identities, including `derivedFromWorkId` | `updatedAt` |
| `arrangements` | Playable realizations and included parts | `workId` |
| `scoreVersions` | Immutable canonical XML, provenance, parser version, SHA-256 | `arrangementId`, `contentHash` |
| `repertoire` | Removable active membership and status | unique `arrangementId` |
| `practiceSessions` | One completed practice visit with one or more attempts | `arrangementId`, `startedAt`, `endedAt` |
| `performanceAttempts` | Raw MIDI, expected plan, analysis snapshots, engine versions | arrangement, score version, session, date |
| `attemptSummaries` | Rebuildable lightweight query projection | arrangement, score version, session, date |

The summary store prevents Home, Repertoire, and Progress from deserializing raw MIDI and full measure maps. It is written in the same transaction as its source attempt and is never the sole source of a historical result. Date-range Progress reads use the `performedAt` and `endedAt` indexes; Repertoire fetches summaries and sessions only for active Arrangement IDs.

## Import and duplicate policy

Canonical validated MusicXML is fingerprinted with SHA-256. Duplicate identity also includes the selected part IDs after deterministic deduplication and sorting. An exact fingerprint and canonical part set in the same requested Work, relationship, and Arrangement-name context returns the active Arrangement and ScoreVersion instead of duplicating it. Reordering or repeating the same IDs does not create a version; changing the set does, even when the XML bytes are unchanged. The new immutable ScoreVersion receives the next monotonic number, and the Arrangement's active included-part metadata is updated in the same transaction. Historical versions and attempts remain untouched. If membership was removed, an exact active re-import recreates only its RepertoireEntry. A differently named Arrangement is not merged merely because its file and Work title match. `createScoreVersion` follows the same content-plus-part-set identity. Historical ScoreVersion records have no update API.

Imports support a new Work, another Arrangement of an existing Work, or a separate Derived Work linked by `derivedFromWorkId`. All relationship references are validated before commit.

## Attempt transaction

`saveAttempt` validates the Arrangement, exact ScoreVersion, and PracticeSession identities. Before any write or idempotent-return path, it also requires canonically equivalent included-part sets on the persisted ScoreVersion, PerformanceAttempt, and embedded ExpectedPerformancePlan. Reordered or repeated IDs follow the centralized set semantics; a mismatch aborts without an attempt, summary, or session record. It then atomically:

1. adds the full PerformanceAttempt;
2. adds its lightweight summary;
3. creates or extends the PracticeSession and idempotently links the attempt ID.

An existing attempt ID is a successful idempotent retry and creates no duplicate. Any intermediate failure aborts every write. Typed errors distinguish unavailable storage, corrupt records, broken references, immutable-identity conflicts, and transaction failures.

Historical attempt reads defensively validate each nested snapshot object and its diagnostics before checking provenance. Missing or malformed alignment, note-grading, timing, or result structures therefore surface as a typed `CORRUPT_RECORD`, never as a leaked JavaScript property-access error.

A PracticeSession spans the first saved take's recording start through the latest saved take's end within one mounted Practice visit. Time between those takes is intentionally part of that visit; attempts do not multiply the span. Retries return before session merging, and invalid or negative spans are rejected before writes.

## Privacy and limitations

Data stays on the current browser profile and device. There is no account, server, upload, cloud sync, or remote backup. Browser or operating-system storage controls can erase the database. Settings reports record counts and offers one explicit destructive clear-all confirmation. A successful clear also clears the active in-memory Practice session so deleted score identity cannot remain playable; a failed clear preserves the session and reports a retryable error. User-triggered clear and remove actions surface typed failures without claiming success or navigating away. Removing an Arrangement from active Repertoire preserves its history.

Repertoire status is user-controlled metadata. Updating it validates the allowed status, changes only the active RepertoireEntry and its `updatedAt`, notifies repository subscribers, and preserves the Work, Arrangement, immutable ScoreVersions, sessions, and attempts.
