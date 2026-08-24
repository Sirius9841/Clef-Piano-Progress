import {
  AlertCircle, AlertTriangle, CheckCircle2, ChevronDown, FileCode2, FileMusic, FolderUp, GitBranch,
  Info, Library, LoaderCircle, Maximize2, Minus, Music2, Play, Plus, RotateCcw, ShieldCheck, UploadCloud, X,
} from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, PageHeader, StatusPill } from '../components/ui'
import { ExpectedPerformanceBuildError } from '../features/expected-performance/types'
import demoScoreXml from '../features/musicxml/demo-score.musicxml?raw'
import { asScoreImportError, type ScoreImportError } from '../features/musicxml/errors'
import { loadMusicXmlFile } from '../features/musicxml/fileLoader'
import { formatMusicalTime } from '../features/musicxml/musicalTime'
import { MUSICXML_PARSER_VERSION, parseMusicXml } from '../features/musicxml/parser'
import type { LoadedMusicXml, NormalizedScore, ScoreFileLike, ScoreWarning } from '../features/musicxml/types'
import { usePersistence, useRepositoryQuery } from '../features/persistence/PersistenceContext'
import type { PersistedWork } from '../features/persistence/types'
import type { Difficulty } from '../domain/music'
import { usePracticeSession } from '../features/practice/PracticeSessionContext'
import { buildPersistedPracticePlan } from '../features/practice/persistedPractice'
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

