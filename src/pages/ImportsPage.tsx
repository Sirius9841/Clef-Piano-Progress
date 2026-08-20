import {
  AlertCircle, AlertTriangle, CheckCircle2, ChevronDown, FileCode2, FileMusic, FolderUp, GitBranch,
  Info, Library, LoaderCircle, Maximize2, Minus, Music2, Plus, RotateCcw, ShieldCheck, UploadCloud, X,
} from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import { Button, PageHeader, StatusPill } from '../components/ui'
import demoScoreXml from '../features/musicxml/demo-score.musicxml?raw'
import { asScoreImportError, type ScoreImportError } from '../features/musicxml/errors'
import { loadMusicXmlFile } from '../features/musicxml/fileLoader'
import { formatMusicalTime } from '../features/musicxml/musicalTime'
import { parseMusicXml } from '../features/musicxml/parser'
import type { LoadedMusicXml, NormalizedScore, ScoreFileLike, ScoreWarning } from '../features/musicxml/types'
import { OsmdScoreRenderer, type ScoreRenderState } from '../features/score-renderer/OsmdScoreRenderer'

type Relationship = 'arrangement' | 'derived' | 'new'
type ImportStage = 'idle' | 'reading' | 'parsing' | 'rendering' | 'ready' | 'error'

const relationships: Array<{ id: Relationship; title: string; description: string; icon: typeof Music2 }> = [
  { id: 'arrangement', title: 'Arrangement of an existing work', description: 'A playable realization whose mastery stays specific to this arrangement.', icon: Music2 },
  { id: 'derived', title: 'Derived, separate work', description: 'A distinct repertoire item inspired by another work, with independent progress.', icon: GitBranch },
  { id: 'new', title: 'Completely new work', description: 'No relationship to a work already in your library.', icon: Library },
]

const stageCopy: Record<Exclude<ImportStage, 'idle' | 'ready' | 'error'>, { title: string; detail: string }> = {
  reading: { title: 'Reading score', detail: 'Checking format and source-file limits' },
  parsing: { title: 'Building score model', detail: 'Normalizing notes, timing, voices and directions' },
  rendering: { title: 'Engraving notation', detail: 'Preparing the sheet-music preview' },
}

function presentError(error: ScoreImportError): string {
  const location = error.context.measureNumber ? ` Measure ${error.context.measureNumber}.` : ''
  return `${error.message}${location}`
}

