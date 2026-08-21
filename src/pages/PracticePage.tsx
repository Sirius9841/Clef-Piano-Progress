import { Activity, AlertCircle, ArrowLeft, Cable, CircleStop, Clock3, FileMusic, Gauge, Music2, Play, RotateCcw, Trash2 } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button, StatusPill } from '../components/ui'
import { repertoire } from '../data/mockData'
import { AlignmentPanel } from '../features/alignment/AlignmentPanel'
import { useAlignmentAnalysis } from '../features/alignment/useAlignmentAnalysis'
import { scoreTimeToMilliseconds } from '../features/expected-performance/tempoTimeline'
import { MidiControls } from '../features/midi/MidiControls'
import { useMidi } from '../features/midi/MidiContext'
import { PianoKeyboard } from '../features/midi/PianoKeyboard'
import { formatMusicalTime } from '../features/musicxml/musicalTime'
import { NoteGradingPanel } from '../features/note-grading/NoteGradingPanel'
import { useNoteGradingAnalysis } from '../features/note-grading/useNoteGradingAnalysis'
import type { GradingScopeType } from '../features/note-grading/types'
import { usePerformanceRecording } from '../features/performance/usePerformanceRecording'
import { PerformanceResultsPanel } from '../features/performance-results/PerformanceResultsPanel'
import type { ScoreHighlightModel } from '../features/performance-results/highlightModel'
import { usePerformanceResults } from '../features/performance-results/usePerformanceResults'
import { createDemoPracticeSession } from '../features/practice/demoPractice'
import { usePracticeSession } from '../features/practice/PracticeSessionContext'
import { OsmdScoreRenderer } from '../features/score-renderer/OsmdScoreRenderer'
import { TimingAnalysisPanel } from '../features/timing-analysis/TimingAnalysisPanel'
import { useTimingAnalysis } from '../features/timing-analysis/useTimingAnalysis'

const speeds = [0.5, 0.75, 1, 1.25]

