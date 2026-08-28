# Backup and recovery

Clef V1 is local-first. Musical history lives in the current browser profile's IndexedDB database. There is no account, cloud copy, remote backup, or server recovery path. Browser or operating-system storage controls can erase this data, so users should export backups and keep them in a location they control.

## Backup format

The external format discriminator is `clef-local-backup`; its independent format version is `1`. This is not an IndexedDB migration. The database remains schema `4` with the same nine stores.

The JSON envelope records the creation timestamp, persistence schema version, exact per-family counts, SHA-256 payload digest, and payload. Its deterministic payload order is:

1. Works
2. Arrangements
3. ScoreVersions
4. Repertoire entries
5. PracticeSessions
6. PerformanceAttempts
7. AttemptSummaries
8. TechniqueAttempts
9. TechniqueAttemptSummaries

Records are sorted by stable ID and object keys are canonically ordered before hashing. Values are not rounded, normalized, regraded, or regenerated. Canonical MusicXML, exact part identity, raw MIDI arrival order, releases, CC64 values, every analysis snapshot, engine provenance, scopes, speeds, timestamps, sessions, repertoire status, and ScoreVersion-specific interpretation preferences are retained.

Appearance preferences, an unsaved take, the active in-memory PracticeSession, Practice presentation intent, dialogs, and temporary importer state are excluded. The exported file contains local musical history and is not encrypted. SHA-256 provides integrity detection, not confidentiality or authentication.

## Verify and export

Opening IndexedDB is not an integrity check. Settings begins each app session at **Not verified this session**. **Verify integrity** reads one coherent all-store snapshot without mutation and applies the same deep historical validators used by repository reads, plus cross-store identity, score hash/parser, part-selection, session linkage, summary equivalence, Voicing preference, reference preference, and Technique engine-pair checks.

Export uses one readonly transaction across all nine stores. Clef validates that coherent snapshot before creating the digest, envelope, Blob, and download. Error-level corruption fails closed with: `Backup not created because local data did not pass integrity verification.` No local record is changed.

## Inspect and restore

Selecting a file performs inspection only. Clef parses JSON defensively and validates the discriminator, backup/persistence versions, timestamp, counts, payload shape, SHA-256, deep records, relationships, score content, and summaries before showing a preview.

**Restore replaces the current local Clef database.** After explicit confirmation, one readwrite transaction spans all nine stores, clears them, and writes every validated record. Any failure aborts the transaction, leaving the previous database intact. Only after commit does Clef clear the active in-memory Practice session, notify subscribers, reread counts, and report **Restore complete**.

V1 does not guess or migrate future backup formats or persistence schemas.

## Narrow summary repair

AttemptSummaries and TechniqueAttemptSummaries are deterministic query projections. If and only if verification finds summary-only missing, mismatched, malformed, or orphan records, Settings may offer **Rebuild derived summaries**. Clef first validates authoritative PerformanceAttempts and TechniqueAttempts, then transactionally replaces only the two summary stores using `createAttemptSummary` and `createTechniqueAttemptSummary`.

Repair never reruns alignment, grading, timing, expression, pedal, voicing, reference comparison, or Technique analysis. It never changes scores, sessions, attempts, repertoire metadata, raw MIDI, or immutable history. Authoritative corruption refuses repair.

## Destructive operations

Removing an Arrangement from Repertoire removes membership only; its Work, Arrangement, ScoreVersions, sessions, attempts, and history remain. Clear All deletes every local Clef record after an accessible confirmation. When data exists, the dialog offers an optional **Export backup first** action, but Clef never claims a backup exists unless the browser download was created.
