import { CircleStop, Target } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button, PageHeader, StatusPill } from '../components/ui'
import { makePlan, makeRecording } from '../features/alignment/__tests__/fixtures'
import type { ScoreRegionCandidate, ScoreRegionLocalizationHint } from '../features/alignment/types'
import { makeScore } from '../features/performance-results/__tests__/fixtures'
import { TakeReview } from '../features/performance-results/TakeReview'
import { TakeAnalysisStatus } from '../features/performance-results/TakeAnalysisStatus'
import { useInterpretationAnalysisPipeline } from '../features/performance-results/useInterpretationAnalysisPipeline'
import { useTakeAnalysisPipeline } from '../features/performance-results/useTakeAnalysisPipeline'

type Scenario = 'beginning' | 'middle' | 'ambiguous' | 'timing-unavailable' | 'interpretation-processing' | 'processing'

const pitches = [...Array.from({ length: 8 }, (_, index) => 60 + index), ...Array.from({ length: 8 }, (_, index) => 60 + index)]
const plan = makePlan(pitches.map((midi) => [midi]), { measureIndices: pitches.map((_, index) => Math.floor(index / 2)) })
const score = makeScore(plan, 8, 2)
const sparsePlan = makePlan([[60]], { measureIndices: [0] })
const sparseScore = makeScore(sparsePlan, 1, 1)

function sourceAttacks(scenario: Scenario, activePlan: typeof plan) {
  if (scenario === 'timing-unavailable') return [{ midi: activePlan.attacks[0]!.midi, ms: 0 }]
  const start = scenario === 'middle' ? 8 : 0
  return activePlan.attacks.slice(start, start + 8).flatMap((attack, index) => index === 3
    ? []
    : [{ midi: index === 5 ? attack.midi + 1 : attack.midi, ms: index * 480 }])
}

function hintFor(scenario: Scenario): ScoreRegionLocalizationHint {
  if (scenario === 'beginning' || scenario === 'timing-unavailable' || scenario === 'interpretation-processing') return { mode: 'beginning' }
  if (scenario === 'middle') return { mode: 'section', scoreVersionId: 'qa-score-version', startMeasureIndex: 4, endMeasureIndex: 7, sourceMeasureIds: ['measure:P1:4', 'measure:P1:5', 'measure:P1:6', 'measure:P1:7'] }
  return { mode: 'auto' }
}

export function Phase152QaPage() {
  const [scenario, setScenario] = useState<Scenario>('beginning')
  const [confirmed, setConfirmed] = useState<ScoreRegionCandidate | null>(null)
  const [detailedOpen, setDetailedOpen] = useState(false)
  const activePlan = scenario === 'timing-unavailable' ? sparsePlan : plan
  const activeScore = scenario === 'timing-unavailable' ? sparseScore : score
  const recording = useMemo(() => makeRecording(sourceAttacks(scenario, activePlan), { id: `qa-recording:${scenario}`, planId: activePlan.id }), [activePlan, scenario])
  const localizationHint: ScoreRegionLocalizationHint = confirmed
    ? { mode: 'confirmed', expectedStartIndex: confirmed.expectedStartIndex, expectedEndIndex: confirmed.expectedEndIndex }
    : hintFor(scenario)
  const takeAnalysis = useTakeAnalysisPipeline(activeScore, activePlan, scenario === 'processing' ? null : recording, 1, localizationHint)
  const alignment = takeAnalysis.state.status === 'ready' || takeAnalysis.state.status === 'needs-confirmation' || takeAnalysis.state.status === 'unavailable' ? takeAnalysis.state.alignment : null
  const note = takeAnalysis.state.status === 'ready' ? takeAnalysis.state.noteGrading : null
  const results = takeAnalysis.state.status === 'ready' ? takeAnalysis.state.results : null
  const interpretation = useInterpretationAnalysisPipeline(activeScore, 'qa-score-version', activePlan, scenario === 'processing' ? null : recording, alignment, note, null)
  const interpretationProcessing = scenario === 'interpretation-processing'
  const expressionState = interpretationProcessing ? { status: 'analyzing' as const } : interpretation.expression.state
  const pedalState = interpretationProcessing ? { status: 'analyzing' as const } : interpretation.pedal.state
  const voicingState = interpretationProcessing ? { status: 'analyzing' as const } : interpretation.voicing.state

  const chooseScenario = (next: Scenario) => { setScenario(next); setConfirmed(null); setDetailedOpen(false) }

  return <div className="page phase152-qa-page">
    <PageHeader eyebrow="Development-only visual review" title="Phase 15.2 Take Review QA" description="Explicitly labeled fixtures exercise the current take-analysis pipeline and responsive presentation. They are not saved evidence and never enter product history." />
    <div className="qa-scenario-controls" role="group" aria-label="Take Review fixture"><button className={scenario === 'beginning' ? 'active' : ''} onClick={() => chooseScenario('beginning')}>Partial beginning</button><button className={scenario === 'middle' ? 'active' : ''} onClick={() => chooseScenario('middle')}>Middle section</button><button className={scenario === 'ambiguous' ? 'active' : ''} onClick={() => chooseScenario('ambiguous')}>Ambiguous repeat</button><button className={scenario === 'timing-unavailable' ? 'active' : ''} onClick={() => chooseScenario('timing-unavailable')}>Timing unavailable</button><button className={scenario === 'interpretation-processing' ? 'active' : ''} onClick={() => chooseScenario('interpretation-processing')}>Interpretation processing</button><button className={scenario === 'processing' ? 'active' : ''} onClick={() => chooseScenario('processing')}>Core processing</button></div>
    <p className="qa-fixture-label">Visual QA fixture · {scenario} · not saved evidence</p>
    <section className="panel recording-console armed qa-armed-console"><div className="recording-console-top"><div className="recording-orb"><span /></div><div><span className="step-label">Performance capture</span><h2>Waiting for first note…</h2></div><StatusPill tone="warning">armed</StatusPill></div><div className="recording-timer">00:00.0</div><p>Armed-state layout fixture. Musical time begins with the first Note On.</p><Button variant="secondary" icon={CircleStop}>Cancel waiting</Button></section>
    {scenario === 'processing' && <TakeAnalysisStatus state={{ status: 'processing', stage: 'localization' }} onRetry={() => undefined} />}
    {scenario !== 'processing' && (takeAnalysis.state.status === 'idle' || takeAnalysis.state.status === 'processing' || takeAnalysis.state.status === 'unavailable') && <TakeAnalysisStatus state={takeAnalysis.state} onRetry={takeAnalysis.retry} />}
    {scenario !== 'processing' && alignment && (takeAnalysis.state.status === 'ready' || takeAnalysis.state.status === 'needs-confirmation') && <TakeReview key={recording.id} alignment={alignment} recording={recording} practiceSpeed={1} results={results} expressionAnalysis={expressionState} pedalAnalysis={pedalState} voicingAnalysis={voicingState} onConfirmRegion={setConfirmed} onHighlightChange={() => undefined} />}
    <details id="detailed-analysis" className="technical-analysis-stack" open={detailedOpen} onToggle={(event) => setDetailedOpen(event.currentTarget.open)}><summary>Detailed analysis · event-level and engine evidence</summary>{detailedOpen && <div className="panel qa-detailed-fixture"><Target /><div><strong>Forensic detail is lazy</strong><p>The production disclosure mounts the existing engine panels only when opened.</p></div></div>}</details>
  </div>
}
