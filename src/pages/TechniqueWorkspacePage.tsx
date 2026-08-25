import { AlertTriangle, ChevronLeft, CircleStop, Play, RotateCcw, Save, Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Button, PageHeader, StatusPill } from '../components/ui'
import { alignPerformance } from '../features/alignment/alignPerformance'
import { ALIGNMENT_ENGINE_VERSION } from '../features/alignment/options'
import { MidiControls } from '../features/midi/MidiControls'
import { PianoKeyboard } from '../features/midi/PianoKeyboard'
import { useMidi } from '../features/midi/MidiContext'
import { gradeNotes } from '../features/note-grading/gradeNotes'
import { NOTE_GRADING_ENGINE_VERSION } from '../features/note-grading/options'
import { usePerformanceRecording } from '../features/performance/usePerformanceRecording'
import { usePersistence } from '../features/persistence/PersistenceContext'
import type { TechniqueAttemptRecordV2 } from '../features/persistence/types'
import { OsmdScoreRenderer } from '../features/score-renderer/OsmdScoreRenderer'
import { analyzeTiming } from '../features/timing-analysis/analyzeTiming'
import { TIMING_ANALYSIS_ENGINE_VERSION } from '../features/timing-analysis/options'
import { analyzeTechnique } from '../features/technique/analyzeTechnique'
import { TECHNIQUE_MODULES, TONIC_LABELS, derivedArpeggioEventCount, derivedScaleEventCount, isTechniqueModuleId } from '../features/technique/catalog'
import { createSightReadingSeed, defaultTechniqueForm, validateTechniqueConfiguration, type TechniqueFormState } from '../features/technique/configuration'
import { compileTechniqueExercise } from '../features/technique/exerciseCompiler'
import { TechniqueResultPanel } from '../features/technique/TechniqueResultPanel'
import { TECHNIQUE_ANALYSIS_ENGINE_VERSION, TECHNIQUE_EXERCISE_ENGINE_VERSION, type TechniqueAnalysisResultV2, type TechniqueModuleId } from '../features/technique/types'

export function TechniqueWorkspacePage() {
  const { moduleId } = useParams()
  if (!isTechniqueModuleId(moduleId)) return <div className="page"><PageHeader title="Technique module not found" description="Choose one of the eight measured modules." /><Link to="/technique">Back to Technique Lab</Link></div>
  return <TechniqueWorkspace moduleId={moduleId} />
}