function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1_000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function formatTimer(milliseconds: number): string {
  const minutes = Math.floor(milliseconds / 60_000)
  const seconds = Math.floor(milliseconds % 60_000 / 1_000)
  const tenths = Math.floor(milliseconds % 1_000 / 100)
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${tenths}`
}

export function PracticePage() {
  const { arrangementId } = useParams()
  const navigate = useNavigate()
  const practice = usePracticeSession()
  const midi = useMidi()
  const [zoom, setZoom] = useState(0.72)
  const [scoreHighlights, setScoreHighlights] = useState<ScoreHighlightModel | null>(null)
  const item = repertoire.find((candidate) => candidate.arrangement.id === arrangementId)
  const session = arrangementId === 'session' ? practice.session : null

  const recordingContext = useMemo(() => ({
    expectedPerformancePlanId: session?.plan.id,
    scoreId: session?.score.id,
    includedPartIds: session?.plan.includedPartIds,
    speedMultiplier: session?.speedMultiplier,
  }), [session])
  const capture = usePerformanceRecording(recordingContext)
  const alignmentSpeed = capture.recording?.practiceContext.speedMultiplier ?? session?.speedMultiplier ?? 1
  const alignment = useAlignmentAnalysis(session?.plan ?? null, capture.recording, alignmentSpeed)
  const alignmentResult = alignment.state.status === 'ready' || alignment.state.status === 'unavailable' ? alignment.state.result ?? null : null
  const noteGrading = useNoteGradingAnalysis(session?.plan ?? null, capture.recording, alignmentResult)
  const noteGradingResult = noteGrading.state.status === 'ready' || noteGrading.state.status === 'unavailable' ? noteGrading.state.result ?? null : null
  const timing = useTimingAnalysis(session?.plan ?? null, capture.recording, alignmentResult, noteGradingResult)
  const timingResult = timing.state.status === 'ready' || timing.state.status === 'unavailable' ? timing.state.result ?? null : null
  const performanceResults = usePerformanceResults(session?.score ?? null, session?.plan ?? null, alignmentResult, noteGradingResult, timingResult)

  const analyzeTiming = async (scope: GradingScopeType) => {
    const grading = noteGradingResult?.scope.type === scope ? noteGradingResult : await noteGrading.analyze(scope)
    if (grading) await timing.analyze(grading)
  }

  const analyzeResults = async (scope: GradingScopeType) => {
    const grading = noteGradingResult?.scope.type === scope ? noteGradingResult : await noteGrading.analyze(scope)
    if (!grading) return
    const nextTiming = timingResult?.noteGradingId === grading.id ? timingResult : await timing.analyze(grading)
    if (nextTiming) await performanceResults.analyze(grading, nextTiming)
  }
  const updateScoreHighlights = useCallback((model: ScoreHighlightModel | null) => setScoreHighlights(model), [])

  if (!session) {
    const title = item?.work.title ?? 'No practice score loaded'
    const subtitle = item ? item.arrangement.name : 'This in-memory session is empty or has expired.'
    const startDemo = () => {
      practice.startSession(createDemoPracticeSession())
      navigate('/practice/session')
    }
    return (
      <div className="page practice-page">
        <Link to={item ? `/repertoire/${item.arrangement.id}` : '/'} className="back-link"><ArrowLeft size={15} /> Back</Link>
        <div className="practice-header"><div><StatusPill tone="neutral"><Music2 size={12} /> Score required</StatusPill><h1>{title}</h1><p>{subtitle}</p></div></div>
        <section className="panel practice-no-score"><FileMusic /><span className="step-label">Honest practice state</span><h2>No playable score attached yet</h2><p>Import a MusicXML score to create an expected performance plan before capturing MIDI practice. Mock repertoire metadata is never substituted for sheet music.</p><div><Link className="button primary" to="/imports">Import MusicXML</Link><Button variant="secondary" icon={Play} onClick={startDemo}>Try demo practice</Button></div></section>
      </div>
    )
  }

  const plan = session.plan
  const referenceMs = scoreTimeToMilliseconds(plan.statistics.totalScoreDuration, plan.tempoTimeline)
  const practiceMs = scoreTimeToMilliseconds(plan.statistics.totalScoreDuration, plan.tempoTimeline, session.speedMultiplier)
  const activeEventCount = capture.state.status === 'recording' ? capture.state.eventCount : capture.recording?.statistics.eventCount ?? 0
  const activeAttackCount = capture.recording?.statistics.noteAttackCount ?? midi.activeNotes.length

  return (
    <div className={`page practice-page phase-three-practice phase-four-practice phase-five-practice phase-six-practice phase-seven-practice ${capture.state.status}`}>
      <Link to="/imports" className="back-link"><ArrowLeft size={15} /> Back to score import</Link>
      <header className="practice-header">
        <div><StatusPill tone={session.isDemo ? 'violet' : 'positive'}><FileMusic size={12} /> {session.isDemo ? 'Demo score' : 'Imported score'}</StatusPill><h1>{session.score.metadata.title ?? 'Untitled Score'}</h1><p>{session.score.metadata.composer ?? 'Unknown composer'} · {session.sourceLabel}</p></div>
        <div className="practice-speed"><span>Practice speed</span><div>{speeds.map((speed) => <button key={speed} className={session.speedMultiplier === speed ? 'active' : ''} disabled={capture.state.status === 'recording'} onClick={() => practice.setSpeedMultiplier(speed)}>{Math.round(speed * 100)}%</button>)}</div></div>
      </header>

      <div className="practice-workspace">
        <section className="panel notation-panel practice-notation">
          <div className="score-section-heading notation-heading"><div><span className="score-section-icon paper"><FileMusic /></span><div><h2>Sheet music</h2><p>{scoreHighlights ? 'Result focus uses application-owned score mapping' : 'Reference notation — result issues appear after analysis'}</p></div></div><div className="notation-controls"><button aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(0.5, value - 0.08))}>−</button><span>{Math.round(zoom * 100)}%</span><button aria-label="Zoom in" onClick={() => setZoom((value) => Math.min(1.2, value + 0.08))}>+</button></div></div>
          <div className="notation-paper"><OsmdScoreRenderer musicXmlText={session.source.musicXmlText} zoom={zoom} highlights={scoreHighlights} /></div>
        </section>

        <aside className="practice-sidebar">
          <section className={`panel recording-console ${capture.state.status}`}>
            <div className="recording-console-top"><div className="recording-orb"><span /></div><div><span className="step-label">Performance capture</span><h2>{capture.state.status === 'recording' ? 'Recording take' : capture.recording ? 'Take captured' : 'Ready'}</h2></div><StatusPill tone={capture.state.status === 'recording' ? 'warning' : capture.recording ? 'positive' : 'neutral'}>{capture.state.status}</StatusPill></div>
            <div className="recording-timer">{formatTimer(capture.elapsedMs)}</div>
            <div className="live-capture-stats"><div><Activity /><span>Events</span><strong>{activeEventCount}</strong></div><div><Music2 /><span>{capture.recording ? 'Attacks' : 'Keys down'}</span><strong>{activeAttackCount}</strong></div><div><Gauge /><span>Pedal</span><strong>{midi.sustainDown ? 'Down' : 'Up'}</strong></div></div>
            {!midi.selectedDevice && capture.state.status !== 'stopped' && <div className="recording-device-notice"><Cable /><span>Connect and select a MIDI input before recording.</span></div>}
            {capture.recording?.stopReason === 'device-disconnected' && <div className="recording-device-notice warning"><AlertCircle /><span>The MIDI input disconnected. This take was stopped safely.</span></div>}
            <div className="recording-actions">
              {capture.state.status === 'idle' && <Button icon={Activity} disabled={!midi.selectedDevice} onClick={capture.start}>Record take</Button>}
              {capture.state.status === 'recording' && <Button icon={CircleStop} onClick={capture.stop}>Stop recording</Button>}
              {capture.state.status === 'stopped' && <><Button icon={RotateCcw} disabled={!midi.selectedDevice} onClick={capture.start}>Record again</Button><Button variant="ghost" icon={Trash2} onClick={capture.discard}>Discard take</Button></>}
            </div>
          </section>
          <section className="panel practice-midi"><MidiControls compact /></section>
        </aside>
      </div>

      <PianoKeyboard activeNotes={midi.activeNotes} sustainDown={midi.sustainDown} />

      <div className="practice-summary-grid">
        <section className="panel expected-summary"><div className="section-heading"><div><h2><Music2 /> Expected score</h2><p>Plan data, not a performance grade</p></div></div><div className="summary-metrics"><div><span>Required attacks</span><strong>{plan.statistics.requiredAttackCount}</strong></div><div><span>Onset groups</span><strong>{plan.statistics.onsetGroupCount}</strong></div><div><span>Multi-note groups</span><strong>{plan.statistics.multiNoteGroupCount}</strong></div><div><span>Score span</span><strong>{formatMusicalTime(plan.statistics.totalScoreDuration)}</strong><small>quarter units</small></div></div><div className="timeline-preview"><Clock3 /><span>Reference at 100% <strong>{formatDuration(referenceMs)}</strong></span><span>At {Math.round(session.speedMultiplier * 100)}% <strong>{formatDuration(practiceMs)}</strong></span>{plan.tempoTimeline.usesFallback && <em>120 BPM fallback before authored tempo</em>}</div></section>
        <section className="panel take-summary"><div className="section-heading"><div><h2><Activity /> Captured take</h2><p>Objective MIDI diagnostics only</p></div></div>{capture.recording ? <><div className="summary-metrics"><div><span>MIDI events</span><strong>{capture.recording.statistics.eventCount}</strong></div><div><span>Note attacks</span><strong>{capture.recording.statistics.noteAttackCount}</strong></div><div><span>Unique pitches</span><strong>{capture.recording.statistics.uniquePitchCount}</strong></div><div><span>Open notes</span><strong>{capture.recording.statistics.openNoteCount}</strong></div></div><div className="take-foot"><span>{capture.recording.statistics.sustainChangeCount} pedal changes</span><span>{capture.recording.statistics.orphanReleaseCount} orphan releases</span><span>{formatDuration(capture.recording.durationMs)} duration</span></div></> : <div className="take-empty">Record a take to inspect event, pitch, velocity, pedal, and key-release statistics. No grading occurs in this view.</div>}</section>
      </div>
      {performanceResults.state.status === 'ready' ? <>
        <PerformanceResultsPanel analysis={performanceResults.state} scope={noteGrading.scope} onAnalyze={(scope) => void analyzeResults(scope)} onHighlightChange={updateScoreHighlights} />
        <details className="technical-analysis-stack"><summary>Technical analysis</summary><div>{capture.recording && <AlignmentPanel analysis={alignment.state} onAnalyze={() => void alignment.analyze()} />}{capture.recording && alignmentResult && <NoteGradingPanel analysis={noteGrading.state} scope={noteGrading.scope} onAnalyze={(scope) => void noteGrading.analyze(scope)} />}{capture.recording && alignmentResult && noteGradingResult && <TimingAnalysisPanel analysis={timing.state} scope={noteGrading.scope} noteGrading={noteGradingResult} onAnalyze={(scope) => void analyzeTiming(scope)} />}</div></details>
      </> : <>
        {capture.recording && <AlignmentPanel analysis={alignment.state} onAnalyze={() => void alignment.analyze()} />}
        {capture.recording && alignmentResult && <NoteGradingPanel analysis={noteGrading.state} scope={noteGrading.scope} onAnalyze={(scope) => void noteGrading.analyze(scope)} />}
        {capture.recording && alignmentResult && noteGradingResult && <TimingAnalysisPanel analysis={timing.state} scope={noteGrading.scope} noteGrading={noteGradingResult} onAnalyze={(scope) => void analyzeTiming(scope)} />}
        {capture.recording && alignmentResult && noteGradingResult && timingResult && <PerformanceResultsPanel analysis={performanceResults.state} scope={noteGrading.scope} onAnalyze={(scope) => void analyzeResults(scope)} onHighlightChange={updateScoreHighlights} />}
      </>}
    </div>
  )
}
