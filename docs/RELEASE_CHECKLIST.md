# Clef V1 release checklist

Automated checks do not replace real browser and hardware testing. Unchecked items are pending manual release gates; do not mark Clef publicly released until they are exercised on the intended release build.

## Fresh install

- [ ] Empty app boots without console errors.
- [ ] Import a representative MusicXML and MXL file.
- [ ] Create the intended Work, Arrangement, and exact ScoreVersion.
- [ ] Launch Practice from the persisted Arrangement after reload.

## MIDI

- [ ] Connect a real supported MIDI piano in desktop Chromium.
- [ ] Verify key press and release capture.
- [ ] Verify raw sustain/CC64 capture.
- [ ] Disconnect and reconnect the same device and a replacement device.
- [ ] Record and stop a normal take.
- [ ] Run a 2+ hour soak/long-recording check without truncation.
- [ ] Confirm the missing/denied Web MIDI state is truthful and the rest of Clef remains navigable.

## Practice

- [ ] Complete a normal Practice session.
- [ ] Launch a planner-target section session.
- [ ] Launch and capture an exact 5%-step suggestion such as 85%; confirm no snapping.
- [ ] Enter and exit Focus Mode by button and Escape.
- [ ] Discard/clear an unsaved take and verify listeners/timers stop.
- [ ] Save a complete attempt and reload it.

## Results

- [ ] Review separate Notes, Rhythm, and Tempo evidence.
- [ ] Review Dynamics.
- [ ] Review Articulation.
- [ ] Review authored Pedal separately from raw CC64 capture.
- [ ] Review configured and unavailable Voicing states.
- [ ] Confirm historical attempts remain immutable after preference changes.
- [ ] Confirm frozen Phase 7 take priority and current Phase 14 planning are visibly distinct.

## Technique

- [ ] Open all eight Technique modules.
- [ ] Generate an exercise in every module.
- [ ] Record and save a Technique result.
- [ ] Open the frozen historical result.
- [ ] Confirm current Skill derivation uses only qualified current-pair summaries.

## Persistence

- [ ] Reload with saved repertoire/history intact.
- [ ] Run explicit integrity verification.
- [ ] Export a backup and inspect its human-readable contents securely.
- [ ] Confirm a tampered backup is rejected before mutation.
- [ ] Restore a valid backup and compare every logical store.
- [ ] Inject/observe failed restore rollback with previous data intact.
- [ ] Exercise summary-only repair and authoritative-corruption refusal.
- [ ] Exercise Clear All confirmation and optional Export backup first.

## Appearance

- [ ] Dark application + Paper score.
- [ ] Light application + Paper score.
- [ ] Dark application + Night score.
- [ ] System appearance follows a live operating-system change.

## Responsive desktop

- [ ] 1440×900: core routes, dialogs, notation, no horizontal overflow.
- [ ] 1280×800: core routes, dialogs, notation, no horizontal overflow.
- [ ] 1024×768: compact rail, controls, dialogs, notation, no horizontal overflow.

## Browser

- [ ] Supported current Chromium desktop path.
- [ ] Truthful unsupported/denied Web MIDI path.
- [ ] IndexedDB blocked/unavailable recovery messaging.

## Data safety

- [ ] No fake cloud copy, account sync, or remote recovery claim.
- [ ] No historical reanalysis during verify, export, restore, or repair.
- [ ] IndexedDB schema stays 4; attempt and engine versions stay frozen.
- [ ] Backup contains raw MIDI plus exact analysis snapshots.
- [ ] Restore replacement semantics are stated before confirmation.

## Release status

- Automated Phase 15.1 checks: run and record for the release commit.
- Real MIDI hardware/device matrix: **pending manual release gate**.
- Final human release acceptance: **pending manual release gate**.
