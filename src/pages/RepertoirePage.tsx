import { ArrowDownUp, Filter, Grid2X2, List, MoreHorizontal, Play, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Change, PageHeader, ProgressBar, StatusPill } from '../components/ui'
import { repertoire } from '../data/mockData'
import type { RepertoireStatus } from '../domain/music'

const filters: Array<'All' | RepertoireStatus> = ['All', 'Learning', 'Practicing', 'Performance Ready', 'Completed']

export function RepertoirePage() {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<(typeof filters)[number]>('All')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const filtered = useMemo(() => repertoire.filter((item) => {
    const matchesText = `${item.work.title} ${item.work.composer} ${item.arrangement.name}`.toLowerCase().includes(query.toLowerCase())
    return matchesText && (filter === 'All' || item.progress.status === filter)
  }), [filter, query])

  return (
    <div className="page">
      <PageHeader eyebrow="Your music" title="Repertoire" description={`${repertoire.length} active arrangements · 71% average mastery`} />
      <div className="toolbar reveal delay-1">
        <label className="search-field"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, composer or arrangement" /></label>
        <div className="filter-tabs">{filters.map((item) => <button className={filter === item ? 'active' : ''} onClick={() => setFilter(item)} key={item}>{item}</button>)}</div>
        <button className="icon-button" aria-label="Sort repertoire"><ArrowDownUp size={17} /></button>
        <button className="icon-button" aria-label="Filter repertoire"><Filter size={17} /></button>
        <div className="view-toggle"><button className={view === 'grid' ? 'active' : ''} onClick={() => setView('grid')} aria-label="Grid view"><Grid2X2 size={16} /></button><button className={view === 'list' ? 'active' : ''} onClick={() => setView('list')} aria-label="List view"><List size={17} /></button></div>
      </div>
      <div className={`repertoire-grid ${view} reveal delay-2`}>
        {filtered.map(({ work, arrangement, progress }, index) => (
          <article className="repertoire-card" key={arrangement.id}>
            <Link to={`/repertoire/${arrangement.id}`} className={`repertoire-art artwork-${(index % 4) + 1}`}>
              <span className="art-monogram">{work.title.split(' ').slice(0, 2).map((word) => word[0]).join('')}</span>
              <span className="art-lines" />
              <span className="hover-play"><Play fill="currentColor" /></span>
            </Link>
            <div className="repertoire-card-body">
              <div className="card-topline"><StatusPill tone={progress.status === 'Performance Ready' ? 'positive' : progress.status === 'Learning' ? 'violet' : 'neutral'}>{progress.status}</StatusPill><button className="bare-button" aria-label={`More options for ${work.title}`}><MoreHorizontal /></button></div>
              <Link to={`/repertoire/${arrangement.id}`}><h2>{work.title}</h2></Link>
              <p>{work.composer}</p>
              <span className="arrangement-name">{arrangement.name} · {arrangement.difficulty}</span>
              <div className="mastery-row"><div><span>Mastery</span><strong>{progress.mastery}%</strong></div><ProgressBar value={progress.mastery} /></div>
              <div className="card-metrics"><div><span>Clean tempo</span><strong>{progress.cleanTempoBpm}<small> / {arrangement.targetTempoBpm} BPM</small></strong></div><div><span>Recent score</span><strong>{progress.latestPerformanceScore}</strong><Change value={progress.recentChange} /></div></div>
            </div>
          </article>
        ))}
      </div>
      {filtered.length === 0 && <div className="empty-state"><Search /><h2>No arrangements found</h2><p>Try a different title or status filter.</p></div>}
    </div>
  )
}
