import { Activity, ArrowRight, Blocks, CircleGauge, Eye, Gauge, Hand, Layers3, MoveHorizontal, Play, TimerReset } from 'lucide-react'
import { Button, PageHeader, StatusPill } from '../components/ui'

const modules = [
  { name: 'Sight reading', description: 'Read unfamiliar notation fluently while keeping a steady musical pulse.', focus: 'Pitch, continuity, and reading range', icon: Eye },
  { name: 'Rhythm', description: 'Build dependable subdivision and coordination across changing patterns.', focus: 'Pulse, subdivision, and meter', icon: Activity },
  { name: 'Chord fluency', description: 'Recognize and voice common chord shapes across the keyboard.', focus: 'Shapes, inversions, and voicing', icon: Blocks },
  { name: 'Scales', description: 'Develop even fingering and controlled motion through every key area.', focus: 'Evenness, fingering, and control', icon: Layers3 },
  { name: 'Arpeggios', description: 'Connect broken-chord patterns with relaxed lateral movement.', focus: 'Rotation, crossings, and continuity', icon: MoveHorizontal },
  { name: 'Octaves', description: 'Prepare efficient repeated-octave movement without fabricated scoring.', focus: 'Release, alignment, and endurance', icon: Hand },
  { name: 'Keyboard jumps', description: 'Train accurate spatial movement between distant registers.', focus: 'Distance, landing, and recovery', icon: ArrowRight },
  { name: 'Tempo control', description: 'Practice stable tempo changes without conflating speed and rhythm.', focus: 'Stability, transitions, and pacing', icon: TimerReset },
] as const

export function TechniquePage() {
  return (
    <div className="page">
      <PageHeader eyebrow="Transferable skills" title="Technique Lab" description="Build the fundamentals that carry across every piece." action={<StatusPill tone="violet"><CircleGauge size={13} /> Exercises arrive in Phase 10</StatusPill>} />
      <section className="lab-overview panel reveal delay-1">
        <div className="score-ring large"><div><CircleGauge /><span>Future lab</span></div></div>
        <div><span>Transferable technique</span><h2>Focused exercises, grounded in real evidence.</h2><p>Skill ratings and recommendations are not calculated yet. Future exercises will measure abilities separately from repertoire results.</p></div>
        <div className="lab-highlight"><small>Current availability</small><strong>Preview</strong><StatusPill tone="neutral">No ratings yet</StatusPill></div>
      </section>
      <div className="technique-grid reveal delay-2">{modules.map(({ name, description, focus, icon: Icon }) => (
        <article className="technique-card" key={name}>
          <div className="technique-card-top"><span className="module-icon"><Icon /></span><StatusPill>Future module</StatusPill></div>
          <h2>{name}</h2><p>{description}</p>
          <div className="rating-row"><span>Planned focus</span><strong>Not measured</strong></div>
          <small>{focus}</small>
          <Button variant="secondary" icon={Play} disabled>Exercises not available</Button>
        </article>
      ))}</div>
      <div className="honest-notice"><Gauge /><div><strong>Truthful product preview</strong><p>No exercise history, skill rating, strongest-skill claim, or personalized recommendation is shown until Technique Lab sessions and measurement semantics exist.</p></div></div>
    </div>
  )
}
