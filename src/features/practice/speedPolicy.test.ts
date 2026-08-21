import { describe, expect, it } from 'vitest'
import type { PerformanceRecording } from '../performance/types'
import { capturedTakeSpeed, isPracticeSpeedLocked, resolvePracticeSpeedChange } from './speedPolicy'

describe('practice speed policy', () => {
  it('locks a stopped 75% take to its captured speed', () => {
    const recording = { practiceContext: { speedMultiplier: 0.75 } } as PerformanceRecording
    expect(isPracticeSpeedLocked('stopped')).toBe(true)
    expect(resolvePracticeSpeedChange(0.75, 1, 'stopped')).toBe(0.75)
    expect(capturedTakeSpeed(recording, 1)).toBe(0.75)
  })

  it('allows speed changes again after the take is discarded', () => {
    expect(isPracticeSpeedLocked('idle')).toBe(false)
    expect(resolvePracticeSpeedChange(0.75, 1, 'idle')).toBe(1)
    expect(capturedTakeSpeed(null, 1)).toBe(1)
  })
})
