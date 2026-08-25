import { Gauge, Piano } from 'lucide-react'
import { createPianoNotes, isBlackKey, midiNoteName } from './notes'
import type { ActiveNote } from './types'

const pianoNotes = createPianoNotes()
const whiteNotes = pianoNotes.filter((note) => !isBlackKey(note))
const blackNotes = pianoNotes.filter(isBlackKey)

function blackKeyPosition(note: number): number {
  const whiteBefore = pianoNotes.filter((candidate) => candidate < note && !isBlackKey(candidate)).length
  return (whiteBefore / whiteNotes.length) * 100
}

export function PianoKeyboard({ activeNotes, sustainDown, sustainObserved = true }: { activeNotes: ActiveNote[]; sustainDown: boolean; sustainObserved?: boolean }) {
  const activeMap = new Map(activeNotes.map((item) => [item.note, item.velocity]))

  return (
    <section className="piano-module" aria-label="88-key MIDI piano visualizer">
      <div className="piano-module-header">
        <div>
          <div className="piano-title"><Piano size={18} /> 88-key monitor</div>
          <p>A0–C8 · velocity-responsive input</p>
        </div>
        <div className={`pedal-indicator ${sustainObserved && sustainDown ? 'down' : ''}`}><Gauge size={16} /> Sustain <strong>{sustainObserved ? sustainDown ? 'DOWN' : 'UP' : '—'}</strong></div>
      </div>
      <div className="keyboard-scroll">
        <div className="keyboard">
          <div className="white-keys">
            {whiteNotes.map((note) => {
              const velocity = activeMap.get(note)
              return <div key={note} className={`piano-key white ${velocity !== undefined ? 'active' : ''}`} style={{ '--velocity': String((velocity ?? 0) / 127) } as React.CSSProperties} title={midiNoteName(note)}>{note % 12 === 0 && <span>{midiNoteName(note)}</span>}</div>
            })}
          </div>
          {blackNotes.map((note) => {
            const velocity = activeMap.get(note)
            return <div key={note} className={`piano-key black ${velocity !== undefined ? 'active' : ''}`} style={{ left: `${blackKeyPosition(note)}%`, '--velocity': String((velocity ?? 0) / 127) } as React.CSSProperties} title={midiNoteName(note)} />
          })}
        </div>
      </div>
      <div className="keyboard-scale"><span>A0</span><span>C2</span><span>C4</span><span>C6</span><span>C8</span></div>
    </section>
  )
}