function RelationshipPanel({ relationship, onChange, works, existingWorkId, sourceWorkId, onExistingWorkChange, onSourceWorkChange, arrangementName, onArrangementNameChange, difficulty, onDifficultyChange }: {
  relationship: Relationship
  onChange: (relationship: Relationship) => void
  works: readonly PersistedWork[]
  existingWorkId: string
  sourceWorkId: string
  onExistingWorkChange: (id: string) => void
  onSourceWorkChange: (id: string) => void
  arrangementName: string
  onArrangementNameChange: (value: string) => void
  difficulty: Difficulty
  onDifficultyChange: (value: Difficulty) => void
}) {
  return (
    <section className="panel score-relationship">
      <div className="score-section-heading"><div><span className="score-section-icon"><GitBranch /></span><div><h2>Musical relationship</h2><p>Classify this score without conflating works and arrangements</p></div></div></div>
      <div className="relationship-options score-options">{relationships.map(({ id, title, description, icon: Icon }) => <button className={relationship === id ? 'selected' : ''} onClick={() => onChange(id)} key={id}><span className="radio-dot">{relationship === id && <i />}</span><Icon /><span><strong>{title}</strong><small>{description}</small></span></button>)}</div>
      <div className="persistence-form">
        <label><span>Arrangement name</span><input value={arrangementName} onChange={(event) => onArrangementNameChange(event.target.value)} /></label>
        <label><span>Difficulty</span><select value={difficulty} onChange={(event) => onDifficultyChange(event.target.value as Difficulty)}>{(['Foundation', 'Intermediate', 'Advanced'] as const).map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        {relationship === 'arrangement' && <label><span>Existing Work</span><select value={existingWorkId} onChange={(event) => onExistingWorkChange(event.target.value)}><option value="">Choose a Work</option>{works.map((work) => <option key={work.id} value={work.id}>{work.title} — {work.composer}</option>)}</select></label>}
        {relationship === 'derived' && <label><span>Source Work</span><select value={sourceWorkId} onChange={(event) => onSourceWorkChange(event.target.value)}><option value="">Choose the source Work</option>{works.map((work) => <option key={work.id} value={work.id}>{work.title} — {work.composer}</option>)}</select></label>}
      </div>
      <div className="session-only-note"><Info /><span>The canonical score, classification, and immutable ScoreVersion will be stored locally in this browser.</span></div>
    </section>
  )
}

export function ImportsPage() {
  const navigate = useNavigate()
  const practice = usePracticeSession()
  const persistence = usePersistence()
  const worksQuery = useRepositoryQuery((repository) => repository.listWorks(), 'import-works')
  const inputRef = useRef<HTMLInputElement>(null)
  const operationRef = useRef(0)
  const [stage, setStage] = useState<ImportStage>('idle')
  const [dragActive, setDragActive] = useState(false)
  const [processingFileName, setProcessingFileName] = useState('Selected score')
  const [loaded, setLoaded] = useState<LoadedMusicXml | null>(null)
  const [score, setScore] = useState<NormalizedScore | null>(null)
  const [error, setError] = useState<ScoreImportError | null>(null)
  const [rendererError, setRendererError] = useState<string | null>(null)
  const [relationship, setRelationship] = useState<Relationship>('new')
  const [zoom, setZoom] = useState(0.82)
  const [selectedPartIds, setSelectedPartIds] = useState<string[]>([])
  const [practiceError, setPracticeError] = useState<string | null>(null)
  const [existingWorkId, setExistingWorkId] = useState('')
  const [sourceWorkId, setSourceWorkId] = useState('')
  const [arrangementName, setArrangementName] = useState('Imported arrangement')
  const [difficulty, setDifficulty] = useState<Difficulty>('Intermediate')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')

  const persistedWorks = worksQuery.status === 'ready' ? worksQuery.data : []
  const openFilePicker = useCallback(() => {
    if (!inputRef.current) return
    inputRef.current.value = ''
    inputRef.current.click()
  }, [])

  const reset = useCallback(() => {
    operationRef.current += 1
    setStage('idle'); setLoaded(null); setScore(null); setError(null); setRendererError(null); setProcessingFileName('Selected score'); setZoom(0.82); setSelectedPartIds([]); setPracticeError(null); setSaveState('idle'); setDifficulty('Intermediate')
    if (inputRef.current) inputRef.current.value = ''
  }, [])

  const processFile = useCallback(async (candidate: ScoreFileLike | undefined) => {
    if (!candidate) return
    const operation = ++operationRef.current
    setError(null); setRendererError(null); setPracticeError(null); setLoaded(null); setScore(null); setSelectedPartIds([]); setProcessingFileName(candidate.name); setStage('reading')
    try {
      const nextLoaded = await loadMusicXmlFile(candidate)
      if (operation !== operationRef.current) return
      setLoaded(nextLoaded); setStage('parsing')
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
      const nextScore = parseMusicXml(nextLoaded.musicXmlText)
      if (operation !== operationRef.current) return
      setScore(nextScore); setSelectedPartIds(nextScore.parts.length === 1 ? [nextScore.parts[0]!.id] : []); setStage('rendering')
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

  const beginPractice = useCallback(async () => {
    if (!loaded || !score || !persistence.repository) return
    setPracticeError(null)
    setSaveState('saving')
    try {
      const saved = await persistence.repository.importScore({
        relationship: relationship === 'arrangement' ? 'existing-work-arrangement' : relationship === 'derived' ? 'derived-work' : 'new-work',
        ...(relationship === 'arrangement' ? { existingWorkId } : {}),
        ...(relationship === 'derived' ? { sourceWorkId } : {}),
        work: { title: score.metadata.title ?? 'Untitled Work', composer: score.metadata.composer ?? 'Unknown composer' },
        arrangement: { name: arrangementName, difficulty, includedPartIds: selectedPartIds },
        loaded,
        normalizedScoreId: score.id,
        parserVersion: MUSICXML_PARSER_VERSION,
        status: 'Learning',
      })
      const plan = buildPersistedPracticePlan(score, saved.scoreVersion, selectedPartIds)
      setSaveState('saved')
      practice.startSession({ arrangementId: saved.arrangement.id, scoreVersionId: saved.scoreVersion.id, source: loaded, score, plan, sourceLabel: loaded.fileName, isDemo: false, speedMultiplier: 1 })
      navigate('/practice/session')
    } catch (cause) {
      setSaveState('idle')
      setPracticeError(cause instanceof ExpectedPerformanceBuildError || cause instanceof Error ? cause.message : 'This score could not be saved and prepared for practice.')
    }
  }, [arrangementName, difficulty, existingWorkId, loaded, navigate, persistence.repository, practice, relationship, score, selectedPartIds, sourceWorkId])

  return (
    <div className="page imports-page phase-two-imports">
      <PageHeader eyebrow="Score intelligence" title="Import MusicXML" description="Validate, normalize, persist, and inspect the exact score used for performance analysis." action={<StatusPill tone="positive"><FileCode2 size={13} /> Phase 8 local-first</StatusPill>} />
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
        <div className="import-assurance"><CheckCircle2 /><span><strong>Historical integrity by design</strong>The canonical score is fingerprinted and stored as an immutable ScoreVersion in this browser.</span></div>
      </>}
      {(stage === 'reading' || stage === 'parsing') && <ImportProgress stage={stage} fileName={loaded?.fileName ?? processingFileName} />}
      {stage === 'error' && error && <section className="panel import-error-state reveal"><span className="error-code">{error.code}</span><div className="error-illustration"><AlertTriangle /></div><h2>This score could not be imported</h2><p>{presentError(error)}</p>{error.context.detail && <code>{error.context.detail}</code>}<div><Button icon={FolderUp} onClick={openFilePicker}>Choose another file</Button><Button variant="ghost" icon={RotateCcw} onClick={reset}>Start over</Button></div><input ref={inputRef} type="file" accept=".musicxml,.xml,.mxl" onChange={(event) => void processFile(event.target.files?.[0])} /></section>}
      {showWorkspace && loaded && score && <div className="score-workspace reveal">
        <section className="score-overview"><div className="panel score-identity"><div className="score-file-mark"><FileMusic /></div><div><span className="step-label">Validated {loaded.sourceFormat.toUpperCase()}</span><h2>{score.metadata.title ?? 'Untitled Score'}</h2><p>{score.metadata.composer ?? 'Unknown composer'} · {score.metadata.partNames.join(', ') || 'Unnamed part'}</p><div className="score-file-meta"><span>{loaded.fileName}</span><i /><span>{formatBytes(loaded.sourceBytes)}</span>{loaded.sourceBytes !== loaded.uncompressedBytes && <><i /><span>{formatBytes(loaded.uncompressedBytes)} unpacked</span></>}</div></div><div className="score-ready-mark"><CheckCircle2 /><span>Model ready<small>{score.id}</small></span></div><Button variant="ghost" icon={X} onClick={reset}>Close</Button></div>
          <div className="score-stat-grid"><div><span>Measures</span><strong>{score.statistics.measureCount}</strong><small>Across {score.statistics.partCount} part{score.statistics.partCount === 1 ? '' : 's'}</small></div><div><span>Pitched notes</span><strong>{score.statistics.pitchedNoteCount}</strong><small>{score.statistics.chordCount} chord group{score.statistics.chordCount === 1 ? '' : 's'}</small></div><div><span>Voices</span><strong>{score.statistics.uniqueVoices.length}</strong><small>{score.statistics.uniqueVoices.join(', ') || 'Not specified'}</small></div><div><span>Staves</span><strong>{score.statistics.staffCount}</strong><small>{score.parts[0]?.measures[0]?.clefs.map((clef) => `${clef.sign} clef`).join(' · ') || 'No clef data'}</small></div><div><span>Pitch range</span><strong>{score.statistics.pitchRange ? `${score.statistics.pitchRange.lowest.spelling}–${score.statistics.pitchRange.highest.spelling}` : '—'}</strong><small>{score.statistics.pianoRangeViolationCount ? `${score.statistics.pianoRangeViolationCount} outside piano range` : 'Within 88 keys'}</small></div><div><span>Notated span</span><strong>{formatMusicalTime(score.statistics.notatedDuration)}</strong><small>Quarter-note units</small></div></div></section>
        <section className="panel practice-prep">
          <div><span className="step-label">Phase 3 performance model</span><h2>Prepare this score for MIDI practice</h2><p>{score.parts.length > 1 ? 'Choose every part you intend to play. Staves within a part stay together.' : `The single ${score.parts[0]?.name ?? 'score'} part is ready to use.`}</p></div>
          {score.parts.length > 1 && <div className="part-selector" aria-label="Parts to practice">{score.parts.map((part) => <label key={part.id}><input type="checkbox" checked={selectedPartIds.includes(part.id)} onChange={(event) => setSelectedPartIds((current) => event.target.checked ? [...current, part.id] : current.filter((id) => id !== part.id))} /><span><strong>{part.name ?? part.id}</strong><small>{part.id} · {part.measures.length} measures</small></span></label>)}</div>}
          <div className="practice-prep-action">{practiceError && <span className="practice-build-error"><AlertCircle />{practiceError}</span>}<Button icon={saveState === 'saving' ? LoaderCircle : Play} disabled={stage !== 'ready' || selectedPartIds.length === 0 || saveState === 'saving' || persistence.status !== 'ready'} onClick={() => void beginPractice()}>{saveState === 'saving' ? 'Saving locally…' : 'Add to repertoire & practice'}</Button></div>
        </section>
        <section className="panel notation-panel"><div className="score-section-heading notation-heading"><div><span className="score-section-icon paper"><FileMusic /></span><div><h2>Sheet music preview</h2><p>Rendered from the same canonical XML used by the normalized model</p></div></div><div className="notation-controls"><button onClick={() => setZoom((value) => Math.max(0.5, Number((value - 0.08).toFixed(2))))} aria-label="Zoom out"><Minus /></button><span>{Math.round(zoom * 100)}%</span><button onClick={() => setZoom((value) => Math.min(1.5, Number((value + 0.08).toFixed(2))))} aria-label="Zoom in"><Plus /></button><button onClick={() => setZoom(0.82)} aria-label="Reset zoom"><Maximize2 /></button></div></div>{rendererError && <div className="renderer-inline-error"><AlertCircle /><span>{rendererError}</span></div>}<div className="notation-paper"><OsmdScoreRenderer musicXmlText={loaded.musicXmlText} zoom={zoom} onStateChange={handleRendererState} /></div><div className="notation-foot"><span><Info /> OSMD renders notation only; application-owned normalized events remain the score truth.</span><span><ChevronDown /> Scroll to inspect</span></div></section>
        <div className="score-lower-grid"><RelationshipPanel relationship={relationship} onChange={setRelationship} works={persistedWorks} existingWorkId={existingWorkId} sourceWorkId={sourceWorkId} onExistingWorkChange={setExistingWorkId} onSourceWorkChange={setSourceWorkId} arrangementName={arrangementName} onArrangementNameChange={setArrangementName} difficulty={difficulty} onDifficultyChange={setDifficulty} /><WarningList warnings={score.warnings} /></div>
      </div>}
    </div>
  )
}
