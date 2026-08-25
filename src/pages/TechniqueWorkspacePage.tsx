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
import type { TechniqueAttemptRecord } from '../features/persistence/types'
import { OsmdScoreRenderer } from '../features/score-renderer/OsmdScoreRenderer'
import { analyzeTiming } from '../features/timing-analysis/analyzeTiming'
import { TIMING_ANALYSIS_ENGINE_VERSION } from '../features/timing-analysis/options'
import { analyzeTechnique } from '../features/technique/analyzeTechnique'
import { defaultTechniqueSpec, isTechniqueModuleId, TECHNIQUE_MODULES } from '../features/technique/catalog'
import { compileTechniqueExercise } from '../features/technique/exerciseCompiler'
import { TechniqueResultPanel } from '../features/technique/TechniqueResultPanel'
import { TECHNIQUE_ANALYSIS_ENGINE_VERSION, TECHNIQUE_EXERCISE_ENGINE_VERSION, type TechniqueAnalysisResult, type TechniqueExerciseSpec } from '../features/technique/types'

export function TechniqueWorkspacePage() {
  const { moduleId } = useParams()
  if (!isTechniqueModuleId(moduleId)) return <div className="page"><PageHeader title="Technique module not found" description="Choose one of the eight measured modules." /><Link to="/technique">Back to Technique Lab</Link></div>
  return <TechniqueWorkspace moduleId={moduleId} />
}

