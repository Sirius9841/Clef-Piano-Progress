import { describe, expect, it } from 'vitest'
import { pedalAnalysisKey } from '../usePedalAnalysis'

describe('pedal analysis hook identity', () => {
  it('invalidates on recording, alignment, scope/note, and expression snapshot changes', () => {
    const value = (id: string) => ({ id })
    const base = pedalAnalysisKey(value('score') as never, value('plan') as never, value('recording') as never, value('alignment') as never, value('note') as never, value('expression') as never)
    expect(pedalAnalysisKey(value('score') as never, value('plan') as never, value('recording-2') as never, value('alignment') as never, value('note') as never, value('expression') as never)).not.toBe(base)
    expect(pedalAnalysisKey(value('score') as never, value('plan') as never, value('recording') as never, value('alignment-2') as never, value('note') as never, value('expression') as never)).not.toBe(base)
    expect(pedalAnalysisKey(value('score') as never, value('plan') as never, value('recording') as never, value('alignment') as never, value('note-2') as never, value('expression') as never)).not.toBe(base)
    expect(pedalAnalysisKey(value('score') as never, value('plan') as never, value('recording') as never, value('alignment') as never, value('note') as never, value('expression-2') as never)).not.toBe(base)
  })
})