function formatBytes(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function demoFile(): ScoreFileLike {
  const bytes = new TextEncoder().encode(demoScoreXml)
  return {
    name: 'evening-lines-clef-demo.musicxml',
    size: bytes.byteLength,
    text: async () => demoScoreXml,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  }
}

function ImportProgress({ stage, fileName }: { stage: 'reading' | 'parsing' | 'rendering'; fileName: string }) {
  const activeIndex = ['reading', 'parsing', 'rendering'].indexOf(stage)
  return (
    <section className="panel import-processing">
      <div className="processing-orbit"><LoaderCircle className="spin" /><FileMusic /></div><span className="step-label">{fileName}</span>
      <h2>{stageCopy[stage].title}</h2><p>{stageCopy[stage].detail}</p>
      <div className="processing-steps">{['Validate', 'Normalize', 'Render'].map((label, index) => <div className={index <= activeIndex ? 'active' : ''} key={label}><i>{index < activeIndex ? <CheckCircle2 /> : index + 1}</i><span>{label}</span></div>)}</div>
    </section>
  )
}

function WarningList({ warnings }: { warnings: ScoreWarning[] }) {
  if (warnings.length === 0) return <div className="score-clean"><ShieldCheck /><div><strong>No grading-relevant warnings</strong><span>The supported score structure normalized cleanly.</span></div></div>
  return (
    <section className="panel score-warnings">
      <div className="score-section-heading"><div><span className="score-section-icon warning"><AlertTriangle /></span><div><h2>Score warnings</h2><p>{warnings.length} item{warnings.length === 1 ? '' : 's'} to review before future grading</p></div></div></div>
      <div className="warning-list">{warnings.map((warning, index) => <article key={`${warning.code}-${warning.eventId ?? warning.measureIndex ?? index}`}><AlertCircle /><div><strong>{warning.code.replaceAll('_', ' ')}</strong><p>{warning.message}</p><span>{warning.partId ? `Part ${warning.partId}` : 'Score'}{warning.measureNumber ? ` · Measure ${warning.measureNumber}` : ''}</span></div><StatusPill tone={warning.severity === 'warning' ? 'warning' : 'neutral'}>{warning.severity}</StatusPill></article>)}</div>
    </section>
  )
}

function RelationshipPanel({ relationship, onChange }: { relationship: Relationship; onChange: (relationship: Relationship) => void }) {
  return (
    <section className="panel score-relationship">
      <div className="score-section-heading"><div><span className="score-section-icon"><GitBranch /></span><div><h2>Musical relationship</h2><p>Classify this score without conflating works and arrangements</p></div></div></div>
      <div className="relationship-options score-options">{relationships.map(({ id, title, description, icon: Icon }) => <button className={relationship === id ? 'selected' : ''} onClick={() => onChange(id)} key={id}><span className="radio-dot">{relationship === id && <i />}</span><Icon /><span><strong>{title}</strong><small>{description}</small></span></button>)}</div>
      <div className="session-only-note"><Info /><span>Classification and score data remain in this browser session. Persistence arrives in a later phase.</span></div>
    </section>
  )
}

export function ImportsPage() {
  const inputRef = useRef<HTMLInputElement>(null)
  const operationRef = useRef(0)
  const [stage, setStage] = useState<ImportStage>('idle')
  const [dragActive, setDragActive] = useState(false)
  const [processingFileName, setProcessingFileName] = useState('Selected score')
  const [loaded, setLoaded] = useState<LoadedMusicXml | null>(null)
  const [score, setScore] = useState<NormalizedScore | null>(null)
  const [error, setError] = useState<ScoreImportError | null>(null)
  const [rendererError, setRendererError] = useState<string | null>(null)
  const [relationship, setRelationship] = useState<Relationship>('arrangement')
  const [zoom, setZoom] = useState(0.82)

  const openFilePicker = useCallback(() => {
    if (!inputRef.current) return
    inputRef.current.value = ''
    inputRef.current.click()
  }, [])

  const reset = useCallback(() => {
    operationRef.current += 1
    setStage('idle'); setLoaded(null); setScore(null); setError(null); setRendererError(null); setProcessingFileName('Selected score'); setZoom(0.82)
    if (inputRef.current) inputRef.current.value = ''
  }, [])

  const processFile = useCallback(async (candidate: ScoreFileLike | undefined) => {
    if (!candidate) return
    const operation = ++operationRef.current
    setError(null); setRendererError(null); setLoaded(null); setScore(null); setProcessingFileName(candidate.name); setStage('reading')
    try {
      const nextLoaded = await loadMusicXmlFile(candidate)
      if (operation !== operationRef.current) return
      setLoaded(nextLoaded); setStage('parsing')
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
      const nextScore = parseMusicXml(nextLoaded.musicXmlText)
      if (operation !== operationRef.current) return
      setScore(nextScore); setStage('rendering')
    } catch (cause) {
      if (operation !== operationRef.current) return
      setError(asScoreImportError(cause)); setStage('error')
    }
  }, [])

  const handleRendererState = useCallback((renderState: ScoreRenderState, message?: string) => {
    if (renderState === 'loading') setStage('rendering')
    if (renderState === 'ready') setStage('ready')
    if (renderState === 'error') { setRendererError(message ?? 'The notation preview could not be created.'); setStage('ready') }
  }, [])

  const showWorkspace = stage === 'ready' || stage === 'rendering'

  return (
    <div className="page imports-page phase-two-imports">
      <PageHeader eyebrow="Score intelligence" title="Import MusicXML" description="Validate, normalize and inspect the exact score that future performance analysis will use." action={<StatusPill tone="positive"><FileCode2 size={13} /> Phase 2 pipeline</StatusPill>} />
      {stage === 'idle' && <>
        <section className="panel import-hero reveal delay-1">
          <div className={`upload-zone production ${dragActive ? 'drag-active' : ''}`} onDragEnter={(event) => { event.preventDefault(); setDragActive(true) }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { const nextTarget = event.relatedTarget; if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) setDragActive(false) }} onDrop={(event) => { event.preventDefault(); setDragActive(false); void processFile(event.dataTransfer.files[0]) }}>
            <input ref={inputRef} type="file" accept=".musicxml,.xml,.mxl" onChange={(event) => void processFile(event.target.files?.[0])} />
            <div className="file-icon"><UploadCloud /></div><span className="step-label">MusicXML score intake</span><h2>{dragActive ? 'Release to inspect this score' : 'Bring your score into focus'}</h2>
            <p>Drop a MusicXML file here, or choose one from your computer. Files are validated and processed locally.</p>
            <div className="upload-actions"><Button icon={FolderUp} onClick={openFilePicker}>Choose score</Button><Button variant="secondary" icon={FileMusic} onClick={() => void processFile(demoFile())}>Load original demo</Button></div>
            <div className="format-chips"><span>.musicxml</span><span>.xml</span><span>.mxl</span><small>15 MB source limit</small></div>
          </div>
          <aside className="pipeline-preview"><span className="step-label">Trusted score path</span><h2>One source. Two purposes.</h2><p>The validated XML is sent independently to our normalized model and the notation renderer.</p><div className="pipeline-diagram"><div><FileCode2 /><span>Validated XML</span></div><i /><div className="pipeline-split"><span><Music2 /> Score model<small>Source of truth</small></span><span><FileMusic /> OSMD<small>Renderer only</small></span></div></div><div className="safety-list"><span><ShieldCheck /> Exact fractional timing</span><span><ShieldCheck /> Deterministic event IDs</span><span><ShieldCheck /> Untrusted-input safeguards</span></div></aside>
        </section>
        <div className="import-assurance"><CheckCircle2 /><span><strong>Historical integrity by design</strong>Each later import revision becomes a separate immutable ScoreVersion; Phase 2 keeps the current file in session only.</span></div>
      </>}
      {(stage === 'reading' || stage === 'parsing') && <ImportProgress stage={stage} fileName={loaded?.fileName ?? processingFileName} />}
      {stage === 'error' && error && <section className="panel import-error-state reveal"><span className="error-code">{error.code}</span><div className="error-illustration"><AlertTriangle /></div><h2>This score could not be imported</h2><p>{presentError(error)}</p>{error.context.detail && <code>{error.context.detail}</code>}<div><Button icon={FolderUp} onClick={openFilePicker}>Choose another file</Button><Button variant="ghost" icon={RotateCcw} onClick={reset}>Start over</Button></div><input ref={inputRef} type="file" accept=".musicxml,.xml,.mxl" onChange={(event) => void processFile(event.target.files?.[0])} /></section>}
      {showWorkspace && loaded && score && <div className="score-workspace reveal">
        <section className="score-overview"><div className="panel score-identity"><div className="score-file-mark"><FileMusic /></div><div><span className="step-label">Validated {loaded.sourceFormat.toUpperCase()}</span><h2>{score.metadata.title ?? 'Untitled Score'}</h2><p>{score.metadata.composer ?? 'Unknown composer'} · {score.metadata.partNames.join(', ') || 'Unnamed part'}</p><div className="score-file-meta"><span>{loaded.fileName}</span><i /><span>{formatBytes(loaded.sourceBytes)}</span>{loaded.sourceBytes !== loaded.uncompressedBytes && <><i /><span>{formatBytes(loaded.uncompressedBytes)} unpacked</span></>}</div></div><div className="score-ready-mark"><CheckCircle2 /><span>Model ready<small>{score.id}</small></span></div><Button variant="ghost" icon={X} onClick={reset}>Close</Button></div>
          <div className="score-stat-grid"><div><span>Measures</span><strong>{score.statistics.measureCount}</strong><small>Across {score.statistics.partCount} part{score.statistics.partCount === 1 ? '' : 's'}</small></div><div><span>Pitched notes</span><strong>{score.statistics.pitchedNoteCount}</strong><small>{score.statistics.chordCount} chord group{score.statistics.chordCount === 1 ? '' : 's'}</small></div><div><span>Voices</span><strong>{score.statistics.uniqueVoices.length}</strong><small>{score.statistics.uniqueVoices.join(', ') || 'Not specified'}</small></div><div><span>Staves</span><strong>{score.statistics.staffCount}</strong><small>{score.parts[0]?.measures[0]?.clefs.map((clef) => `${clef.sign} clef`).join(' · ') || 'No clef data'}</small></div><div><span>Pitch range</span><strong>{score.statistics.pitchRange ? `${score.statistics.pitchRange.lowest.spelling}–${score.statistics.pitchRange.highest.spelling}` : '—'}</strong><small>{score.statistics.pianoRangeViolationCount ? `${score.statistics.pianoRangeViolationCount} outside piano range` : 'Within 88 keys'}</small></div><div><span>Notated span</span><strong>{formatMusicalTime(score.statistics.notatedDuration)}</strong><small>Quarter-note units</small></div></div></section>
        <section className="panel notation-panel"><div className="score-section-heading notation-heading"><div><span className="score-section-icon paper"><FileMusic /></span><div><h2>Sheet music preview</h2><p>Rendered from the same canonical XML used by the normalized model</p></div></div><div className="notation-controls"><button onClick={() => setZoom((value) => Math.max(0.5, Number((value - 0.08).toFixed(2))))} aria-label="Zoom out"><Minus /></button><span>{Math.round(zoom * 100)}%</span><button onClick={() => setZoom((value) => Math.min(1.5, Number((value + 0.08).toFixed(2))))} aria-label="Zoom in"><Plus /></button><button onClick={() => setZoom(0.82)} aria-label="Reset zoom"><Maximize2 /></button></div></div>{rendererError && <div className="renderer-inline-error"><AlertCircle /><span>{rendererError}</span></div>}<div className="notation-paper"><OsmdScoreRenderer musicXmlText={loaded.musicXmlText} zoom={zoom} onStateChange={handleRendererState} /></div><div className="notation-foot"><span><Info /> OSMD renders notation only; application-owned normalized events remain the score truth.</span><span><ChevronDown /> Scroll to inspect</span></div></section>
        <div className="score-lower-grid"><RelationshipPanel relationship={relationship} onChange={setRelationship} /><WarningList warnings={score.warnings} /></div>
      </div>}
    </div>
  )
}
