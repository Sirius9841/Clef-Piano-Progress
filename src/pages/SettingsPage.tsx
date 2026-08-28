import { Cable, Database, Download, Info, Moon, Monitor, Music2, ShieldCheck, Sun, Trash2, Upload, Wrench } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { PageHeader, SectionHeading, StatusPill } from '../components/ui'
import { MidiControls } from '../features/midi/MidiControls'
import { MidiDiagnostics } from '../features/midi/MidiDiagnostics'
import { useMidi } from '../features/midi/MidiContext'
import { PianoKeyboard } from '../features/midi/PianoKeyboard'
import { usePersistence, useRepositoryQuery } from '../features/persistence/PersistenceContext'
import { clearLocalDataAndPracticeSafely } from '../features/persistence/mutations'
import { usePracticeSession } from '../features/practice/PracticeSessionContext'
import { useAppearance } from '../features/preferences/AppearanceContext'
import type { RequestedAppearance, ScoreAppearance } from '../features/preferences/appearance'
import type { IntegrityReport, ValidatedBackup } from '../features/persistence/backup'
import { asPianoStorageError } from '../features/persistence/errors'
import { summaryRepairPresentation } from '../features/persistence/repairPresentation'

export function SettingsPage() {
  const midi = useMidi()
  const persistence = usePersistence()
  const practice = usePracticeSession()
  const appearance = useAppearance()
  const counts = useRepositoryQuery((repository) => repository.getCounts(), 'storage-counts')
  const [clearState, setClearState] = useState<'idle' | 'clearing' | 'cleared' | 'error'>('idle')
  const [clearMessage, setClearMessage] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [integrity, setIntegrity] = useState<IntegrityReport | null>(null)
  const [safetyBusy, setSafetyBusy] = useState<'verify' | 'export' | 'inspect' | 'restore' | 'repair' | null>(null)
  const [safetyMessage, setSafetyMessage] = useState<string | null>(null)
  const [safetyError, setSafetyError] = useState<string | null>(null)
  const [backup, setBackup] = useState<ValidatedBackup | null>(null)
  const [confirmRestore, setConfirmRestore] = useState(false)
  const backupInputRef = useRef<HTMLInputElement>(null)
  const closeClearDialog = useCallback(() => setConfirmClear(false), [])
  const clearAll = async () => {
    if (!persistence.repository) return
    setClearState('clearing')
    setClearMessage(null)
    const result = await clearLocalDataAndPracticeSafely(persistence.repository, practice.clearSession)
    if (!result.ok) {
      setClearState('error')
      setClearMessage(`Local data was not cleared: ${result.error.message} You can retry safely.`)
      return
    }
    setConfirmClear(false)
    setClearState('cleared')
    setClearMessage('All local Clef records were cleared from this browser.')
  }
  const runVerify = async () => {
    if (!persistence.repository) return
    setSafetyBusy('verify'); setSafetyError(null); setSafetyMessage(null)
    try {
      const report = await persistence.repository.verifyIntegrity()
      setIntegrity(report)
      setSafetyMessage(report.status === 'healthy' ? 'Integrity verified.' : `${report.totalIssueCount} local data issue${report.totalIssueCount === 1 ? '' : 's'} found.`)
    } catch (cause) { setSafetyError(asPianoStorageError(cause).message) } finally { setSafetyBusy(null) }
  }
  const exportBackup = async () => {
    if (!persistence.repository) return
    setSafetyBusy('export'); setSafetyError(null); setSafetyMessage(null)
    try {
      const exported = await persistence.repository.createBackup()
      const url = URL.createObjectURL(new Blob([exported.json], { type: 'application/json' }))
      const anchor = document.createElement('a')
      anchor.href = url; anchor.download = exported.filename; anchor.click()
      setTimeout(() => URL.revokeObjectURL(url), 0)
      setIntegrity(exported.integrity)
      setSafetyMessage(`Backup created: ${exported.filename}`)
    } catch (cause) { setSafetyError(asPianoStorageError(cause).message) } finally { setSafetyBusy(null) }
  }
  const inspectBackup = async (file: File | undefined) => {
    setBackup(null); setConfirmRestore(false); setSafetyError(null); setSafetyMessage(null)
    if (!file || !persistence.repository) return
    setSafetyBusy('inspect')
    try {
      const inspected = await persistence.repository.inspectBackup(await file.text())
      setBackup(inspected); setSafetyMessage('Backup verified. Review the replacement preview before restoring.')
    } catch (cause) { setSafetyError(asPianoStorageError(cause).message) } finally { setSafetyBusy(null) }
  }
  const restoreBackup = async () => {
    if (!persistence.repository || !backup) return
    setSafetyBusy('restore'); setSafetyError(null); setSafetyMessage(null)
    try {
      await persistence.repository.restoreBackup(backup, practice.clearSession)
      setConfirmRestore(false); setBackup(null)
      if (backupInputRef.current) backupInputRef.current.value = ''
      const report = await persistence.repository.verifyIntegrity()
      setIntegrity(report); setSafetyMessage('Restore complete.')
    } catch (cause) { setSafetyError(asPianoStorageError(cause).message) } finally { setSafetyBusy(null) }
  }
  const repairSummaries = async () => {
    if (!persistence.repository) return
    setSafetyBusy('repair'); setSafetyError(null); setSafetyMessage(null)
    try {
      const report = await persistence.repository.rebuildDerivedSummaries()
      const presentation = summaryRepairPresentation(report)
      setIntegrity(report); setSafetyMessage(presentation.message); setSafetyError(presentation.error)
    } catch (cause) { setSafetyError(asPianoStorageError(cause).message) } finally { setSafetyBusy(null) }
  }
  return (
    <div className="page settings-page">
      <PageHeader eyebrow="Preferences & devices" title="Settings" description="Configure your instrument and shape the practice workspace." />
      <section className="settings-section reveal delay-1">
        <SectionHeading title="Appearance" subtitle="Application chrome and score paper are independent preferences" />
        <div className="appearance-grid panel">
          <fieldset><legend>Application</legend><p>System remains selected while following operating-system changes live.</p><div className="theme-tiles" role="radiogroup" aria-label="Application appearance">{([
            ['dark', 'Dark', Moon], ['light', 'Light', Sun], ['system', 'System', Monitor],
          ] as const).map(([value, label, Icon]) => <button key={value} role="radio" aria-checked={appearance.requestedAppearance === value} className={`theme-tile app-${value} ${appearance.requestedAppearance === value ? 'selected' : ''}`} onClick={() => appearance.setRequestedAppearance(value as RequestedAppearance)}><span className="theme-preview"><Icon /><i /><i /><i /></span><strong>{label}</strong>{value === 'system' && <small>Resolved {appearance.resolvedAppearance}</small>}</button>)}</div></fieldset>
          <fieldset><legend>Score</legend><p>Changes notation presentation only; score identity and analysis remain untouched.</p><div className="theme-tiles score-tiles" role="radiogroup" aria-label="Score appearance">{([
            ['paper', 'Paper'], ['night', 'Night'],
          ] as const).map(([value, label]) => <button key={value} role="radio" aria-checked={appearance.scoreAppearance === value} className={`theme-tile score-${value} ${appearance.scoreAppearance === value ? 'selected' : ''}`} onClick={() => appearance.setScoreAppearance(value as ScoreAppearance)}><span className="score-preview"><Music2 /><i /><i /><i /><i /><i /></span><strong>{label}</strong></button>)}</div></fieldset>
        </div>
      </section>
      <section className="settings-section reveal delay-1">
        <SectionHeading title="MIDI instrument" subtitle="Connect and test a digital piano using the browser's Web MIDI API" action={<StatusPill tone={midi.selectedDevice ? 'positive' : 'neutral'}><Cable size={12} />{midi.selectedDevice ? 'Connected' : 'Not connected'}</StatusPill>} />
        <div className="settings-midi-grid"><div className="panel"><MidiControls /></div><MidiDiagnostics /></div>
        <PianoKeyboard activeNotes={midi.activeNotes} sustainDown={midi.sustainDown} sustainObserved={midi.sustainObserved} />
      </section>
      <section className="settings-section reveal delay-2">
        <SectionHeading title="Local data" subtitle="Stored only in this browser's IndexedDB; no account or cloud sync is active" action={<StatusPill tone="positive"><Database size={12} /> Browser local</StatusPill>} />
        <div className="panel local-storage-panel">
          <div className="integrity-status" aria-live="polite">
            <div><strong>Integrity status</strong><p>{integrity === null ? 'Not verified this session' : integrity.status === 'healthy' ? `Integrity verified · ${new Date(integrity.checkedAt).toLocaleString()}` : `Issues found · ${integrity.totalIssueCount}`}</p></div>
            <button className="button secondary" disabled={safetyBusy !== null || !persistence.repository} onClick={() => void runVerify()}><ShieldCheck size={16} />{safetyBusy === 'verify' ? 'Verifying…' : 'Verify integrity'}</button>
          </div>
          {counts.status === 'loading' && <p>Counting local records…</p>}
          {counts.status === 'error' && <p>{counts.error.message}</p>}
          {counts.status === 'ready' && <div className="storage-counts"><span><strong>{counts.data.works}</strong> Works</span><span><strong>{counts.data.arrangements}</strong> Arrangements</span><span><strong>{counts.data.scoreVersions}</strong> ScoreVersions</span><span><strong>{counts.data.practiceSessions}</strong> Sessions</span><span><strong>{counts.data.performanceAttempts}</strong> Performance takes</span><span><strong>{counts.data.techniqueAttempts}</strong> Technique takes</span></div>}
          {integrity?.status === 'issues-found' && <div className="integrity-issues"><h3>Integrity issues</h3><p>{integrity.totalIssueCount} issue{integrity.totalIssueCount === 1 ? '' : 's'} found. Up to the first 12 are shown.</p><ul>{integrity.issues.slice(0, 12).map((item, index) => <li key={`${item.code}:${item.recordId ?? index}`}><strong>{item.code}</strong> · {item.recordFamily}{item.recordId ? ` · ${item.recordId}` : ''}: {item.detail}</li>)}</ul></div>}
          {safetyMessage && <div className="save-confirmation" role="status">{safetyMessage}</div>}
          {safetyError && <div className="renderer-inline-error" role="alert">{safetyError}</div>}
          <div className="data-safety-actions">
            <div><strong>Backup musical history</strong><p>The JSON file contains all local musical history and is not encrypted. Appearance preferences and unsaved Practice state are excluded.</p></div>
            <button className="button secondary" disabled={safetyBusy !== null || !persistence.repository} onClick={() => void exportBackup()}><Download size={16} />{safetyBusy === 'export' ? 'Exporting…' : 'Export backup'}</button>
          </div>
          <div className="data-safety-actions">
            <div><strong>Restore from backup</strong><p>Selecting a file only inspects it. Clef verifies its SHA-256 digest and all records before offering replacement.</p></div>
            <label className={`button secondary file-button ${safetyBusy !== null ? 'disabled' : ''}`}><Upload size={16} />{safetyBusy === 'inspect' ? 'Inspecting…' : 'Select backup'}<input ref={backupInputRef} type="file" accept="application/json,.json" disabled={safetyBusy !== null} aria-label="Select Clef backup file" onChange={(event) => void inspectBackup(event.target.files?.[0])} /></label>
          </div>
          {backup && <section className="restore-preview" aria-labelledby="restore-preview-heading"><h3 id="restore-preview-heading">Restore preview</h3><p>Created {new Date(backup.envelope.createdAt).toLocaleString()}</p><div className="storage-counts"><span><strong>{backup.envelope.recordCounts.works}</strong> Works</span><span><strong>{backup.envelope.recordCounts.arrangements}</strong> Arrangements</span><span><strong>{backup.envelope.recordCounts.scoreVersions}</strong> ScoreVersions</span><span><strong>{backup.envelope.recordCounts.practiceSessions}</strong> Sessions</span><span><strong>{backup.envelope.recordCounts.performanceAttempts}</strong> Performance takes</span><span><strong>{backup.envelope.recordCounts.techniqueAttempts}</strong> Technique takes</span></div><p className="destructive-copy">Restore replaces the current local Clef database.</p><button className="button danger" disabled={safetyBusy !== null} onClick={() => setConfirmRestore(true)}>Restore backup</button></section>}
          {integrity?.summaryOnlyRepairable && <div className="data-safety-actions"><div><strong>Rebuild derived summaries</strong><p>Repairs only deterministic summary indexes. Frozen attempts and analysis snapshots are never changed or re-analyzed.</p></div><button className="button secondary" disabled={safetyBusy !== null} onClick={() => void repairSummaries()}><Wrench size={16} />{safetyBusy === 'repair' ? 'Repairing…' : 'Repair summaries'}</button></div>}
          {clearMessage && <div className={clearState === 'error' ? 'renderer-inline-error' : 'save-confirmation'}>{clearMessage}</div>}
          <div className="local-data-actions"><div><strong>Clear all local data</strong><p>Browser storage can also be cleared by browser or operating-system controls. Clef has no remote copy.</p></div><button className="button ghost danger" disabled={clearState === 'clearing'} onClick={() => setConfirmClear(true)}><Trash2 size={16} /> {clearState === 'clearing' ? 'Clearing…' : 'Clear all data'}</button></div>
        </div>
      </section>
      <div className="settings-note"><Info /><p>MIDI access, repertoire history, and Technique Lab history stay on this device in browser-local storage. Clef has no cloud copy or account sync; keep exported backups somewhere safe.</p></div>
      <ConfirmDialog open={confirmClear} title="Clear all local Clef data?" confirmLabel="I understand — clear everything" busy={clearState === 'clearing' || safetyBusy === 'export'} secondaryAction={counts.status === 'ready' && Object.values(counts.data).some((value) => value > 0) ? { label: 'Export backup first', onClick: () => void exportBackup(), disabled: safetyBusy !== null } : undefined} onCancel={closeClearDialog} onConfirm={() => void clearAll()}><p className="destructive-copy">This permanently removes every Work, Arrangement, ScoreVersion, raw MIDI recording, session, attempt, and Technique take stored by Clef in this browser.</p><p>Clef has no cloud copy. Exporting a backup is optional, but this action cannot be undone.</p></ConfirmDialog>
      <ConfirmDialog open={confirmRestore} title="Replace local Clef data?" confirmLabel="Replace local data" busy={safetyBusy === 'restore'} onCancel={() => setConfirmRestore(false)} onConfirm={() => void restoreBackup()}><p className="destructive-copy">Restore replaces every current local Clef record with the verified backup contents in one atomic transaction.</p><p>If the transaction fails, the current database remains unchanged. Unsaved Practice state is cleared only after a successful restore.</p></ConfirmDialog>
    </div>
  )
}
