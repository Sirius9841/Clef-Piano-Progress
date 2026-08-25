import { Activity, Eraser, Radio } from 'lucide-react'
import { Button, StatusPill } from '../../components/ui'
import { midiNoteName } from './notes'
import type { MidiEvent } from './types'
import { useMidi } from './MidiContext'

function describeEvent(event: MidiEvent): { label: string; detail: string } {
  if (event.type === 'note-on') return { label: 'Note On', detail: `${midiNoteName(event.note)} · velocity ${event.velocity}` }
  if (event.type === 'note-off') return { label: 'Note Off', detail: midiNoteName(event.note) }
  return { label: 'Pedal', detail: `${event.down ? 'Down' : 'Up'} · CC64 ${event.value}` }
}

export function MidiDiagnostics() {
  const midi = useMidi()

  return (
    <section className="panel diagnostics-panel">
      <div className="section-heading compact">
        <div><h2><Activity size={18} /> Live diagnostics</h2><p>Normalized events from the selected input</p></div>
        {midi.recentEvents.length > 0 && <Button variant="ghost" icon={Eraser} onClick={midi.clearEvents}>Clear</Button>}
      </div>
      <div className="diagnostic-grid">
        <div><span>Support</span><strong>{midi.supported ? 'Available' : 'Unavailable'}</strong></div>
        <div><span>Input</span><strong>{midi.selectedDevice?.name ?? 'None selected'}</strong></div>
        <div><span>Active notes</span><strong>{midi.activeNotes.length}</strong></div>
        <div><span>Sustain</span><StatusPill tone={midi.sustainObserved && midi.sustainDown ? 'violet' : 'neutral'}>{midi.sustainObserved ? `${midi.sustainDown ? 'Down' : 'Up'} · ${midi.sustainValue}` : 'Not observed'}</StatusPill></div>
      </div>
      {midi.activeNotes.length > 0 && <div className="active-note-list"><span>Currently playing</span>{midi.activeNotes.map(({ note, velocity }) => <b key={note}>{midiNoteName(note)} <small>{velocity}</small></b>)}</div>}
      <div className="event-feed">
        <div className="event-feed-header"><span>Recent events</span><Radio size={14} className={midi.selectedDevice ? 'live' : ''} /></div>
        {midi.recentEvents.length === 0 ? <div className="empty-events">Play a note to see MIDI activity here.</div> : midi.recentEvents.map((event, index) => {
          const description = describeEvent(event)
          return <div className="event-row" key={`${event.timestampMs}-${index}`}><span className={`event-dot ${event.type}`} /><strong>{description.label}</strong><span>{description.detail}</span><time>{event.timestampMs.toFixed(1)} ms</time></div>
        })}
      </div>
    </section>
  )
}
