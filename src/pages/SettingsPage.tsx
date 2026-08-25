import { Cable, ChevronRight, Database, Eye, Gauge, Info, SlidersHorizontal, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { PageHeader, SectionHeading, StatusPill } from '../components/ui'
import { MidiControls } from '../features/midi/MidiControls'
import { MidiDiagnostics } from '../features/midi/MidiDiagnostics'
import { useMidi } from '../features/midi/MidiContext'
import { PianoKeyboard } from '../features/midi/PianoKeyboard'
import { usePersistence, useRepositoryQuery } from '../features/persistence/PersistenceContext'
import { clearLocalDataAndPracticeSafely } from '../features/persistence/mutations'
import { usePracticeSession } from '../features/practice/PracticeSessionContext'

export function SettingsPage() {
  const midi = useMidi()
  const persistence = usePersistence()
  const practice = usePracticeSession()
  const counts = useRepositoryQuery((repository) => repository.getCounts(), 'storage-counts')
  const [clearState, setClearState] = useState<'idle' | 'clearing' | 'cleared' | 'error'>('idle')
  const [clearMessage, setClearMessage] = useState<string | null>(null)
  const clearAll = async () => {
    if (!persistence.repository) return
    const confirmed = window.confirm('Clear all local Clef data? This permanently deletes Works, Arrangements, ScoreVersions, raw MIDI recordings, sessions, and every saved result from this browser. This cannot be undone.')
    if (!confirmed) return
    setClearState('clearing')
    setClearMessage(null)
    const result = await clearLocalDataAndPracticeSafely(persistence.repository, practice.clearSession)
    if (!result.ok) {
      setClearState('error')
      setClearMessage(`Local data was not cleared: ${result.error.message} You can retry safely.`)
      return
    }
    setClearState('cleared')
    setClearMessage('All local Clef records were cleared from this browser.')
  }
  return (
    <div className="page settings-page">
      <PageHeader eyebrow="Preferences & devices" title="Settings" description="Configure your instrument and shape the practice workspace." />
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
          {counts.status === 'ready' && <div className="storage-counts"><span><strong>{counts.data.works}</strong> Works</span><span><strong>{counts.data.arrangements}</strong> Arrangements</span><span><strong>{counts.data.scoreVersions}</strong> ScoreVersions</span><span><strong>{counts.data.practiceSessions}</strong> Sessions</span><span><strong>{counts.data.performanceAttempts}</strong> Attempts</span></div>}
          {clearMessage && <div className={clearState === 'error' ? 'renderer-inline-error' : 'save-confirmation'}>{clearMessage}</div>}
          <div className="local-data-actions"><div><strong>Clear all local data</strong><p>Browser storage can also be cleared by browser or operating-system controls. Clef has no remote copy.</p></div><button className="button ghost danger" disabled={clearState === 'clearing'} onClick={() => void clearAll()}><Trash2 size={16} /> {clearState === 'clearing' ? 'Clearing…' : 'Clear all data'}</button></div>
        </div>
      </section>
      <section className="future-settings reveal delay-2">
        <SectionHeading title="Future configuration" subtitle="These controls will become available as their supporting systems are built" />
        <div className="future-setting-grid">
          <button disabled><span><Gauge /></span><div><strong>Optional velocity calibration</strong><p>Future calibration may improve cross-device and cross-session comparison. Current dynamics use performance-relative velocity.</p><StatusPill>Future option</StatusPill></div><ChevronRight /></button>
          <button disabled><span><SlidersHorizontal /></span><div><strong>Advanced pedal calibration</strong><p>Authored damper notation and standard CC64 work now. Polarity overrides and acoustic continuous-pedal calibration remain future options.</p><StatusPill>Future option</StatusPill></div><ChevronRight /></button>
          <button disabled><span><Eye /></span><div><strong>Visual preferences</strong><p>Keyboard labels, density and progress display preferences.</p><StatusPill>Coming later</StatusPill></div><ChevronRight /></button>
        </div>
      </section>
      <div className="settings-note"><Info /><p>MIDI access and saved performance history stay on this device in browser-local storage. There is no cloud backup, account sync, or upload in Phase 10.</p></div>
    </div>
  )
}
