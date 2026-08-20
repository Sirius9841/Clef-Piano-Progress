import { BookOpen, Check, ChevronDown, Library, Plus, Search, SlidersHorizontal } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button, PageHeader, StatusPill } from '../components/ui'

const scores = [
  { title: 'Prelude in C Major', composer: 'J. S. Bach', difficulty: 'Foundation', arrangements: 3, period: 'Baroque', inRepertoire: false, color: 'sage' },
  { title: 'Gymnopédie No. 1', composer: 'Erik Satie', difficulty: 'Intermediate', arrangements: 2, period: 'Modern', inRepertoire: true, color: 'violet' },
  { title: 'Nocturne in E♭ Major', composer: 'Frédéric Chopin', difficulty: 'Advanced', arrangements: 2, period: 'Romantic', inRepertoire: false, color: 'amber' },
  { title: 'Clair de lune', composer: 'Claude Debussy', difficulty: 'Advanced', arrangements: 2, period: 'Impressionist', inRepertoire: true, color: 'blue' },
  { title: 'Für Elise', composer: 'Ludwig van Beethoven', difficulty: 'Intermediate', arrangements: 4, period: 'Classical', inRepertoire: false, color: 'rose' },
  { title: 'The Entertainer', composer: 'Scott Joplin', difficulty: 'Intermediate', arrangements: 2, period: 'Ragtime', inRepertoire: false, color: 'teal' },
]

export function LibraryPage() {
  const [query, setQuery] = useState('')
  const [added, setAdded] = useState(() => new Set(scores.filter((score) => score.inRepertoire).map((score) => score.title)))
  const filtered = useMemo(() => scores.filter((score) => `${score.title} ${score.composer}`.toLowerCase().includes(query.toLowerCase())), [query])

  function addScore(title: string) {
    setAdded((current) => new Set(current).add(title))
  }

  return (
    <div className="page">
      <PageHeader eyebrow="Curated scores" title="Library" description="Discover public-domain repertoire and choose the arrangement that fits your playing." action={<StatusPill><Library size={13} /> Preview catalog</StatusPill>} />
      <div className="library-search panel reveal delay-1">
        <label className="search-field large"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by work or composer" /></label>
        <button className="filter-select">Composer <ChevronDown size={15} /></button>
        <button className="filter-select">Difficulty <ChevronDown size={15} /></button>
        <button className="icon-button" aria-label="More filters"><SlidersHorizontal size={18} /></button>
      </div>
      <div className="library-context reveal delay-1"><div><BookOpen /><p><strong>About this catalog</strong><span>Phase 1 uses metadata-only placeholders. No copyrighted scores are included or downloaded.</span></p></div><span>{filtered.length} works</span></div>
      <div className="library-grid reveal delay-2">{filtered.map((score) => (
        <article className="library-card" key={score.title}>
          <div className={`score-cover ${score.color}`}><i /><span className="clef">𝄞</span><small>{score.period.toUpperCase()}</small><strong>{score.title}</strong><p>{score.composer}</p></div>
          <div className="library-card-body"><div><StatusPill tone={score.difficulty === 'Advanced' ? 'violet' : 'neutral'}>{score.difficulty}</StatusPill><span>{score.arrangements} arrangements</span></div><h2>{score.title}</h2><p>{score.composer}</p><Button variant={added.has(score.title) ? 'ghost' : 'secondary'} icon={added.has(score.title) ? Check : Plus} onClick={() => addScore(score.title)} disabled={added.has(score.title)}>{added.has(score.title) ? 'In repertoire' : 'Add to repertoire'}</Button></div>
        </article>
      ))}</div>
    </div>
  )
}
