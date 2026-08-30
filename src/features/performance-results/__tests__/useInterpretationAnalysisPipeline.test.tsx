// @vitest-environment jsdom

import { StrictMode, act, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { alignPerformance } from '../../alignment/alignPerformance'
import { makePlan, makeRecording } from '../../alignment/__tests__/fixtures'
import { gradeNotes } from '../../note-grading/gradeNotes'
import { makeScore } from './fixtures'
import { interpretationAnalysisPipelineKey, useInterpretationAnalysisPipeline } from '../useInterpretationAnalysisPipeline'

const plan = makePlan([[60], [62], [64], [65]], { measureIndices: [0, 0, 1, 1] })
const score = makeScore(plan, 2, 2)

function analyzedTake(id: string, offset: number) {
  const recording = makeRecording(plan.attacks.map((attack, index) => ({ midi: attack.midi, ms: offset + index * 500, velocity: 48 + index * 8 })), { id, planId: plan.id })
  const alignment = alignPerformance(plan, recording, { localizationHint: { mode: 'beginning' } })
  const note = gradeNotes({ expectedPlan: plan, recording, alignment })
  return { recording, alignment, note }
}

const first = analyzedTake('interpretation:first', 0)
const second = analyzedTake('interpretation:second', 100)

type AnalysisStates = ReturnType<typeof useInterpretationAnalysisPipeline>

function Harness({ take, onState }: { readonly take: typeof first; readonly onState: (state: AnalysisStates) => void }) {
  const analysis = useInterpretationAnalysisPipeline(score, 'score-version:test', plan, take.recording, take.alignment, take.note, null)
  useEffect(() => onState(analysis), [analysis, onState])
  return <div>{analysis.expression.state.status}:{analysis.pedal.state.status}:{analysis.voicing.state.status}</div>
}

async function settle() {
  for (let index = 0; index < 50; index += 1) await act(async () => new Promise<void>((resolve) => window.setTimeout(resolve, 5)))
}

describe('progressive interpretation pipeline', () => {
  it('survives StrictMode and publishes only the newest take identity', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    let latest: AnalysisStates | null = null
    const onState = (state: AnalysisStates) => { latest = state }

    await act(async () => root.render(<StrictMode><Harness take={first} onState={onState} /></StrictMode>))
    await act(async () => root.render(<StrictMode><Harness take={second} onState={onState} /></StrictMode>))
    await settle()

    expect(latest).not.toBeNull()
    const current = latest!
    expect(current.expression.state.status).toBe('ready')
    expect(current.pedal.state.status).toBe('ready')
    expect(current.voicing.state.status).toBe('ready')
    if (current.expression.state.status === 'ready') expect(current.expression.state.result.recordingId).toBe(second.recording.id)
    if (current.pedal.state.status === 'ready') expect(current.pedal.state.result.recordingId).toBe(second.recording.id)
    if (current.voicing.state.status === 'ready') expect(current.voicing.state.result.recordingId).toBe(second.recording.id)

    act(() => root.unmount())
    container.remove()
  })

  it('changes identity for recording, localization/note snapshots, and intent', () => {
    const base = interpretationAnalysisPipelineKey(score, 'score-version:test', plan, first.recording, first.alignment, first.note, null)
    expect(interpretationAnalysisPipelineKey(score, 'score-version:test', plan, second.recording, second.alignment, second.note, null)).not.toBe(base)
    expect(interpretationAnalysisPipelineKey(score, 'score-version:test', plan, first.recording, second.alignment, second.note, null)).not.toBe(base)
    expect(interpretationAnalysisPipelineKey(score, 'score-version:test', plan, first.recording, first.alignment, first.note, { id: 'intent', scoreVersionId: 'score-version:test', updatedAt: '2026-08-30T12:00:00.000Z', regions: [] })).not.toBe(base)
  })
})
