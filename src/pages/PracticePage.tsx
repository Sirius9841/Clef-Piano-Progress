import { Activity, AlertCircle, ArrowLeft, Cable, CheckCircle2, CircleStop, Clock3, FileMusic, Gauge, Maximize2, Minimize2, Music2, Play, RotateCcw, Save, Sparkles, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button, StatusPill } from '../components/ui'
import { AlignmentPanel } from '../features/alignment/AlignmentPanel'
import type { ScoreRegionCandidate, ScoreRegionLocalizationHint } from '../features/alignment/types'
import { scoreTimeToMilliseconds } from '../features/expected-performance/tempoTimeline'
import { ExpressionAnalysisPanel } from '../features/expression-analysis/ExpressionAnalysisPanel'
import { MidiControls } from '../features/midi/MidiControls'
import { useMidi } from '../features/midi/MidiContext'
import { PianoKeyboard } from '../features/midi/PianoKeyboard'
import { formatMusicalTime, ZERO_TIME } from '../features/musicxml/musicalTime'
import { NoteGradingPanel } from '../features/note-grading/NoteGradingPanel'
import type { GradingScopeType } from '../features/note-grading/types'
import { usePerformanceRecording } from '../features/performance/usePerformanceRecording'
import { PedalAnalysisPanel } from '../features/pedal-analysis/PedalAnalysisPanel'
import { PerformanceResultsPanel } from '../features/performance-results/PerformanceResultsPanel'
import { TakeReview } from '../features/performance-results/TakeReview'
import { TakeAnalysisStatus } from '../features/performance-results/TakeAnalysisStatus'
import type { ScoreHighlightModel } from '../features/performance-results/highlightModel'
import { useInterpretationAnalysisPipeline } from '../features/performance-results/useInterpretationAnalysisPipeline'
import { useTakeAnalysisPipeline } from '../features/performance-results/useTakeAnalysisPipeline'
import { createDemoPracticeSession } from '../features/practice/demoPractice'
import { usePracticeSession } from '../features/practice/PracticeSessionContext'
import { practiceIntentLabel } from '../features/practice/practicePresentation'
import { capturedTakeSpeed, isPracticeSpeedLocked, resolvePracticeSpeedChange } from '../features/practice/speedPolicy'
import { clearCurrentTake, takeClearActionCopy } from '../features/practice/takeWorkspace'
import { usePersistence } from '../features/persistence/PersistenceContext'
import { useRepositoryQuery } from '../features/persistence/PersistenceContext'
import { setInterpretationReferenceSafely, setVoicingIntentSafely } from '../features/persistence/mutations'
import type { AttemptSummary, PerformanceAttemptRecordV4, PersistedArrangement, PracticeSessionRecord } from '../features/persistence/types'
import { detectPersonalBestEvents, formatPercent, type PersonalBestEvent } from '../features/progress/model'
import { OsmdScoreRenderer } from '../features/score-renderer/OsmdScoreRenderer'
import { TimingAnalysisPanel } from '../features/timing-analysis/TimingAnalysisPanel'
import { VoicingAnalysisPanel } from '../features/voicing-analysis/VoicingAnalysisPanel'
import type { VoiceLane, VoicingIntentProfile } from '../features/voicing-analysis/types'
import { buildVoiceLanes } from '../features/voicing-analysis/voiceLanes'
import { buildInterpretationProfile } from '../features/reference-comparison/interpretationProfile'
import { ReferenceComparisonPanel } from '../features/reference-comparison/ReferenceComparisonPanel'
import type { InterpretationProfile } from '../features/reference-comparison/types'
import { useReferenceComparison } from '../features/reference-comparison/useReferenceComparison'

const speeds = [0.5, 0.75, 1, 1.25]