function TechniqueWorkspace({ moduleId }: { moduleId: TechniqueModuleId }) {
  const module = TECHNIQUE_MODULES.find((item) => item.id === moduleId)!
  const [form, setForm] = useState<TechniqueFormState>(() => defaultTechniqueForm(moduleId))
  const configuration = useMemo(() => validateTechniqueConfiguration(moduleId, form), [form, moduleId])
  const compiled = useMemo(() => configuration.spec ? compileTechniqueExercise(configuration.spec) : null, [configuration.spec])
  const practiceContext = useMemo(() => ({ expectedPerformancePlanId: compiled?.expectedPerformancePlan.id ?? '', scoreId: compiled?.normalizedScore.id ?? '', includedPartIds: compiled ? ['P1'] : [], speedMultiplier: 1 }), [compiled])
  const recorder = usePerformanceRecording(practiceContext)
  const midi = useMidi()
  const persistence = usePersistence()
  const [result, setResult] = useState<TechniqueAnalysisResultV2 | null>(null)
  const [snapshots, setSnapshots] = useState<Pick<TechniqueAttemptRecordV2, 'alignment' | 'noteGrading' | 'timingAnalysis' | 'novelty'> | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const locked = recorder.state.status !== 'idle'
  const update = <K extends keyof TechniqueFormState>(key: K, value: TechniqueFormState[K]) => { if (!locked) setForm((current) => ({ ...current, [key]: value })) }
  const error = (key: keyof TechniqueFormState) => configuration.errors[key] ? <small className="field-error">{configuration.errors[key]}</small> : null

  const analyze = async () => {
    if (!compiled || !recorder.recording || !persistence.repository) return
    setMessage(null)
    try {
      const alignment = alignPerformance(compiled.expectedPerformancePlan, recorder.recording, { practiceSpeedMultiplier: 1 })
      const noteGrading = gradeNotes({ expectedPlan: compiled.expectedPerformancePlan, recording: recorder.recording, alignment, options: { gradingScope: 'full-plan' } })
      const timingAnalysis = analyzeTiming({ expectedPlan: compiled.expectedPerformancePlan, recording: recorder.recording, alignment, noteGrading })
      const count = await persistence.repository.countTechniqueAttemptsForInstance(compiled.snapshot.id)
      const novelty = { exerciseInstanceId: compiled.snapshot.id, priorSavedAttemptCount: count, firstSavedAttempt: count === 0 }
      const technique = analyzeTechnique({ exercise: compiled.snapshot, recording: recorder.recording, alignment, noteGrading, timingAnalysis, novelty })
      setSnapshots({ alignment, noteGrading, timingAnalysis, novelty })
      setResult(technique)
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'The take could not be analyzed.') }
  }

  const save = async () => {
    if (!compiled || !recorder.recording || !snapshots || !result || !persistence.repository) return
    setSaving(true); setMessage(null)
    const attempt: TechniqueAttemptRecordV2 = {
      schemaVersion: 2, id: `technique-attempt:${recorder.recording.id}`, moduleId, templateId: compiled.snapshot.spec.templateId, exerciseInstanceId: compiled.snapshot.id,
      performedAt: recorder.recording.startedAt, exercise: compiled.snapshot, expectedPerformancePlan: compiled.expectedPerformancePlan, recording: recorder.recording,
      alignment: snapshots.alignment, noteGrading: snapshots.noteGrading, timingAnalysis: snapshots.timingAnalysis, techniqueAnalysis: result, novelty: snapshots.novelty,
      engineVersions: { exercise: TECHNIQUE_EXERCISE_ENGINE_VERSION, parser: compiled.snapshot.parserVersion, alignment: ALIGNMENT_ENGINE_VERSION, noteGrading: NOTE_GRADING_ENGINE_VERSION, timingAnalysis: TIMING_ANALYSIS_ENGINE_VERSION, techniqueAnalysis: TECHNIQUE_ANALYSIS_ENGINE_VERSION },
    }
    try { const saved = await persistence.repository.saveTechniqueAttempt(attempt); setMessage(saved.created ? 'Technique take saved locally with its frozen evidence.' : 'This exact take was already saved.') }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : 'The Technique take could not be saved.') }
    finally { setSaving(false) }
  }

  const discard = () => { recorder.discard(); setResult(null); setSnapshots(null); setMessage(null) }
  const newSightReadingExercise = () => { if (!locked) setForm((current) => ({ ...current, seed: createSightReadingSeed() })) }
  const derivedEvents = configuration.spec && moduleId === 'scales' ? derivedScaleEventCount(configuration.spec.octaveSpan, configuration.spec.direction) : configuration.spec && moduleId === 'arpeggios' ? derivedArpeggioEventCount(configuration.spec.octaveSpan, configuration.spec.direction) : null

  return <div className="page technique-workspace">
    <PageHeader eyebrow="Technique workspace" title={module.name} description={module.description} action={<Link to="/technique" className="button ghost"><ChevronLeft size={15} /> All modules</Link>} />
    <section className="panel technique-config"><div className="section-heading"><div><span>Exercise definition</span><h2>Deterministic configuration</h2></div><StatusPill tone={locked ? 'warning' : configuration.spec ? 'neutral' : 'warning'}>{locked ? 'Locked for this take' : configuration.spec ? 'Ready to configure' : 'Check configuration'}</StatusPill></div><div className="technique-config-grid">
      {moduleId === 'sight-reading' && <label><span>Seed</span><input value={form.seed} disabled={locked} onChange={(event) => update('seed', event.target.value)} />{error('seed')}</label>}
      <label><span>{moduleId === 'scales' || moduleId === 'arpeggios' || moduleId === 'chord-fluency' || moduleId === 'sight-reading' ? 'Tonic' : 'Starting pitch'}</span><select value={form.tonic} disabled={locked} onChange={(event) => update('tonic', event.target.value)}>{TONIC_LABELS.map((label, index) => <option key={label} value={index}>{label}</option>)}</select>{error('tonic')}</label>
      {(moduleId === 'scales' || moduleId === 'arpeggios' || moduleId === 'chord-fluency' || moduleId === 'sight-reading') && <label><span>Mode</span><select value={form.mode} disabled={locked} onChange={(event) => update('mode', event.target.value as TechniqueFormState['mode'])}><option value="major">Major</option><option value="natural-minor">Natural minor</option></select></label>}
      <label><span>Declared hand context</span><select value={form.declaredHandContext} disabled={locked} onChange={(event) => update('declaredHandContext', event.target.value as TechniqueFormState['declaredHandContext'])}><option value="right">Right hand</option><option value="left">Left hand</option><option value="both">Both hands</option></select></label>
      <label><span>Target BPM</span><input type="number" min="30" max="240" value={form.targetTempoBpm} disabled={locked} onChange={(event) => update('targetTempoBpm', event.target.value)} />{error('targetTempoBpm')}</label>
      {moduleId !== 'scales' && moduleId !== 'arpeggios' && <label><span>Events</span><input type="number" min="4" max="64" value={form.eventCount} disabled={locked} onChange={(event) => update('eventCount', event.target.value)} />{error('eventCount')}</label>}
      {(moduleId === 'scales' || moduleId === 'arpeggios') && <label><span>Octave span</span><select value={form.octaveSpan} disabled={locked} onChange={(event) => update('octaveSpan', event.target.value)}><option value="1">One octave</option><option value="2">Two octaves</option></select>{error('octaveSpan')}</label>}
      <label><span>Subdivision</span><select value={form.subdivision} disabled={locked} onChange={(event) => update('subdivision', event.target.value)}><option value="1">Quarter notes</option><option value="2">Eighth notes</option><option value="4">Sixteenth notes</option></select>{error('subdivision')}</label>
      {(moduleId === 'scales' || moduleId === 'arpeggios') && <label><span>Direction</span><select value={form.direction} disabled={locked} onChange={(event) => update('direction', event.target.value as TechniqueFormState['direction'])}><option value="ascending">Ascending</option><option value="descending">Descending</option><option value="both">Up and down</option></select></label>}
      {moduleId === 'chord-fluency' && <label><span>Inversion</span><select value={form.chordInversion} disabled={locked} onChange={(event) => update('chordInversion', event.target.value)}><option value="0">Root position</option><option value="1">First inversion</option><option value="2">Second inversion</option></select>{error('chordInversion')}</label>}
      {moduleId === 'keyboard-jumps' && <label><span>Jump</span><select value={form.jumpSemitones} disabled={locked} onChange={(event) => update('jumpSemitones', event.target.value)}><option value="7">Fifth</option><option value="12">Octave</option><option value="19">Twelfth</option><option value="24">Two octaves</option></select>{error('jumpSemitones')}</label>}
      {moduleId === 'tempo-control' && <label><span>Tempo shape</span><select value={form.tempoShape} disabled={locked} onChange={(event) => update('tempoShape', event.target.value as TechniqueFormState['tempoShape'])}><option value="steady">Steady</option><option value="accelerate">Accelerate</option><option value="decelerate">Decelerate</option><option value="arch">Arch</option></select></label>}
    </div>
    {moduleId === 'sight-reading' && <Button variant="secondary" icon={Sparkles} disabled={locked} onClick={newSightReadingExercise}>New sight-reading exercise</Button>}
    {derivedEvents !== null && <p className="challenge-line">Exact pattern length: {derivedEvents} events. Scale and arpeggio length is derived from range and direction.</p>}
    {compiled ? <p className="challenge-line">Instance {compiled.snapshot.id} · {compiled.snapshot.challenge.pitchSpanSemitones} semitone span · max chord {compiled.snapshot.challenge.maximumChordSize} · expected {Math.round(compiled.snapshot.challenge.expectedDurationMs / 1000)}s</p> : <p className="inline-notice warning">Fix the configuration before generating or recording this exercise.</p>}</section>
    {compiled && <section className="panel notation-panel"><div className="notation-paper"><OsmdScoreRenderer musicXmlText={compiled.snapshot.generatedMusicXml} zoom={.78} /></div></section>}
    <div className="technique-midi-grid"><section className="panel"><MidiControls /></section><PianoKeyboard activeNotes={midi.activeNotes} sustainDown={midi.sustainDown} sustainObserved={midi.sustainObserved} /></div>
    <section className="panel technique-recorder"><div><span className="step-label">MIDI take</span><h2>{recorder.state.status === 'recording' ? `Recording · ${(recorder.elapsedMs / 1000).toFixed(1)}s` : recorder.recording ? `${recorder.recording.statistics.noteAttackCount} attacks captured` : 'Record the generated exercise'}</h2><p>Physical MIDI attacks are preserved losslessly. Declared hand is challenge metadata only; MIDI does not identify which hand played a note.</p></div><div className="recorder-actions">{recorder.state.status === 'idle' && <Button icon={Play} onClick={() => recorder.start()} disabled={!midi.selectedDevice || !compiled}>Start take</Button>}{recorder.state.status === 'recording' && <Button icon={CircleStop} onClick={() => recorder.stop()}>Stop</Button>}{recorder.recording && !result && <Button icon={Sparkles} onClick={() => void analyze()}>Analyze take</Button>}{recorder.recording && <Button variant="secondary" icon={RotateCcw} onClick={discard}>Discard</Button>}</div></section>
    {result && <TechniqueResultPanel result={result} />}
    {result && <section className="panel technique-save"><div><strong>Preserve this evidence snapshot</strong><p>Saving is atomic and includes the exact exercise, score plan, MIDI, correspondence, note, timing, novelty, and Technique results.</p></div><Button icon={Save} disabled={saving || persistence.status !== 'ready'} onClick={() => void save()}>{saving ? 'Saving…' : 'Save Technique take'}</Button></section>}
    {message && <div className="inline-notice"><AlertTriangle size={17} /><span>{message}</span></div>}
  </div>
}
