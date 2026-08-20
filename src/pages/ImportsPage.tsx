import { ArrowDown, CheckCircle2, FileCode2, FileSearch, FolderUp, GitBranch, Info, Library, Music2, UploadCloud, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button, PageHeader, StatusPill } from '../components/ui'

type Relationship = 'arrangement' | 'derived' | 'new'

const relationships: Array<{ id: Relationship; title: string; description: string; icon: typeof Music2 }> = [
  { id: 'arrangement', title: 'Arrangement of an existing work', description: 'A playable realization whose mastery stays specific to this arrangement.', icon: Music2 },
  { id: 'derived', title: 'Derived, separate work', description: 'A distinct repertoire item inspired by another work, with independent progress.', icon: GitBranch },
  { id: 'new', title: 'Completely new work', description: 'No relationship to a work already in your library.', icon: Library },
]

export function ImportsPage() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [relationship, setRelationship] = useState<Relationship>('arrangement')

  function chooseFile(candidate: File | undefined) {
    if (!candidate) return
    if (!/\.(musicxml|xml|mxl)$/i.test(candidate.name)) return
    setFile(candidate)
  }

  return (
    <div className="page imports-page">
      <PageHeader eyebrow="Score intake" title="Imports" description="Prepare MusicXML scores for future analysis while preserving their musical identity." action={<StatusPill tone="violet"><FileCode2 size={13} /> MusicXML only</StatusPill>} />
      <div className="import-steps reveal delay-1"><div className="active"><span>1</span><strong>Select score</strong></div><i /><div><span>2</span><strong>Inspect metadata</strong></div><i /><div><span>3</span><strong>Classify relationship</strong></div><i /><div><span>4</span><strong>Add to repertoire</strong></div></div>
      <section className="import-grid reveal delay-2">
        <div className="panel upload-panel">
          <div className="upload-zone" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); chooseFile(event.dataTransfer.files[0]) }}>
            <input ref={inputRef} type="file" accept=".musicxml,.xml,.mxl" onChange={(event) => chooseFile(event.target.files?.[0])} />
            {file ? <><div className="file-icon selected"><FileCode2 /></div><h2>{file.name}</h2><p>{(file.size / 1024).toFixed(1)} KB · ready for a future parser</p><Button variant="ghost" icon={X} onClick={() => setFile(null)}>Remove</Button></> : <><div className="file-icon"><UploadCloud /></div><h2>Drop a MusicXML score here</h2><p>Choose a .musicxml, .xml or compressed .mxl file</p><Button icon={FolderUp} onClick={() => inputRef.current?.click()}>Choose score</Button></>}
          </div>
          <div className="format-note"><Info /><div><strong>Why MusicXML?</strong><p>It preserves machine-readable notes, timing, measures and expressive markings needed for later grading. PDF and image recognition are outside the MVP.</p></div></div>
        </div>
        <div className="panel classification-panel">
          <div><span className="step-label">Preview · Step 3</span><h2>How is this score related?</h2><p>This classification keeps works, arrangements and derivative pieces semantically correct.</p></div>
          <div className="relationship-options">{relationships.map(({ id, title, description, icon: Icon }) => <button className={relationship === id ? 'selected' : ''} onClick={() => setRelationship(id)} key={id}><span className="radio-dot">{relationship === id && <i />}</span><Icon /><span><strong>{title}</strong><small>{description}</small></span></button>)}</div>
          <div className="future-action"><FileSearch /><span><strong>Metadata inspection is not active yet</strong><small>Parsing and editable metadata arrive in Phase 2.</small></span><Button disabled>Continue <ArrowDown /></Button></div>
        </div>
      </section>
      <div className="import-assurance"><CheckCircle2 /><span><strong>Historical integrity by design</strong>Each imported revision will become an immutable ScoreVersion, so future performance results always point to the exact score used.</span></div>
    </div>
  )
}
