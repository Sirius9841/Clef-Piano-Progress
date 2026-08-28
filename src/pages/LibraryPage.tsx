import { BookOpen, FileMusic, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader, StatusPill } from '../components/ui'

/** Official Library entries require a real bundled or licensed score source. V1 currently has none. */
export function LibraryPage() {
  return <div className="page library-page">
    <PageHeader eyebrow="Catalogue" title="Library" description="Official Clef editions remain separate from personal MusicXML imports." action={<StatusPill tone="neutral"><ShieldCheck size={13} /> Official scores only</StatusPill>} />
    <section className="panel catalogue-empty reveal delay-1">
      <div className="staff-motif" aria-hidden="true"><span>𝄞</span><i /><i /><i /><i /><i /></div>
      <div><span className="step-label">Official Library</span><h2>No official editions are installed</h2><p>Clef does not fabricate catalogue works or notation. When licensed official editions are available, they will appear here with their real score files and provenance.</p><Link className="button primary" to="/imports"><FileMusic /> Import your own MusicXML</Link></div>
    </section>
    <section className="library-boundary panel reveal delay-2"><BookOpen /><div><strong>Personal imports stay personal</strong><p>A score you import creates a personal Work, Arrangement, and immutable ScoreVersion. It never becomes an Official Library edition.</p></div></section>
  </div>
}
