# Local-first persistence

Clef stores musical history in browser IndexedDB behind `PianoProgressRepository`. Domain and React code never issue raw IndexedDB requests. The adapter remains at schema version `4`: v2 preserved ScoreVersion part selection, v3 added the session `endedAt` range index, and v4 additively created the Technique stores. Migrations are ordered and never rewrite immutable historical identity.

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

`saveAttempt` validates the Arrangement, exact ScoreVersion, and PracticeSession identities. Before any write or idempotent-return path, it also requires canonically equivalent included-part sets on the persisted ScoreVersion, PerformanceAttempt, and embedded ExpectedPerformancePlan, and requires the plan `scoreId` to equal that ScoreVersion's `normalizedScoreId`. Reordered or repeated IDs follow the centralized set semantics; a mismatch aborts without an attempt, summary, or session record. It then atomically:

1. adds the full PerformanceAttempt;
2. adds its lightweight summary;
3. creates or extends the PracticeSession and idempotently links the attempt ID.

An existing attempt ID is a successful idempotent retry and creates no duplicate. Any intermediate failure aborts every write. Typed errors distinguish unavailable storage, corrupt records, broken references, immutable-identity conflicts, and transaction failures.

Historical attempt reads defensively validate each nested snapshot object and its diagnostics before checking provenance. Missing or malformed alignment, note-grading, timing, or result structures therefore surface as a typed `CORRUPT_RECORD`, never as a leaked JavaScript property-access error. V1 attempts preserve the Notes/Rhythm/Tempo-era shape. V2 attempts additionally require an exact `ExpressionAnalysisResult`, matching score/plan/recording/alignment/note-grade/scope identities, and `engineVersions.expressionAnalysis`. Expression scope must match NoteGrading across type, expected start/end indexes, and expected start/end group IDs; a type-only match is insufficient. A malformed V2 snapshot is also `CORRUPT_RECORD`.

Attempt schema V2 changes only the value stored in the existing `performanceAttempts` object store. V3 adds the exact `PedalAnalysisResult` and pedal engine version beside the exact V2 expression snapshot. Reads validate score, plan, recording, alignment, note-grade, expression, scope boundaries, and engine provenance through the nested V3 shape. Missing or malformed pedal timelines, targets, diagnostics, or provenance are typed `CORRUPT_RECORD` failures. Frozen `pedal-analysis-1.0.0` V3 snapshots remain valid without Phase 10.1's additive timing-anchor, channel, and event-coverage fields; `pedal-analysis-1.1.0` and new `pedal-analysis-1.1.1` snapshots require and validate the same modern shape. Historical snapshots are displayed exactly and never upgraded or reanalyzed.

V4 adds exact `VoicingAnalysisResult` and `ReferenceComparisonResult` snapshots plus both engine versions. Before a V4 write, a selected reference must already exist, differ from the current attempt, and match Arrangement, ScoreVersion, and canonical included-part identity. The reference snapshot records the exact two attempt identities and overlap used. Reads deeply validate every Voicing lane, target, observation, target reference, region/lane statistic, finite value, count, and coverage relationship, plus all five reference dimensions, their coverage, similarity descriptors, overlap bounds, numeric consistency, metadata, and engine provenance. Nested damage is a typed `CORRUPT_RECORD`; it is never repaired or replaced with missing evidence. Arrangement preferences optionally store ScoreVersion-keyed Voicing intent regions and a default saved reference attempt; mutations validate their score identity and preserve unrelated preferences. Changing either preference never rewrites historical attempts.

New V4 attempts use `reference-comparison-1.1.0`. Existing V4 `reference-comparison-1.0.0` attempts remain readable as exact frozen history. The PerformanceAttempt schema remains V4. Phase 12 independently raises `PERSISTENCE_SCHEMA_VERSION` to 4 for dedicated Technique stores; it does not change the PerformanceAttempt shape.

Phase 12 schema 4 additively creates `techniqueAttempts` and `techniqueAttemptSummaries`. Both index `performedAt`, `moduleId`, `templateId`, and `exerciseInstanceId`. Phase 12.3 does not upgrade IndexedDB or introduce Technique V3: frozen Technique V1 records/summaries remain exact `1.0.0`, and V2 accepts only `exercise-1.1.0`/`analysis-1.1.0`, `exercise-1.1.1`/`analysis-1.1.1`, and current `exercise-1.1.1`/`analysis-1.1.2`. A Technique save derives its summary and writes both atomically, rechecks novelty, and accepts an idempotent retry only when the entire frozen payload and derived summary match. Before any V2 write, generated events must exactly match the frozen plan onset-group count, rational positions, and MIDI multisets/cardinality; included parts must be exactly `P1`; and recording/plan score identity must match. Arbitrary `1.1.x` versions and mixed pairs are rejected. Same-ID different content is `IMMUTABLE_RECORD`. Engine-specific deep reads validate spec, generated events, challenge invariants, analysis/facets/observations, source IDs, cross-snapshot identities, counts, ratios, engine diagnostics, and exercise-plan semantics; corruption is `CORRUPT_RECORD` and is never silently rebuilt. Existing PerformanceAttempt V1–V4 records remain untouched. Clear-all includes both Technique stores.

Phase 13 and the Phase 13.1 current-evidence correction add no stores, schema change, PerformanceAttempt version, TechniqueAttempt version, persistent model snapshot, or mutable counter. Skill Model `1.1.0` and Mastery Model `1.1.0` are deterministic read-time projections over `listTechniqueAttemptSummaries()` and `listAttemptSummaries()`. Advancing explicit `asOf` may reduce current authority without changing any summary. Summary projections remain rebuildable accelerators; immutable attempt snapshots remain authoritative history.

A PracticeSession spans the first saved take's recording start through the latest saved take's end within one mounted Practice visit. Time between those takes is intentionally part of that visit; attempts do not multiply the span. Retries return before session merging, and invalid or negative spans are rejected before writes.

## Privacy and limitations

Data stays on the current browser profile and device. There is no account, server, upload, cloud sync, or remote backup. Browser or operating-system storage controls can erase the database. Settings reports record counts and offers one explicit destructive clear-all confirmation. A successful clear also clears the active in-memory Practice session so deleted score identity cannot remain playable; a failed clear preserves the session and reports a retryable error. User-triggered clear and remove actions surface typed failures without claiming success or navigating away. Removing an Arrangement from active Repertoire preserves its history.

Repertoire status is user-controlled metadata. Updating it validates the allowed status, changes only the active RepertoireEntry and its `updatedAt`, notifies repository subscribers, and preserves the Work, Arrangement, immutable ScoreVersions, sessions, and attempts.
