import { CircleStop, Target } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button, PageHeader, StatusPill } from '../components/ui'
import { makePlan, makeRecording } from '../features/alignment/__tests__/fixtures'
import type { ScoreRegionCandidate, ScoreRegionLocalizationHint } from '../features/alignment/types'
import { makeScore } from '../features/performance-results/__tests__/fixtures'
import { TakeReview } from '../features/performance-results/TakeReview'
import { TakeAnalysisStatus } from '../features/performance-results/TakeAnalysisStatus'
import { useTakeAnalysisPipeline } from '../features/performance-results/useTakeAnalysisPipeline'

type Scenario = 'beginning' | 'middle' | 'ambiguous' | 'processing'

const pitches = [...Array.from({ length: 8 }, (_, index) => 60 + index), ...Array.from({ length: 8 }, (_, index) => 60 + index)]
const plan = makePlan(pitches.map((midi) => [midi]), { measureIndices: pitches.map((_, index) => Math.floor(index / 2)) })
const score = makeScore(plan, 8, 2)

function sourceAttacks(scenario: Scenario) {
  const start = scenario === 'middle' ? 8 : 0
  return plan.attacks.slice(start, start + 8).flatMap((attack, index) => index === 3
    ? []
    : [{ midi: index === 5 ? attack.midi + 1 : attack.midi, ms: index * 480 }])
}

function hintFor(scenario: Scenario): ScoreRegionLocalizationHint {
  if (scenario === 'beginning') return { mode: 'beginning' }
  if (scenario === 'middle') return { mode: 'section', scoreVersionId: 'qa-score-version', startMeasureIndex: 4, endMeasureIndex: 7, sourceMeasureIds: ['measure:P1:4', 'measure:P1:5', 'measure:P1:6', 'measure:P1:7'] }
  return { mode: 'auto' }
}

export function Phase152QaPage() {
  const [scenario, setScenario] = useState<Scenario>('beginning')
  const [confirmed, setConfirmed] = useState<ScoreRegionCandidate | null>(null)
  const recording = useMemo(() => makeRecording(sourceAttacks(scenario), { id: `qa-recording:${scenario}`, planId: plan.id }), [scenario])
  const localizationHint: ScoreRegionLocalizationHint = confirmed
    ? { mode: 'confirmed', expectedStartIndex: confirmed.expectedStartIndex, expectedEndIndex: confirmed.expectedEndIndex }
    : hintFor(scenario)
  const takeAnalysis = useTakeAnalysisPipeline(score, plan, scenario === 'processing' ? null : recording, 1, localizationHint)
  const alignment = takeAnalysis.state.status === 'ready' || takeAnalysis.state.status === 'needs-confirmation' || takeAnalysis.state.status === 'unavailable' ? takeAnalysis.state.alignment : null
  const results = takeAnalysis.state.status === 'ready' ? takeAnalysis.state.results : null

  const chooseScenario = (next: Scenario) => { setScenario(next); setConfirmed(null) }

  return <div className="page phase152-qa-page">
    <PageHeader eyebrow="Development-only visual review" title="Phase 15.2 Take Review QA" description="Explicitly labeled fixtures exercise the current take-analysis pipeline and responsive presentation. They are not saved evidence and never enter product history." />
    <div className="qa-scenario-controls" role="group" aria-label="Take Review fixture"><button className={scenario === 'beginning' ? 'active' : ''} onClick={() => chooseScenario('beginning')}>Partial beginning</button><button className={scenario === 'middle' ? 'active' : ''} onClick={() => chooseScenario('middle')}>Middle section</button><button className={scenario === 'ambiguous' ? 'active' : ''} onClick={() => chooseScenario('ambiguous')}>Ambiguous repeat</button><button className={scenario === 'processing' ? 'active' : ''} onClick={() => chooseScenario('processing')}>Processing state</button></div>
    <p className="qa-fixture-label">Visual QA fixture · {scenario} · not saved evidence</p>
    <section className="panel recording-console armed qa-armed-console"><div className="recording-console-top"><div className="recording-orb"><span /></div><div><span className="step-label">Performance capture</span><h2>Waiting for first note…</h2></div><StatusPill tone="warning">armed</StatusPill></div><div className="recording-timer">00:00.0</div><p>Armed-state layout fixture. Musical time begins with the first Note On.</p><Button variant="secondary" icon={CircleStop}>Cancel waiting</Button></section>
    {scenario === 'processing' && <TakeAnalysisStatus state={{ status: 'processing', stage: 'localization' }} onRetry={() => undefined} />}
    {scenario !== 'processing' && (takeAnalysis.state.status === 'idle' || takeAnalysis.state.status === 'processing' || takeAnalysis.state.status === 'unavailable') && <TakeAnalysisStatus state={takeAnalysis.state} onRetry={takeAnalysis.retry} />}
    {scenario !== 'processing' && alignment && (takeAnalysis.state.status === 'ready' || takeAnalysis.state.status === 'needs-confirmation') && <TakeReview alignment={alignment} recording={recording} practiceSpeed={1} results={results} expression={null} pedal={null} voicing={null} onConfirmRegion={setConfirmed} onHighlightChange={() => undefined} />}
    <details id="detailed-analysis" className="technical-analysis-stack"><summary>Detailed analysis · event-level and engine evidence</summary><div className="panel qa-detailed-fixture"><Target /><div><strong>Forensic detail is lazy</strong><p>The production disclosure mounts the existing engine panels only when opened.</p></div></div></details>
  </div>
}
