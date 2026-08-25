import { Activity, ArrowRight, Blocks, CircleGauge, Eye, Gauge, Layers3, MoveHorizontal, Play, TimerReset } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader, StatusPill } from '../components/ui'
import { TECHNIQUE_MODULES } from '../features/technique/catalog'
import { useRepositoryQuery } from '../features/persistence/PersistenceContext'
import { techniqueSummaryCoverageRatio } from '../features/persistence/types'

const icons = { 'sight-reading': Eye, rhythm: Activity, 'chord-fluency': Blocks, scales: Layers3, arpeggios: MoveHorizontal, octaves: Gauge, 'keyboard-jumps': ArrowRight, 'tempo-control': TimerReset } as const

export function TechniquePage() {
  const history = useRepositoryQuery((repository) => repository.listTechniqueAttemptSummaries(), 'technique-home')
  const attempts = history.status === 'ready' ? history.data : []
  return (
    <div className="page">
      <PageHeader eyebrow="Transferable evidence" title="Technique Lab" description="Focused MIDI exercises with independent, challenge-qualified facets." action={<StatusPill tone="violet"><CircleGauge size={13} /> {attempts.length} saved take{attempts.length === 1 ? '' : 's'}</StatusPill>} />
      <section className="lab-overview panel reveal delay-1"><div className="module-icon"><CircleGauge /></div><div><span>Measured, not ranked</span><h2>Practice one transferable demand at a time.</h2><p>Each result preserves its exact generated exercise and challenge. The Lab does not create an overall score, Mastery, or Skill Rating.</p></div><div className="lab-highlight"><small>Evidence model</small><strong>Independent facets</strong><StatusPill tone="neutral">Challenge shown</StatusPill></div></section>
      <div className="technique-grid reveal delay-2">{TECHNIQUE_MODULES.map((module) => {
        const Icon = icons[module.id]
        const count = attempts.filter((attempt) => attempt.moduleId === module.id).length
        return <article className="technique-card" key={module.id}><div className="technique-card-top"><span className="module-icon"><Icon /></span><StatusPill>{count} saved</StatusPill></div><h2>{module.name}</h2><p>{module.description}</p><div className="rating-row"><span>Independent evidence</span><strong>{module.facets.length} facets</strong></div><small>{module.facets.join(' · ')}</small><Link className="button secondary" to={`/technique/${module.id}`}><Play size={14} /> Open workspace</Link></article>
      })}</div>
      {attempts.length > 0 && <section className="panel technique-history"><div className="section-heading"><div><span>Saved locally</span><h2>Recent Technique takes</h2></div></div>{attempts.slice(0, 8).map((attempt) => <Link to={`/technique/history/${attempt.id}`} className="technique-history-row" key={attempt.id}><span><strong>{TECHNIQUE_MODULES.find((item) => item.id === attempt.moduleId)?.name}</strong><small>{new Date(attempt.performedAt).toLocaleString()}</small></span><span>{Math.round(techniqueSummaryCoverageRatio(attempt) * 100)}% {'schemaVersion' in attempt ? 'event coverage' : 'reached'}</span><ArrowRight size={15} /></Link>)}</section>}
    </div>
  )
}
