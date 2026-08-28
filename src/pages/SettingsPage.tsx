import { Cable, Database, Info, Moon, Monitor, Music2, Sun, Trash2 } from 'lucide-react'
import { useCallback, useState } from 'react'
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

export function SettingsPage() {
  const midi = useMidi()
  const persistence = usePersistence()
  const practice = usePracticeSession()
  const appearance = useAppearance()
  const counts = useRepositoryQuery((repository) => repository.getCounts(), 'storage-counts')
  const [clearState, setClearState] = useState<'idle' | 'clearing' | 'cleared' | 'error'>('idle')
  const [clearMessage, setClearMessage] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
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
          {counts.status === 'loading' && <p>Counting local records…</p>}
          {counts.status === 'error' && <p>{counts.error.message}</p>}
          {counts.status === 'ready' && <div className="storage-counts"><span><strong>{counts.data.works}</strong> Works</span><span><strong>{counts.data.arrangements}</strong> Arrangements</span><span><strong>{counts.data.scoreVersions}</strong> ScoreVersions</span><span><strong>{counts.data.practiceSessions}</strong> Sessions</span><span><strong>{counts.data.performanceAttempts}</strong> Performance takes</span><span><strong>{counts.data.techniqueAttempts}</strong> Technique takes</span></div>}
          {clearMessage && <div className={clearState === 'error' ? 'renderer-inline-error' : 'save-confirmation'}>{clearMessage}</div>}
          <div className="local-data-actions"><div><strong>Clear all local data</strong><p>Browser storage can also be cleared by browser or operating-system controls. Clef has no remote copy.</p></div><button className="button ghost danger" disabled={clearState === 'clearing'} onClick={() => setConfirmClear(true)}><Trash2 size={16} /> {clearState === 'clearing' ? 'Clearing…' : 'Clear all data'}</button></div>
        </div>
      </section>
      <div className="settings-note"><Info /><p>MIDI access, repertoire history, and Technique Lab history stay on this device in browser-local storage. There is no cloud backup, account sync, or recovery claim in Phase 15.0.</p></div>
      <ConfirmDialog open={confirmClear} title="Clear all local Clef data?" confirmLabel="I understand — clear everything" busy={clearState === 'clearing'} onCancel={closeClearDialog} onConfirm={() => void clearAll()}><p className="destructive-copy">This permanently removes every Work, Arrangement, ScoreVersion, raw MIDI recording, session, attempt, and Technique take stored by Clef in this browser.</p><p>There is no cloud copy or recovery path in Phase 15.0. This action cannot be undone.</p></ConfirmDialog>
    </div>
  )
}