function TechniqueWorkspace({ moduleId }: { moduleId: TechniqueExerciseSpec['moduleId'] }) {
  const module = TECHNIQUE_MODULES.find((item) => item.id === moduleId)!
  const [spec, setSpec] = useState(() => defaultTechniqueSpec(moduleId))
  const compiled = useMemo(() => compileTechniqueExercise(spec), [spec])
  const practiceContext = useMemo(() => ({ expectedPerformancePlanId: compiled.expectedPerformancePlan.id, scoreId: compiled.normalizedScore.id, includedPartIds: ['P1'], speedMultiplier: 1 }), [compiled])
  const recorder = usePerformanceRecording(practiceContext)
  const midi = useMidi()
  const persistence = usePersistence()
  const [result, setResult] = useState<TechniqueAnalysisResult | null>(null)
  const [snapshots, setSnapshots] = useState<Pick<TechniqueAttemptRecord, 'alignment' | 'noteGrading' | 'timingAnalysis' | 'novelty'> | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const locked = recorder.state.status !== 'idle'
  const update = <K extends keyof TechniqueExerciseSpec>(key: K, value: TechniqueExerciseSpec[K]) => { if (!locked) setSpec((current) => ({ ...current, [key]: value })) }

  const analyze = async () => {
    if (!recorder.recording || !persistence.repository) return
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
    if (!recorder.recording || !snapshots || !result || !persistence.repository) return
    setSaving(true); setMessage(null)
    const attempt: TechniqueAttemptRecord = {
      schemaVersion: 1, id: `technique-attempt:${recorder.recording.id}`, moduleId, templateId: spec.templateId, exerciseInstanceId: compiled.snapshot.id,
      performedAt: recorder.recording.startedAt, exercise: compiled.snapshot, expectedPerformancePlan: compiled.expectedPerformancePlan, recording: recorder.recording,
      alignment: snapshots.alignment, noteGrading: snapshots.noteGrading, timingAnalysis: snapshots.timingAnalysis, techniqueAnalysis: result, novelty: snapshots.novelty,
      engineVersions: { exercise: TECHNIQUE_EXERCISE_ENGINE_VERSION, parser: compiled.snapshot.parserVersion, alignment: ALIGNMENT_ENGINE_VERSION, noteGrading: NOTE_GRADING_ENGINE_VERSION, timingAnalysis: TIMING_ANALYSIS_ENGINE_VERSION, techniqueAnalysis: TECHNIQUE_ANALYSIS_ENGINE_VERSION },
    }
    try { const saved = await persistence.repository.saveTechniqueAttempt(attempt); setMessage(saved.created ? 'Technique take saved locally with its frozen evidence.' : 'This exact take was already saved.') }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : 'The Technique take could not be saved.') }
    finally { setSaving(false) }
  }

  const newTake = () => { recorder.discard(); setResult(null); setSnapshots(null); setMessage(null) }
  return <div className="page technique-workspace">
    <PageHeader eyebrow="Technique workspace" title={module.name} description={module.description} action={<Link to="/technique" className="button ghost"><ChevronLeft size={15} /> All modules</Link>} />
    <section className="panel technique-config"><div className="section-heading"><div><span>Exercise definition</span><h2>Deterministic configuration</h2></div><StatusPill tone={locked ? 'warning' : 'neutral'}>{locked ? 'Locked for this take' : 'Ready to configure'}</StatusPill></div><div className="technique-config-grid">
      <label><span>Seed</span><input value={spec.seed} disabled={locked} onChange={(event) => update('seed', event.target.value)} /></label>
      <label><span>Target BPM</span><input type="number" min="30" max="240" value={spec.targetTempoBpm} disabled={locked} onChange={(event) => update('targetTempoBpm', Number(event.target.value))} /></label>
      <label><span>Events</span><input type="number" min="4" max="64" value={spec.eventCount} disabled={locked} onChange={(event) => update('eventCount', Number(event.target.value))} /></label>
      <label><span>Subdivision</span><select value={spec.subdivision} disabled={locked} onChange={(event) => update('subdivision', Number(event.target.value) as 1 | 2 | 4)}><option value="1">Quarter notes</option><option value="2">Eighth notes</option><option value="4">Sixteenth notes</option></select></label>
      {(moduleId === 'scales' || moduleId === 'arpeggios') && <label><span>Direction</span><select value={spec.direction} disabled={locked} onChange={(event) => update('direction', event.target.value as TechniqueExerciseSpec['direction'])}><option value="ascending">Ascending</option><option value="descending">Descending</option><option value="both">Both</option></select></label>}
      {moduleId === 'keyboard-jumps' && <label><span>Jump</span><select value={spec.jumpSemitones} disabled={locked} onChange={(event) => update('jumpSemitones', Number(event.target.value) as TechniqueExerciseSpec['jumpSemitones'])}><option value="7">Fifth</option><option value="12">Octave</option><option value="19">Twelfth</option><option value="24">Two octaves</option></select></label>}
      {moduleId === 'tempo-control' && <label><span>Tempo shape</span><select value={spec.tempoShape} disabled={locked} onChange={(event) => update('tempoShape', event.target.value as TechniqueExerciseSpec['tempoShape'])}><option value="steady">Steady</option><option value="accelerate">Accelerate</option><option value="decelerate">Decelerate</option><option value="arch">Arch</option></select></label>}
    </div><p className="challenge-line">Instance {compiled.snapshot.id} · {compiled.snapshot.challenge.pitchSpanSemitones} semitone span · max chord {compiled.snapshot.challenge.maximumChordSize} · expected {Math.round(compiled.snapshot.challenge.expectedDurationMs / 1000)}s</p></section>
    <section className="panel notation-panel"><OsmdScoreRenderer musicXmlText={compiled.snapshot.generatedMusicXml} zoom={.78} /></section>
    <div className="technique-midi-grid"><section className="panel"><MidiControls /></section><PianoKeyboard activeNotes={midi.activeNotes} sustainDown={midi.sustainDown} sustainObserved={midi.sustainObserved} /></div>
    <section className="panel technique-recorder"><div><span className="step-label">MIDI take</span><h2>{recorder.state.status === 'recording' ? `Recording · ${(recorder.elapsedMs / 1000).toFixed(1)}s` : recorder.recording ? `${recorder.recording.statistics.noteAttackCount} attacks captured` : 'Record the generated exercise'}</h2><p>Physical MIDI attacks are preserved losslessly. Pedal and velocity are recorded but do not create Technique facet claims in Phase 12.</p></div><div className="recorder-actions">{recorder.state.status === 'idle' && <Button icon={Play} onClick={() => recorder.start()} disabled={!midi.selectedDevice}>Start take</Button>}{recorder.state.status === 'recording' && <Button icon={CircleStop} onClick={() => recorder.stop()}>Stop</Button>}{recorder.recording && !result && <Button icon={Sparkles} onClick={() => void analyze()}>Analyze take</Button>}{recorder.recording && <Button variant="secondary" icon={RotateCcw} onClick={newTake}>Discard</Button>}</div></section>
    {result && <TechniqueResultPanel result={result} />}
    {result && <section className="panel technique-save"><div><strong>Preserve this evidence snapshot</strong><p>Saving is atomic and includes the exact exercise, score plan, MIDI, correspondence, note, timing, novelty, and Technique results.</p></div><Button icon={Save} disabled={saving || persistence.status !== 'ready'} onClick={() => void save()}>{saving ? 'Saving…' : 'Save Technique take'}</Button></section>}
    {message && <div className="inline-notice"><AlertTriangle size={17} /><span>{message}</span></div>}
  </div>
}
