import { Cable, ChevronRight, Eye, Gauge, Info, SlidersHorizontal } from 'lucide-react'
import { PageHeader, SectionHeading, StatusPill } from '../components/ui'
import { MidiControls } from '../features/midi/MidiControls'
import { MidiDiagnostics } from '../features/midi/MidiDiagnostics'
import { useMidi } from '../features/midi/MidiContext'
import { PianoKeyboard } from '../features/midi/PianoKeyboard'

export function SettingsPage() {
  const midi = useMidi()
  return (
    <div className="page settings-page">
      <PageHeader eyebrow="Preferences & devices" title="Settings" description="Configure your instrument and shape the practice workspace." />
      <section className="settings-section reveal delay-1">
        <SectionHeading title="MIDI instrument" subtitle="Connect and test a digital piano using the browser's Web MIDI API" action={<StatusPill tone={midi.selectedDevice ? 'positive' : 'neutral'}><Cable size={12} />{midi.selectedDevice ? 'Connected' : 'Not connected'}</StatusPill>} />
        <div className="settings-midi-grid"><div className="panel"><MidiControls /></div><MidiDiagnostics /></div>
        <PianoKeyboard activeNotes={midi.activeNotes} sustainDown={midi.sustainDown} />
      </section>
      <section className="future-settings reveal delay-2">
        <SectionHeading title="Future configuration" subtitle="These controls will become available as their supporting systems are built" />
        <div className="future-setting-grid">
          <button disabled><span><Gauge /></span><div><strong>Velocity calibration</strong><p>Map your instrument's touch response for reliable dynamics analysis.</p><StatusPill>Not configured</StatusPill></div><ChevronRight /></button>
          <button disabled><span><SlidersHorizontal /></span><div><strong>Pedal configuration</strong><p>Configure polarity, thresholds and continuous pedal behavior.</p><StatusPill>Phase 9</StatusPill></div><ChevronRight /></button>
          <button disabled><span><Eye /></span><div><strong>Visual preferences</strong><p>Keyboard labels, density and progress display preferences.</p><StatusPill>Coming later</StatusPill></div><ChevronRight /></button>
        </div>
      </section>
      <div className="settings-note"><Info /><p>MIDI access stays entirely in your browser during Phase 1. No performance data is uploaded or persisted.</p></div>
    </div>
  )
}
