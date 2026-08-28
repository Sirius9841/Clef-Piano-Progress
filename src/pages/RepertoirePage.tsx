import { ArrowDownUp, Clock3, Grid2X2, List, Music2, Play, Search } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader, StatusPill } from '../components/ui'
import type { RepertoireStatus } from '../domain/music'
import { useRepositoryQuery } from '../features/persistence/PersistenceContext'
import { PersistenceErrorState } from '../features/persistence/PersistenceErrorState'
import { formatPercent } from '../features/progress/model'
import { sortRepertoireItems, type RepertoireSort } from '../features/repertoire/sort'
import { deriveArrangementMastery } from '../features/mastery-model'
import type { AttemptSummary, RepertoireListItem } from '../features/persistence/types'
import { SectionHeading } from '../components/ui'
import { PracticeLaunchButton } from '../components/PracticeLaunchButton'

const filters: Array<'All' | RepertoireStatus> = ['All', 'Learning', 'Practicing', 'Performance Ready', 'Completed']

function formatLastPracticed(value: string | null): string {
  if (!value) return 'Not practiced yet'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value))
}

export function RepertoirePage() {
  const queryState = useRepositoryQuery<{ readonly items: readonly RepertoireListItem[]; readonly attempts: readonly AttemptSummary[]; readonly asOf: string }>(async (repository) => {
    const [items, attempts] = await Promise.all([repository.listRepertoire(), repository.listAttemptSummaries()])
    return { items, attempts, asOf: new Date().toISOString() }
  }, 'repertoire')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<(typeof filters)[number]>('All')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [sort, setSort] = useState<RepertoireSort>('recently-practiced')
  const items = queryState.status === 'ready' ? queryState.data.items : []
  const attempts = queryState.status === 'ready' ? queryState.data.attempts : []
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
        <SectionHeading title="Currently / Recently Practiced" subtitle="Manual repertoire status, current-score Mastery, and demonstrated speed remain separate facts" />
        <div className={`repertoire-grid ${view} reveal delay-2`}>
          {filtered.map((item, index) => {
            const { work, arrangement, repertoire, scoreVersion, latestAttempt, sessionCount, lastPracticedAt } = item
            return (
            <article className="repertoire-card" key={arrangement.id}>
              <Link to={`/repertoire/${arrangement.id}`} className={`repertoire-art artwork-${(index % 4) + 1}`}><span className="art-monogram">{work.title.split(' ').slice(0, 2).map((word) => word[0]).join('')}</span><span className="art-lines" /><span className="hover-play"><Play fill="currentColor" /></span></Link>
              <div className="repertoire-card-body">
                <div className="card-topline"><StatusPill tone={repertoire.status === 'Performance Ready' ? 'positive' : repertoire.status === 'Learning' ? 'violet' : 'neutral'}>{repertoire.status}</StatusPill><span className="local-badge">Local</span></div>
                <Link to={`/repertoire/${arrangement.id}`}><h2>{work.title}</h2></Link><p>{work.composer}</p>
                <span className="arrangement-name">{arrangement.name} · {arrangement.difficulty}</span>
                {(() => { const mastery = deriveArrangementMastery({ arrangementId: arrangement.id, scoreVersionId: scoreVersion.id, attempts: attempts.filter((attempt) => attempt.arrangementId === arrangement.id), asOf: queryState.data.asOf }); return <div className="mastery-row"><div><span>Mastery · {mastery.confidence} confidence</span><strong>{mastery.mastery === null ? '—' : `${mastery.mastery.toFixed(1)}%`}</strong></div><div className="repertoire-speed-line"><span>Demonstrated {mastery.demonstratedSpeedMultiplier === null ? '—' : `${Math.round(mastery.demonstratedSpeedMultiplier * 100)}%`}</span><span>Target 100%</span></div></div> })()}
                <div className="card-metrics"><div><span>Latest Notes</span><strong>{formatPercent(latestAttempt?.notes ?? null)}</strong></div><div><span>Rhythm / Tempo</span><strong>{formatPercent(latestAttempt?.rhythm ?? null)} · {formatPercent(latestAttempt?.tempo ?? null)}</strong></div></div>
                <div className="take-foot"><span><Clock3 size={13} /> {formatLastPracticed(lastPracticedAt)}</span><span>{sessionCount} session{sessionCount === 1 ? '' : 's'}</span></div>
                <PracticeLaunchButton item={item} variant="secondary">Practice</PracticeLaunchButton>
              </div>
            </article>
            )
          })}
        </div>
        <section className="repertoire-ledger panel"><SectionHeading title="Full repertoire ledger" subtitle="One row per playable Arrangement" /><div className="ledger-table" role="table" aria-label="Full repertoire"><div className="ledger-head" role="row"><span>Work / Arrangement</span><span>Status</span><span>Current score</span><span>Last practiced</span><span>Practice</span></div>{items.map((item) => <div className="ledger-row" role="row" key={item.arrangement.id}><Link to={`/repertoire/${item.arrangement.id}`}><strong>{item.work.title}</strong><small>{item.arrangement.name}</small></Link><span>{item.repertoire.status}</span><code>v{item.scoreVersion.version}</code><span>{formatLastPracticed(item.lastPracticedAt)}</span><Link className="text-link" to={`/repertoire/${item.arrangement.id}`}>Open <Play /></Link></div>)}</div></section>
        {filtered.length === 0 && <div className="empty-state"><Search /><h2>No arrangements found</h2><p>Try a different title or status filter.</p></div>}
      </>}
    </div>
  )
}
