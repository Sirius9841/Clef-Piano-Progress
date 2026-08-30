// @vitest-environment jsdom

import { StrictMode, act, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { makePlan, makeRecording } from '../../alignment/__tests__/fixtures'
import type { ScoreRegionLocalizationHint } from '../../alignment/types'
import { makeScore } from './fixtures'
import { timingStageFailure, type TakeAnalysisPipelineState, useTakeAnalysisPipeline } from '../useTakeAnalysisPipeline'

const sparsePlan = makePlan([[60]], { measureIndices: [0] })
const sparseScore = makeScore(sparsePlan, 1, 1)
const sparseRecording = makeRecording([{ midi: 60, ms: 0 }], { id: 'pipeline-sparse-take', planId: sparsePlan.id })
const BEGINNING_HINT: ScoreRegionLocalizationHint = { mode: 'beginning' }

function Harness({ onState, hint = BEGINNING_HINT }: { readonly onState: (state: TakeAnalysisPipelineState) => void; readonly hint?: ScoreRegionLocalizationHint }) {
  const analysis = useTakeAnalysisPipeline(sparseScore, sparsePlan, sparseRecording, 1, hint)
  useEffect(() => onState(analysis.state), [analysis.state, onState])
  return <div data-status={analysis.state.status}>{analysis.state.status}</div>
}

async function settle() {
  for (let index = 0; index < 40; index += 1) {
    await act(async () => new Promise<void>((resolve) => window.setTimeout(resolve, 5)))
  }
}

describe('automatic Take Review pipeline', () => {
  it('survives StrictMode replay and reaches ready with Notes when valid Timing is unavailable', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    let latest: TakeAnalysisPipelineState = { status: 'idle' }
    const latestState = () => latest

    await act(async () => root.render(<StrictMode><Harness onState={(state) => { latest = state }} /></StrictMode>))
    await settle()

    const finalState = latestState()
    expect(finalState.status).toBe('ready')
    if (finalState.status === 'ready') {
      expect(finalState.noteGrading.metrics.noteScore).toBe(1)
      expect(finalState.timing.status).toBe('unavailable')
      expect(finalState.results.status).toBe('ready')
      expect(finalState.results.summary).toEqual({ notes: 1, rhythm: null, tempo: null })
      expect(finalState.results.measures).toHaveLength(1)
      expect(finalState.results.warnings.some((warning) => warning.code === 'TIMING_RESULTS_UNAVAILABLE')).toBe(true)
    }
    expect(container.textContent).not.toContain('This take could not be reviewed safely')

    act(() => root.unmount())
    container.remove()
  })

  it('fails only when Timing produces no valid snapshot', () => {
    expect(timingStageFailure(null)).toBe('Bounded timing analysis did not produce a result snapshot.')
    const validUnavailable = { status: 'unavailable' } as Parameters<typeof timingStageFailure>[0]
    expect(timingStageFailure(validUnavailable)).toBeNull()
  })
})
