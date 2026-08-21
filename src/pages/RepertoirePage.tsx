import { ArrowDownUp, Clock3, Grid2X2, List, Music2, Play, Search } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader, StatusPill } from '../components/ui'
import type { RepertoireStatus } from '../domain/music'
import { useRepositoryQuery } from '../features/persistence/PersistenceContext'
import { PersistenceErrorState } from '../features/persistence/PersistenceErrorState'
import { formatPercent } from '../features/progress/model'
import { sortRepertoireItems, type RepertoireSort } from '../features/repertoire/sort'

const filters: Array<'All' | RepertoireStatus> = ['All', 'Learning', 'Practicing', 'Performance Ready', 'Completed']

function formatLastPracticed(value: string | null): string {
  if (!value) return 'Not practiced yet'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value))
}

export function RepertoirePage() {
  const queryState = useRepositoryQuery((repository) => repository.listRepertoire(), 'repertoire')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<(typeof filters)[number]>('All')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [sort, setSort] = useState<RepertoireSort>('recently-practiced')
  const items = queryState.status === 'ready' ? queryState.data : []
  const filtered = sortRepertoireItems(items.filter((item) => {
    const matchesText = `${item.work.title} ${item.work.composer} ${item.arrangement.name}`.toLowerCase().includes(query.toLowerCase())
    return matchesText && (filter === 'All' || item.repertoire.status === filter)
  }), sort)

  return (
    <div className="page">
      <PageHeader eyebrow="Your music" title="Repertoire" description={`${items.length} locally stored arrangement${items.length === 1 ? '' : 's'}`} action={<Link className="button primary" to="/imports">Import score</Link>} />
      {queryState.status === 'loading' && <div className="route-loader"><strong>Opening local repertoire…</strong></div>}
      {queryState.status === 'error' && <PersistenceErrorState title="Repertoire could not be opened" error={queryState.error} />}
      {queryState.status === 'ready' && items.length === 0 && <div className="empty-state"><Music2 /><h2>Your repertoire starts with a score</h2><p>Import MusicXML to create a real Work, Arrangement, and immutable ScoreVersion.</p><Link className="button primary" to="/imports">Import MusicXML</Link></div>}
      {queryState.status === 'ready' && items.length > 0 && <>
        <div className="toolbar reveal delay-1">
          <label className="search-field"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, composer or arrangement" /></label>
          <div className="filter-tabs">{filters.map((item) => <button className={filter === item ? 'active' : ''} onClick={() => setFilter(item)} key={item}>{item}</button>)}</div>
          <label className="filter-select"><ArrowDownUp size={17} /><span>Sort</span><select aria-label="Sort repertoire" value={sort} onChange={(event) => setSort(event.target.value as RepertoireSort)}><option value="recently-practiced">Recently practiced</option><option value="date-added">Date added</option><option value="title">Title A–Z</option><option value="status">Status</option></select></label>
          <div className="view-toggle"><button className={view === 'grid' ? 'active' : ''} onClick={() => setView('grid')} aria-label="Grid view"><Grid2X2 size={16} /></button><button className={view === 'list' ? 'active' : ''} onClick={() => setView('list')} aria-label="List view"><List size={17} /></button></div>
        </div>
        <div className={`repertoire-grid ${view} reveal delay-2`}>
          {filtered.map(({ work, arrangement, repertoire, latestAttempt, sessionCount, lastPracticedAt }, index) => (
            <article className="repertoire-card" key={arrangement.id}>
              <Link to={`/repertoire/${arrangement.id}`} className={`repertoire-art artwork-${(index % 4) + 1}`}><span className="art-monogram">{work.title.split(' ').slice(0, 2).map((word) => word[0]).join('')}</span><span className="art-lines" /><span className="hover-play"><Play fill="currentColor" /></span></Link>
              <div className="repertoire-card-body">
                <div className="card-topline"><StatusPill tone={repertoire.status === 'Performance Ready' ? 'positive' : repertoire.status === 'Learning' ? 'violet' : 'neutral'}>{repertoire.status}</StatusPill><span className="local-badge">Local</span></div>
                <Link to={`/repertoire/${arrangement.id}`}><h2>{work.title}</h2></Link><p>{work.composer}</p>
                <span className="arrangement-name">{arrangement.name} · {arrangement.difficulty}</span>
                <div className="card-metrics"><div><span>Latest Notes</span><strong>{formatPercent(latestAttempt?.notes ?? null)}</strong></div><div><span>Rhythm / Tempo</span><strong>{formatPercent(latestAttempt?.rhythm ?? null)} · {formatPercent(latestAttempt?.tempo ?? null)}</strong></div></div>
                <div className="take-foot"><span><Clock3 size={13} /> {formatLastPracticed(lastPracticedAt)}</span><span>{sessionCount} session{sessionCount === 1 ? '' : 's'}</span></div>
              </div>
            </article>
          ))}
        </div>
        {filtered.length === 0 && <div className="empty-state"><Search /><h2>No arrangements found</h2><p>Try a different title or status filter.</p></div>}
      </>}
    </div>
  )
}