interface Phase11PreferenceData {
  readonly arrangement: PersistedArrangement | null
  readonly candidates: readonly AttemptSummary[]
  readonly referenceProfile: InterpretationProfile | null
}

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
  const persistence = usePersistence()
  const midi = useMidi()
  const [zoom, setZoom] = useState(0.72)
  const [scoreHighlights, setScoreHighlights] = useState<ScoreHighlightModel | null>(null)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [personalBestEvents, setPersonalBestEvents] = useState<readonly PersonalBestEvent[]>([])
  const [focusMode, setFocusMode] = useState(false)
  const practiceSessionId = useRef(`session:${globalThis.crypto.randomUUID()}`)
  const practiceSessionStartedAt = useRef<string | null>(null)
  const referenceAutoStartedKey = useRef<string | null>(null)
  const [savedRecordingId, setSavedRecordingId] = useState<string | null>(null)
  const [startModeOverride, setStartModeOverride] = useState<'beginning' | 'section' | 'auto' | null>(null)
  const [confirmedRegionHint, setConfirmedRegionHint] = useState<Extract<ScoreRegionLocalizationHint, { mode: 'confirmed' }> | null>(null)
  const [forensicOpen, setForensicOpen] = useState(false)

  useEffect(() => {
    document.body.classList.toggle('practice-focus', focusMode)
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target
      if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) return
      if (event.key === 'Escape' && focusMode) setFocusMode(false)
      if ((event.key === 'f' || event.key === 'F') && !event.ctrlKey && !event.metaKey && !event.altKey) setFocusMode((current) => !current)
    }
    window.addEventListener('keydown', handleKey)
    return () => { window.removeEventListener('keydown', handleKey); document.body.classList.remove('practice-focus') }
  }, [focusMode])
  const session = arrangementId === 'session' ? practice.session : null
  const preferenceState = useRepositoryQuery<Phase11PreferenceData>(async (repository) => {
    if (!session?.arrangementId || !session.scoreVersionId) return { arrangement: null, candidates: [], referenceProfile: null }
    const [arrangement, summaries] = await Promise.all([repository.getArrangement(session.arrangementId), repository.listAttemptSummaries(session.arrangementId)])
    const candidates = summaries.filter((summary) => summary.scoreVersionId === session.scoreVersionId)
    const referenceId = arrangement?.analysisPreferences?.referenceByScoreVersion[session.scoreVersionId] ?? null
    const referenceAttempt = referenceId ? await repository.getAttempt(referenceId) : null
    const intent = arrangement?.analysisPreferences?.voicingByScoreVersion[session.scoreVersionId] ?? null
    const referenceProfile = referenceAttempt ? (await import('../features/reference-comparison/prepareReferenceInterpretationProfile')).prepareReferenceInterpretationProfile(referenceAttempt, session.score, intent).profile : null
    return { arrangement, candidates, referenceProfile }
  }, `phase11:${session?.arrangementId ?? 'none'}:${session?.scoreVersionId ?? 'none'}`)
  const phase11Data = preferenceState.status === 'ready' ? preferenceState.data : null
  const intentProfile = session?.scoreVersionId ? phase11Data?.arrangement?.analysisPreferences?.voicingByScoreVersion[session.scoreVersionId] ?? null : null
  const selectedReferenceId = session?.scoreVersionId ? phase11Data?.arrangement?.analysisPreferences?.referenceByScoreVersion[session.scoreVersionId] ?? null : null
  const detectedLanes = useMemo<readonly VoiceLane[]>(() => session ? buildVoiceLanes(session.score, session.plan.includedPartIds) : [], [session])

  const recordingContext = useMemo(() => ({
    expectedPerformancePlanId: session?.plan.id,
    scoreId: session?.score.id,
    includedPartIds: session?.plan.includedPartIds,
    speedMultiplier: session?.speedMultiplier,
  }), [session])
  const capture = usePerformanceRecording(recordingContext)
  const alignmentSpeed = capture.recording?.practiceContext.speedMultiplier ?? session?.speedMultiplier ?? 1
  const planningSection = session?.presentationIntent?.type === 'section' ? session.presentationIntent.section : null
  const startMode = startModeOverride ?? (planningSection ? 'section' : 'beginning')
  const intendedStartHint = useMemo<ScoreRegionLocalizationHint>(() => startMode === 'section' && planningSection
    ? { mode: 'section', scoreVersionId: planningSection.scoreVersionId, startMeasureIndex: planningSection.startMeasureIndex, endMeasureIndex: planningSection.endMeasureIndex, sourceMeasureIds: planningSection.sourceMeasureIds }
    : { mode: startMode === 'section' ? 'beginning' : startMode }, [planningSection, startMode])
  const localizationHint = confirmedRegionHint ?? intendedStartHint
  const takeAnalysis = useTakeAnalysisPipeline(session?.score ?? null, session?.plan ?? null, capture.recording, alignmentSpeed, localizationHint)
  const { alignment, noteGrading, timing, performanceResults } = takeAnalysis
  const alignmentResult = takeAnalysis.state.status === 'ready' || takeAnalysis.state.status === 'needs-confirmation' || takeAnalysis.state.status === 'unavailable' ? takeAnalysis.state.alignment : null
  const noteGradingResult = takeAnalysis.state.status === 'ready' ? takeAnalysis.state.noteGrading : null
  const timingResult = takeAnalysis.state.status === 'ready' ? takeAnalysis.state.timing : null
  const coreResults = takeAnalysis.state.status === 'ready' ? takeAnalysis.state.results : null
  const interpretation = useInterpretationAnalysisPipeline(session?.score ?? null, session?.scoreVersionId ?? (session ? 'demo' : null), session?.plan ?? null, capture.recording, alignmentResult, noteGradingResult, intentProfile)
  const { expression, pedal, voicing } = interpretation
  const expressionResult = expression.state.status === 'ready' ? expression.state.result : null
  const pedalResult = pedal.state.status === 'ready' ? pedal.state.result : null
  const voicingResult = voicing.state.status === 'ready' ? voicing.state.result : null
  const currentProfile = useMemo(() => session?.arrangementId && session.scoreVersionId && capture.recording && timingResult && expressionResult && pedalResult && voicingResult ? buildInterpretationProfile({
    attemptId: `attempt:${capture.recording.id}`, arrangementId: session.arrangementId, scoreVersionId: session.scoreVersionId, includedPartIds: session.plan.includedPartIds, performedAt: capture.recording.startedAt, practiceSpeed: capture.recording.practiceContext.speedMultiplier ?? session.speedMultiplier, schemaVersion: 4, recordingId: capture.recording.id,
    fullPlanStart: ZERO_TIME, fullPlanEnd: session.plan.statistics.totalScoreDuration,
    expectedGroupPositions: session.plan.onsetGroups.map((group) => ({ id: group.id, position: group.position })), timingAnalysis: timingResult, expressionAnalysis: expressionResult, pedalAnalysis: pedalResult, voicingAnalysis: voicingResult,
    engineVersions: { alignment: alignmentResult?.diagnostics.alignmentEngineVersion ?? '', noteGrading: noteGradingResult?.diagnostics.noteGradingEngineVersion ?? '', timingAnalysis: timingResult.diagnostics.timingAnalysisEngineVersion, expressionAnalysis: expressionResult.diagnostics.expressionAnalysisEngineVersion, pedalAnalysis: pedalResult.diagnostics.pedalAnalysisEngineVersion, voicingAnalysis: voicingResult.diagnostics.voicingAnalysisEngineVersion },
  }) : null, [alignmentResult, capture.recording, expressionResult, noteGradingResult, pedalResult, session, timingResult, voicingResult])
  const referenceProfile = phase11Data?.referenceProfile ?? null
  const referenceComparison = useReferenceComparison(currentProfile, referenceProfile, voicingResult?.id ?? null)
  const analyzeReferenceComparison = referenceComparison.analyze
  const interpretationSnapshotsReady = expression.state.status === 'ready' && pedal.state.status === 'ready' && voicing.state.status === 'ready'
  const attemptSnapshotsReady = interpretationSnapshotsReady && referenceComparison.state.status === 'ready'

  useEffect(() => {
    if (!currentProfile || !voicingResult) return
    const key = JSON.stringify([currentProfile.attemptId, currentProfile.recordingId, referenceProfile?.attemptId ?? null, voicingResult.id])
    if (referenceAutoStartedKey.current === key) return
    referenceAutoStartedKey.current = key
    void analyzeReferenceComparison(currentProfile, referenceProfile, voicingResult.id)
    return () => {
      if (referenceAutoStartedKey.current === key) referenceAutoStartedKey.current = null
    }
  }, [analyzeReferenceComparison, currentProfile, referenceProfile, voicingResult])

  const analyzeTiming = async (scope: GradingScopeType) => {
    const grading = noteGradingResult?.scope.type === scope ? noteGradingResult : await noteGrading.analyze(scope)
    if (grading) await timing.analyze(grading)
  }

  const analyzeResults = async (scope: GradingScopeType) => {
    const grading = noteGradingResult?.scope.type === scope ? noteGradingResult : await noteGrading.analyze(scope)
    if (!grading) return
    const nextTiming = timingResult?.noteGradingId === grading.id ? timingResult : await timing.analyze(grading)
    if (!nextTiming) return
    const [, nextExpression] = await Promise.all([performanceResults.analyze(grading, nextTiming), expression.analyze(grading)])
    if (!nextExpression) return
    const nextPedal = await pedal.analyze(nextExpression, grading)
    if (!nextPedal || !session?.arrangementId || !session.scoreVersionId || !capture.recording) return
    const nextVoicing = await voicing.analyze(nextExpression, grading, intentProfile)
    if (!nextVoicing) return
    const nextCurrentProfile = buildInterpretationProfile({ attemptId: `attempt:${capture.recording.id}`, arrangementId: session.arrangementId, scoreVersionId: session.scoreVersionId, includedPartIds: session.plan.includedPartIds, performedAt: capture.recording.startedAt, practiceSpeed: capture.recording.practiceContext.speedMultiplier ?? session.speedMultiplier, schemaVersion: 4, recordingId: capture.recording.id, fullPlanStart: ZERO_TIME, fullPlanEnd: session.plan.statistics.totalScoreDuration, expectedGroupPositions: session.plan.onsetGroups.map((group) => ({ id: group.id, position: group.position })), timingAnalysis: nextTiming, expressionAnalysis: nextExpression, pedalAnalysis: nextPedal, voicingAnalysis: nextVoicing, engineVersions: { alignment: alignmentResult?.diagnostics.alignmentEngineVersion ?? '', noteGrading: grading.diagnostics.noteGradingEngineVersion, timingAnalysis: nextTiming.diagnostics.timingAnalysisEngineVersion, expressionAnalysis: nextExpression.diagnostics.expressionAnalysisEngineVersion, pedalAnalysis: nextPedal.diagnostics.pedalAnalysisEngineVersion, voicingAnalysis: nextVoicing.diagnostics.voicingAnalysisEngineVersion } })
    const nextReferenceProfile = phase11Data?.referenceProfile ?? null
    await referenceComparison.analyze(nextCurrentProfile, nextReferenceProfile, nextVoicing.id)
  }
  const updateScoreHighlights = useCallback((model: ScoreHighlightModel | null) => setScoreHighlights(model), [])
  const startCapture = () => {
    setSaveStatus('idle')
    setSaveMessage(null)
    setPersonalBestEvents([])
    setSavedRecordingId(null)
    setConfirmedRegionHint(null)
    setForensicOpen(false)
    setScoreHighlights(null)
    capture.start()
  }

  const confirmRegion = (candidate: ScoreRegionCandidate) => {
    setConfirmedRegionHint({ mode: 'confirmed', expectedStartIndex: candidate.expectedStartIndex, expectedEndIndex: candidate.expectedEndIndex })
  }

  const clearTake = () => {
    clearCurrentTake(capture.discard)
    setScoreHighlights(null)
    setSaveStatus('idle')
    setSaveMessage(null)
    setPersonalBestEvents([])
    setSavedRecordingId(null)
    setConfirmedRegionHint(null)
    setForensicOpen(false)
  }

  const saveVoicingProfile = async (profile: VoicingIntentProfile | null) => {
    if (!session?.arrangementId || !session.scoreVersionId || !persistence.repository) throw new Error('A persisted ScoreVersion is required.')
    const result = await setVoicingIntentSafely(persistence.repository, session.arrangementId, session.scoreVersionId, profile, detectedLanes)
    if (!result.ok) throw result.error
    if (expressionResult && noteGradingResult) await voicing.analyze(expressionResult, noteGradingResult, profile)
  }

  const selectReference = async (attemptId: string | null) => {
    if (!session?.arrangementId || !session.scoreVersionId || !persistence.repository) return
    const result = await setInterpretationReferenceSafely(persistence.repository, session.arrangementId, session.scoreVersionId, attemptId)
    if (!result.ok) { setSaveMessage(result.error.message); setSaveStatus('error'); return }
    setSaveMessage(attemptId ? 'Using this take as interpretation reference.' : 'Interpretation reference cleared.')
    setSaveStatus('idle')
    if (currentProfile && voicingResult) {
      const attempt = attemptId ? await persistence.repository.getAttempt(attemptId) : null
      const referenceProfile = attempt ? (await import('../features/reference-comparison/prepareReferenceInterpretationProfile')).prepareReferenceInterpretationProfile(attempt, session.score, intentProfile).profile : null
      await referenceComparison.analyze(currentProfile, referenceProfile, voicingResult.id)
    }
  }

  const saveAttempt = async () => {
    if (!session?.arrangementId || !session.scoreVersionId || !capture.recording || !alignmentResult?.localization?.takeRegion || !noteGradingResult || !timingResult || !coreResults || expression.state.status !== 'ready' || pedal.state.status !== 'ready' || voicing.state.status !== 'ready' || referenceComparison.state.status !== 'ready' || !persistence.repository) return
    setSaveStatus('saving'); setSaveMessage(null); setPersonalBestEvents([])
    const recording = capture.recording
    const result = coreResults
    const attemptId = `attempt:${recording.id}`
    const startedAt = practiceSessionStartedAt.current ?? recording.startedAt
    practiceSessionStartedAt.current = startedAt
    const endedAt = new Date(new Date(recording.startedAt).getTime() + recording.durationMs).toISOString()
    const attempt: PerformanceAttemptRecordV4 = {
      id: attemptId,
      schemaVersion: 4,
      arrangementId: session.arrangementId,
      scoreVersionId: session.scoreVersionId,
      practiceSessionId: practiceSessionId.current,
      performedAt: recording.startedAt,
      practiceSpeedMultiplier: recording.practiceContext.speedMultiplier ?? session.speedMultiplier,
      gradingScope: noteGradingResult.scope.type,
      includedPartIds: session.plan.includedPartIds,
      engineVersions: {
        alignment: alignmentResult.diagnostics.alignmentEngineVersion,
        noteGrading: noteGradingResult.diagnostics.noteGradingEngineVersion,
        timingAnalysis: timingResult.diagnostics.timingAnalysisEngineVersion,
        resultAggregation: result.diagnostics.resultAggregationVersion,
        expressionAnalysis: expression.state.result.diagnostics.expressionAnalysisEngineVersion,
        pedalAnalysis: pedal.state.result.diagnostics.pedalAnalysisEngineVersion,
        voicingAnalysis: voicing.state.result.diagnostics.voicingAnalysisEngineVersion,
        referenceComparison: referenceComparison.state.result.diagnostics.referenceComparisonEngineVersion,
      },
      expectedPerformancePlan: session.plan,
      recording,
      alignment: alignmentResult,
      noteGrading: noteGradingResult,
      timingAnalysis: timingResult,
      performanceResults: result,
      expressionAnalysis: expression.state.result,
      pedalAnalysis: pedal.state.result,
      voicingAnalysis: voicing.state.result,
      referenceComparison: referenceComparison.state.result,
    }
    const persistentSession: PracticeSessionRecord = {
      id: practiceSessionId.current,
      arrangementId: session.arrangementId,
      scoreVersionId: session.scoreVersionId,
      startedAt,
      endedAt,
      durationMs: Math.max(0, new Date(endedAt).getTime() - new Date(startedAt).getTime()),
      attemptIds: [attemptId],
    }
    try {
      const history = await persistence.repository.listAttemptSummaries(session.arrangementId)
      const saved = await persistence.repository.saveAttempt({ session: persistentSession, attempt })
      const events = saved.created ? detectPersonalBestEvents(saved.summary, history) : []
      setSavedRecordingId(recording.id)
      setPersonalBestEvents(events)
      setSaveMessage(saved.created ? 'Attempt and analysis snapshots saved locally.' : 'This take was already saved; no duplicate was created.')
      setSaveStatus('saved')
    } catch (cause) {
      setSaveMessage(cause instanceof Error ? cause.message : 'The attempt could not be saved. Retry is safe.')
      setSaveStatus('error')
    }
  }

  if (!session) {
    const title = 'No practice score loaded'
    const subtitle = 'Open a saved Arrangement or import a score to begin a precise practice session.'
    const startDemo = () => {
      practice.startSession(createDemoPracticeSession())
      navigate('/practice/session')
    }
    return (
      <div className="page practice-page">
        <Link to="/repertoire" className="back-link"><ArrowLeft size={15} /> Back</Link>
        <div className="practice-header"><div><StatusPill tone="neutral"><Music2 size={12} /> Score required</StatusPill><h1>{title}</h1><p>{subtitle}</p></div></div>
        <section className="panel practice-no-score"><FileMusic /><span className="step-label">Honest practice state</span><h2>No playable score attached yet</h2><p>Import a MusicXML score to create an expected performance plan before capturing MIDI practice. Mock repertoire metadata is never substituted for sheet music.</p><div><Link className="button primary" to="/imports">Import MusicXML</Link><Button variant="secondary" icon={Play} onClick={startDemo}>Try demo practice</Button></div></section>
      </div>
    )
  }

  const plan = session.plan
  const speedLocked = isPracticeSpeedLocked(capture.state.status)
  const displayedSpeed = capturedTakeSpeed(capture.recording, session.speedMultiplier)
  const referenceMs = scoreTimeToMilliseconds(plan.statistics.totalScoreDuration, plan.tempoTimeline)
  const practiceMs = scoreTimeToMilliseconds(plan.statistics.totalScoreDuration, plan.tempoTimeline, displayedSpeed)
  const activeEventCount = capture.state.status === 'recording' ? capture.state.eventCount : capture.recording?.statistics.eventCount ?? 0
  const activeAttackCount = capture.recording?.statistics.noteAttackCount ?? midi.activeNotes.length
  const clearActionCopy = takeClearActionCopy(capture.recording?.id ?? null, savedRecordingId)
  const maxMeasureIndex = Math.max(0, ...session.score.parts.flatMap((part) => part.measures.map((measure) => measure.index)))
  const referenceCandidates = (phase11Data?.candidates ?? []).filter((candidate) => candidate.id !== `attempt:${capture.recording?.id ?? ''}`)

  return (
    <div className={`page practice-page phase-three-practice phase-four-practice phase-five-practice phase-six-practice phase-seven-practice ${capture.state.status} ${focusMode ? 'focus-mode' : ''}`}>
      <Link to="/imports" className="back-link"><ArrowLeft size={15} /> Back to score import</Link>
      <header className="practice-header">
        <div><StatusPill tone={session.isDemo ? 'violet' : 'positive'}><FileMusic size={12} /> {session.isDemo ? 'Demo score' : 'Imported score'}</StatusPill><h1>{session.score.metadata.title ?? 'Untitled Score'}</h1><p>{session.score.metadata.composer ?? 'Unknown composer'} · {session.sourceLabel}</p></div>
        <div className="practice-header-actions"><div className="practice-speed"><span>{capture.recording ? `Captured take · ${Math.round(displayedSpeed * 100)}%` : 'Practice speed'}</span><div>{speeds.map((speed) => <button key={speed} className={displayedSpeed === speed ? 'active' : ''} disabled={speedLocked} onClick={() => practice.setSpeedMultiplier(resolvePracticeSpeedChange(session.speedMultiplier, speed, capture.state.status))}>{Math.round(speed * 100)}%</button>)}{!speeds.includes(displayedSpeed) && <span className="current-custom-speed" aria-label={`Current practice speed ${Math.round(displayedSpeed * 100)} percent`}>Current · {Math.round(displayedSpeed * 100)}%</span>}</div>{speedLocked && <small>Clear the current take before changing the target speed.</small>}</div><Button variant="secondary" icon={focusMode ? Minimize2 : Maximize2} onClick={() => setFocusMode((current) => !current)}>{focusMode ? 'Exit Focus' : 'Focus mode'} <span className="kbd">F</span></Button></div>
      </header>

      {session.presentationIntent && <section className="practice-target-context panel" aria-label="Suggested practice target">
        <div><span>Practice Planning hand-off</span><strong>Suggested target · {practiceIntentLabel(session.presentationIntent)}</strong><small>{session.presentationIntent.recommendationKind.replaceAll('-', ' ')} · {Math.round(session.speedMultiplier * 100)}% practice speed</small></div>
        {session.presentationIntent.type === 'section' ? <details><summary>Exact section identity</summary><code>{session.presentationIntent.section.scoreVersionId}</code><span>Measure indexes {session.presentationIntent.section.startMeasureIndex}–{session.presentationIntent.section.endMeasureIndex}</span><span>Source measures: {session.presentationIntent.section.sourceMeasureIds.join(', ')}</span></details> : <p>The recommendation carries arrangement-level context and does not fabricate a section boundary.</p>}
      </section>}

      {focusMode && <button className="focus-exit" onClick={() => setFocusMode(false)}><Minimize2 /> Exit Focus <span className="kbd">Esc</span></button>}

      <div className="practice-workspace">
        <section className="panel notation-panel practice-notation">
          <div className="score-section-heading notation-heading"><div><span className="score-section-icon paper"><FileMusic /></span><div><h2>Sheet music</h2><p>{scoreHighlights ? 'Result focus uses application-owned score mapping' : 'Reference notation — result issues appear after analysis'}</p></div></div><div className="notation-controls"><button aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(0.5, value - 0.08))}>−</button><span>{Math.round(zoom * 100)}%</span><button aria-label="Zoom in" onClick={() => setZoom((value) => Math.min(1.2, value + 0.08))}>+</button></div></div>
          <div className="notation-paper"><OsmdScoreRenderer musicXmlText={session.source.musicXmlText} zoom={zoom} highlights={scoreHighlights} /></div>
        </section>

        <aside className="practice-sidebar">
          <section className={`panel recording-console ${capture.state.status}`}>
            <div className="recording-console-top"><div className="recording-orb"><span /></div><div><span className="step-label">Performance capture</span><h2>{capture.state.status === 'armed' ? 'Waiting for first note…' : capture.state.status === 'recording' ? 'Recording' : capture.recording ? 'Take ready' : 'Ready'}</h2></div><StatusPill tone={capture.state.status === 'recording' || capture.state.status === 'armed' ? 'warning' : capture.recording ? 'positive' : 'neutral'}>{capture.state.status}</StatusPill></div>
            <div className="recording-timer">{formatTimer(capture.elapsedMs)}</div>
            <label className="take-start-mode"><span>Intended start</span><select aria-label="Intended score start" value={startMode} disabled={capture.state.status === 'armed' || capture.state.status === 'recording'} onChange={(event) => { setConfirmedRegionHint(null); setForensicOpen(false); setScoreHighlights(null); setStartModeOverride(event.target.value as 'beginning' | 'section' | 'auto') }}><option value="beginning">Beginning</option>{planningSection && <option value="section">Suggested section · {planningSection.displayRange}</option>}<option value="auto">Auto detect</option></select><small>A hint for localization, never grading truth.</small></label>
            <div className="live-capture-stats"><div><Activity /><span>Events</span><strong>{activeEventCount}</strong></div><div><Music2 /><span>{capture.recording ? 'Attacks' : 'Keys down'}</span><strong>{activeAttackCount}</strong></div><div><Gauge /><span>Pedal</span><strong>{midi.sustainObserved ? midi.sustainDown ? 'Down' : 'Up' : '—'}</strong></div></div>
            {!midi.selectedDevice && capture.state.status !== 'stopped' && <div className="recording-device-notice"><Cable /><span>Connect and select a MIDI input before recording.</span></div>}
            {capture.recording?.stopReason === 'device-disconnected' && <div className="recording-device-notice warning"><AlertCircle /><span>The MIDI input disconnected. This take was stopped safely.</span></div>}
            <div className="recording-actions">
              {capture.state.status === 'idle' && <Button icon={Activity} disabled={!midi.selectedDevice} onClick={startCapture}>Record take</Button>}
              {capture.state.status === 'armed' && <Button variant="secondary" icon={CircleStop} onClick={capture.stop}>Cancel waiting</Button>}
              {capture.state.status === 'recording' && <Button icon={CircleStop} onClick={capture.stop}>Stop recording</Button>}
              {capture.state.status === 'stopped' && <><Button icon={RotateCcw} disabled={!midi.selectedDevice} onClick={startCapture}>Record again</Button><Button variant="ghost" icon={Trash2} onClick={clearTake}>{clearActionCopy.label}</Button></>}
            </div>
            {capture.state.status === 'stopped' && clearActionCopy.detail && <small className="take-clear-note">{clearActionCopy.detail}</small>}
          </section>
          <section className="panel practice-midi"><MidiControls compact /></section>
        </aside>
      </div>

      <PianoKeyboard activeNotes={midi.activeNotes} sustainDown={midi.sustainDown} sustainObserved={midi.sustainObserved} />

      <div className="practice-summary-grid">
        <section className="panel expected-summary"><div className="section-heading"><div><h2><Music2 /> Expected score</h2><p>Plan data, not a performance grade</p></div></div><div className="summary-metrics"><div><span>Required attacks</span><strong>{plan.statistics.requiredAttackCount}</strong></div><div><span>Onset groups</span><strong>{plan.statistics.onsetGroupCount}</strong></div><div><span>Multi-note groups</span><strong>{plan.statistics.multiNoteGroupCount}</strong></div><div><span>Score span</span><strong>{formatMusicalTime(plan.statistics.totalScoreDuration)}</strong><small>quarter units</small></div></div><div className="timeline-preview"><Clock3 /><span>Reference at 100% <strong>{formatDuration(referenceMs)}</strong></span><span>{capture.recording ? 'Captured' : 'Target'} at {Math.round(displayedSpeed * 100)}% <strong>{formatDuration(practiceMs)}</strong></span>{plan.tempoTimeline.usesFallback && <em>120 BPM fallback before authored tempo</em>}</div></section>
        <section className="panel take-summary"><div className="section-heading"><div><h2><Activity /> Captured take</h2><p>Objective MIDI diagnostics · {capture.recording ? `${Math.round(displayedSpeed * 100)}% practice speed` : 'no take yet'}</p></div></div>{capture.recording ? <><div className="summary-metrics"><div><span>MIDI events</span><strong>{capture.recording.statistics.eventCount}</strong></div><div><span>Note attacks</span><strong>{capture.recording.statistics.noteAttackCount}</strong></div><div><span>Unique pitches</span><strong>{capture.recording.statistics.uniquePitchCount}</strong></div><div><span>Open notes</span><strong>{capture.recording.statistics.openNoteCount}</strong></div></div><div className="take-foot"><span>Captured at {Math.round(displayedSpeed * 100)}%</span><span>{capture.recording.statistics.sustainChangeCount} pedal changes</span><span>{capture.recording.statistics.orphanReleaseCount} orphan releases</span><span>{formatDuration(capture.recording.durationMs)} duration</span></div></> : <div className="take-empty">Record a take to inspect event, pitch, velocity, pedal, and key-release statistics. No grading occurs in this view.</div>}</section>
      </div>
      {capture.recording && (takeAnalysis.state.status === 'idle' || takeAnalysis.state.status === 'processing' || takeAnalysis.state.status === 'unavailable') && <TakeAnalysisStatus state={takeAnalysis.state} onRetry={takeAnalysis.retry} />}
      {capture.recording && alignmentResult && (takeAnalysis.state.status === 'ready' || takeAnalysis.state.status === 'needs-confirmation') && <TakeReview key={capture.recording.id} alignment={alignmentResult} recording={capture.recording} practiceSpeed={displayedSpeed} results={coreResults} expressionAnalysis={expression.state} pedalAnalysis={pedal.state} voicingAnalysis={voicing.state} onConfirmRegion={confirmRegion} onHighlightChange={updateScoreHighlights} />}
      {takeAnalysis.state.status === 'ready' && <>
        <section className="panel save-attempt-panel"><div><span className="step-label">Local performance history</span><h2>{savedRecordingId === capture.recording?.id ? 'Take saved' : 'Keep this analysis'}</h2><p>{session.isDemo ? 'Demo takes remain temporary and are never mixed into your real progress.' : !alignmentResult?.localization?.takeRegion ? 'Confirm the matched score region before saving this analysis.' : !attemptSnapshotsReady ? 'Interpretation snapshots are still preparing or need a safe retry before this take can be frozen.' : 'Saving preserves the raw MIDI recording, exact ScoreVersion, matched region, and every analysis snapshot in one transaction.'}</p>{saveMessage && <span className={saveStatus === 'error' ? 'practice-build-error' : 'save-confirmation'}>{saveStatus === 'saved' ? <CheckCircle2 /> : <AlertCircle />}{saveMessage}</span>}{personalBestEvents.length > 0 && <div className="personal-best-events">{personalBestEvents.map((event) => <span key={event.metric}><Sparkles /> {event.kind === 'first-full-result' ? `First full-score ${event.metric} result` : `New ${event.metric} personal best`}: {formatPercent(event.value)}</span>)}</div>}</div><Button icon={savedRecordingId === capture.recording?.id ? CheckCircle2 : Save} disabled={session.isDemo || saveStatus === 'saving' || savedRecordingId === capture.recording?.id || !alignmentResult?.localization?.takeRegion || !attemptSnapshotsReady} onClick={() => void saveAttempt()}>{saveStatus === 'saving' ? 'Saving…' : saveStatus === 'error' ? 'Retry save' : savedRecordingId === capture.recording?.id ? 'Saved' : !alignmentResult?.localization?.takeRegion ? 'Confirm score region' : !attemptSnapshotsReady ? 'Preparing analysis…' : 'Save attempt'}</Button></section>
      </>}
      {capture.recording && <details id="detailed-analysis" className="technical-analysis-stack" open={forensicOpen} onToggle={(event) => setForensicOpen(event.currentTarget.open)}><summary>Detailed analysis · event-level and engine evidence</summary>{forensicOpen && <div><AlignmentPanel analysis={alignment.state} onAnalyze={() => void alignment.analyze()} />{alignmentResult && <NoteGradingPanel analysis={noteGrading.state} scope={noteGrading.scope} onAnalyze={(scope) => void noteGrading.analyze(scope)} />}{alignmentResult && noteGradingResult && <TimingAnalysisPanel analysis={timing.state} scope={noteGrading.scope} noteGrading={noteGradingResult} onAnalyze={(scope) => void analyzeTiming(scope)} />}{alignmentResult && noteGradingResult && timingResult && <PerformanceResultsPanel analysis={performanceResults.state} scope={noteGrading.scope} onAnalyze={(scope) => void analyzeResults(scope)} onHighlightChange={updateScoreHighlights} />}<ExpressionAnalysisPanel analysis={expression.state} onAnalyze={() => void expression.analyze()} /><PedalAnalysisPanel analysis={pedal.state} onAnalyze={() => void pedal.analyze()} /><VoicingAnalysisPanel analysis={voicing.state} lanes={detectedLanes} profile={intentProfile} scoreVersionId={session.scoreVersionId ?? 'demo'} maxMeasureIndex={maxMeasureIndex} onSaveProfile={saveVoicingProfile} onAnalyze={() => void voicing.analyze()} /><ReferenceComparisonPanel analysis={referenceComparison.state} candidates={referenceCandidates} selectedReferenceId={selectedReferenceId} onSelectReference={selectReference} /></div>}</details>}
    </div>
  )
}
