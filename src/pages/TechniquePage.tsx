import { Activity, ArrowRight, Blocks, CircleGauge, Eye, Gauge, Hand, Layers3, MoveHorizontal, Play, TimerReset } from 'lucide-react'
import { Button, Change, PageHeader, ProgressBar, ScoreRing, StatusPill } from '../components/ui'
import { skillRatings } from '../data/mockData'

const moduleIcons = [Eye, Activity, Blocks, Layers3, MoveHorizontal, Hand, ArrowRight, TimerReset]

export function TechniquePage() {
  const modules = skillRatings.filter((skill) => skill.name !== 'Dynamics').map((skill, index) => ({ ...skill, icon: moduleIcons[index] ?? Gauge }))
  return (
    <div className="page">
      <PageHeader eyebrow="Transferable skills" title="Technique Lab" description="Build the fundamentals that carry across every piece." action={<StatusPill tone="violet"><CircleGauge size={13} /> Exercises arrive in Phase 10</StatusPill>} />
      <section className="lab-overview panel reveal delay-1">
        <ScoreRing value={67} label="Overall skill" />
        <div><span>Pianist profile</span><h2>Balanced foundation, rising control.</h2><p>Your strongest area is tempo control. Keyboard jumps and octave fluency offer the clearest opportunity for focused growth.</p></div>
        <div className="lab-highlight"><small>30-day change</small><strong>+4.2</strong><Change value={8} suffix="%" /></div>
      </section>
      <div className="technique-grid reveal delay-2">{modules.map(({ name, rating, recentChange, latestSessionAt, icon: Icon }) => (
        <article className="technique-card" key={name}>
          <div className="technique-card-top"><span className="module-icon"><Icon /></span><Change value={recentChange} /></div>
          <h2>{name}</h2><p>Latest session · {latestSessionAt}</p>
          <div className="rating-row"><span>Current rating</span><strong>{rating}</strong></div>
          <ProgressBar value={rating} tone={rating > 75 ? 'mint' : 'violet'} />
          <Button variant="secondary" icon={Play} disabled>Start <small>Coming later</small></Button>
        </article>
      ))}</div>
      <div className="honest-notice"><Gauge /><div><strong>Foundation preview</strong><p>Technique exercises are intentionally disabled in Phase 1. This screen establishes the skill model and future session entry points without pretending exercise analysis exists.</p></div></div>
    </div>
  )
}
