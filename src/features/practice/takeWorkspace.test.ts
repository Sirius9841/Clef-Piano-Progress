import { describe, expect, it } from 'vitest'
import { clearCurrentTake, takeClearActionCopy } from './takeWorkspace'

describe('current-take workspace actions', () => {
  it('describes unsaved takes as discardable and saved takes as locally clearable', () => {
    expect(takeClearActionCopy('take-1', null)).toEqual({ label: 'Discard take', detail: null })
    expect(takeClearActionCopy('take-1', 'take-1')).toEqual({ label: 'Clear current take', detail: 'Saved history will be kept.' })
    expect(takeClearActionCopy('take-2', 'take-1')).toEqual({ label: 'Discard take', detail: null })
  })

  it('clears only the current workspace take and leaves saved history untouched', () => {
    const savedAttemptIds = new Set(['attempt:take-1'])
    let workspaceRecordingId: string | null = 'take-1'
    clearCurrentTake(() => { workspaceRecordingId = null })
    expect(workspaceRecordingId).toBeNull()
    expect(savedAttemptIds).toEqual(new Set(['attempt:take-1']))
  })
})
