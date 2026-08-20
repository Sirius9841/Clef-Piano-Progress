import { ArrowLeft, Construction, Play } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { Button, StatusPill } from '../components/ui'
import { repertoire } from '../data/mockData'
import { MidiControls } from '../features/midi/MidiControls'
import { useMidi } from '../features/midi/MidiContext'
import { PianoKeyboard } from '../features/midi/PianoKeyboard'

export function PracticePage() {
  const { arrangementId } = useParams()
  const item = repertoire.find((candidate) => candidate.arrangement.id === arrangementId) ?? repertoire[0]
  const midi = useMidi()
  return <div className="page practice-page"><Link to={`/repertoire/${item?.arrangement.id}`} className="back-link"><ArrowLeft size={15}/> Back to piece</Link><div className="practice-header"><div><StatusPill tone="violet"><Construction size={12}/> Practice foundation</StatusPill><h1>{item?.work.title}</h1><p>{item?.arrangement.name}</p></div><Button disabled icon={Play}>Record attempt <small>Phase 3</small></Button></div><div className="practice-stage"><div className="panel practice-empty"><Construction/><h2>Score workspace coming in Phase 2</h2><p>This route is ready for score rendering, measure selection and future performance recording. Nothing is being graded or recorded yet.</p></div><div className="panel"><MidiControls compact /></div></div><PianoKeyboard activeNotes={midi.activeNotes} sustainDown={midi.sustainDown}/></div>
}
