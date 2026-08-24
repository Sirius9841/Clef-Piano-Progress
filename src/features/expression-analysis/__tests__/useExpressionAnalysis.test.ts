import { describe, expect, it } from 'vitest'
import { makePlan, makeRecording } from '../../alignment/__tests__/fixtures'
import { expressionAnalysisKey } from '../useExpressionAnalysis'

describe('expression analysis workspace identity', () => {
  it('invalidates a saved result key after discard, clear, or record again', () => {
    const plan = makePlan([[60]])
    const score = { id: plan.scoreId } as Parameters<typeof expressionAnalysisKey>[0]
    const first = makeRecording([{ midi: 60, ms: 100 }], { id: 'take-a', planId: plan.id })
    const second = makeRecording([{ midi: 60, ms: 100 }], { id: 'take-b', planId: plan.id })
    const firstKey = expressionAnalysisKey(score, plan, first, null, null)
    expect(expressionAnalysisKey(score, plan, null, null, null)).not.toBe(firstKey)
    expect(expressionAnalysisKey(score, plan, second, null, null)).not.toBe(firstKey)
  })
})
