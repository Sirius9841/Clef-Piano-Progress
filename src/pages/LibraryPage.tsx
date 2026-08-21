import { BookOpen, FileClock, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, PageHeader, StatusPill } from '../components/ui'

const scores = [
  { title: 'Prelude in C Major', composer: 'J. S. Bach', difficulty: 'Foundation', arrangements: 3, period: 'Baroque', color: 'sage' },
  { title: 'Gymnopédie No. 1', composer: 'Erik Satie', difficulty: 'Intermediate', arrangements: 2, period: 'Modern', color: 'violet' },
  { title: 'Nocturne in E♭ Major', composer: 'Frédéric Chopin', difficulty: 'Advanced', arrangements: 2, period: 'Romantic', color: 'amber' },
  { title: 'Clair de lune', composer: 'Claude Debussy', difficulty: 'Advanced', arrangements: 2, period: 'Impressionist', color: 'blue' },
  { title: 'Für Elise', composer: 'Ludwig van Beethoven', difficulty: 'Intermediate', arrangements: 4, period: 'Classical', color: 'rose' },
  { title: 'The Entertainer', composer: 'Scott Joplin', difficulty: 'Intermediate', arrangements: 2, period: 'Ragtime', color: 'teal' },
]

export function LibraryPage() {
  const [query, setQuery] = useState('')
  const [difficulty, setDifficulty] = useState('All')
  const [period, setPeriod] = useState('All')
  const filtered = useMemo(() => scores.filter((score) => `${score.title} ${score.composer}`.toLowerCase().includes(query.toLowerCase()) && (difficulty === 'All' || score.difficulty === difficulty) && (period === 'All' || score.period === period)), [difficulty, period, query])

  return (
    <div className="page">
      <PageHeader eyebrow="Catalog preview" title="Library" description="Explore repertoire metadata while the curated legal-score pipeline is being built." action={<Link className="button primary" to="/imports">Import your score</Link>} />
      <div className="library-search panel reveal delay-1">
        <label className="search-field large"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by work or composer" /></label>
        <label className="filter-select"><span>Difficulty</span><select aria-label="Filter catalog by difficulty" value={difficulty} onChange={(event) => setDifficulty(event.target.value)}><option>All</option><option>Foundation</option><option>Intermediate</option><option>Advanced</option></select></label>
        <label className="filter-select"><span>Period</span><select aria-label="Filter catalog by period" value={period} onChange={(event) => setPeriod(event.target.value)}><option>All</option>{[...new Set(scores.map((score) => score.period))].sort().map((value) => <option key={value}>{value}</option>)}</select></label>
      </div>
      <div className="library-context reveal delay-1"><div><BookOpen /><p><strong>Metadata preview only</strong><span>No MusicXML files are attached, persisted, or downloaded from this catalog. Use Imports with a score you are entitled to use.</span></p></div><span>{filtered.length} works</span></div>
      <div className="library-grid reveal delay-2">{filtered.map((score) => (
        <article className="library-card" key={score.title}>
          <div className={`score-cover ${score.color}`}><i /><span className="clef">𝄞</span><small>{score.period.toUpperCase()}</small><strong>{score.title}</strong><p>{score.composer}</p></div>
          <div className="library-card-body"><div><StatusPill tone={score.difficulty === 'Advanced' ? 'violet' : 'neutral'}>{score.difficulty}</StatusPill><span>{score.arrangements} possible arrangements</span></div><h2>{score.title}</h2><p>{score.composer}</p><Button variant="ghost" icon={FileClock} disabled>Score file not available yet</Button></div>
        </article>
      ))}</div>
    </div>
  )
}
