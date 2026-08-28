import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { PerformanceAttemptRecord, PersistedScoreVersion } from '../features/persistence/types'
import { attemptFixture } from '../features/practice-planning/__tests__/fixtures'
import { HistoricalEvidenceInspector } from './HistoricalEvidenceInspector'
import { coreMeasureEvidence, deriveLowestCoreDimension, historicalDimension, historicalDimensions } from './historicalEvidencePresentation'

function attemptWithSevenDimensions(): PerformanceAttemptRecord {
  const base = attemptFixture('seven', { notes: .84, rhythm: .61, tempo: .76 }).record
  return {
    ...base,
    schemaVersion: 4,
    recording: { ...base.recording, statistics: { ...base.recording.statistics, sustainChangeCount: 3 } },
    expressionAnalysis: {
      dynamics: { status: 'ready', score: .91, reliability: 'reliable' },
      articulation: { status: 'ready', score: .73, reliability: 'limited' },
    },
    pedalAnalysis: { status: 'ready', score: .67, reliability: 'limited' },
    voicingAnalysis: { mode: 'configured', status: 'ready', score: .88, reliability: 'reliable' },
  } as unknown as PerformanceAttemptRecord
}

describe('historical evidence presentation', () => {
  it('exposes exactly seven independent scored or qualified evidence dimensions', () => {
    expect(historicalDimensions(attemptWithSevenDimensions()).map((dimension) => dimension.id)).toEqual([
      'notes', 'rhythm', 'tempo', 'dynamics', 'articulation', 'pedal', 'voicing',
    ])
  })

  it('selects the saved snapshot for each expression lane without creating a composite', () => {
    const attempt = attemptWithSevenDimensions()
    expect(historicalDimension(attempt, 'dynamics').score).toBe(.91)
    expect(historicalDimension(attempt, 'articulation').score).toBe(.73)
    expect(historicalDimension(attempt, 'pedal').score).toBe(.67)
    expect(historicalDimension(attempt, 'voicing').score).toBe(.88)
    expect(historicalDimensions(attempt)).not.toContainEqual(expect.objectContaining({ id: 'reference' }))
  })

  it('keeps physical CC64 evidence visible when authored Pedal scoring is unavailable', () => {
    const base = attemptFixture('pedal-history').record
    const attempt = { ...base, recording: { ...base.recording, statistics: { ...base.recording.statistics, sustainChangeCount: 4 } } }
    const pedal = historicalDimension(attempt, 'pedal')
    expect(pedal.score).toBeNull()
    expect(pedal.status).toBe('unavailable')
    expect(pedal.detail).toContain('4 physical CC64 changes captured')
  })

  it('shows unconfigured Voicing as descriptive absence, never as zero', () => {
    const voicing = historicalDimension(attemptFixture('old').record, 'voicing')
    expect(voicing.status).toBe('not-configured')
    expect(voicing.score).toBeNull()
    expect(voicing.detail).toContain('current preferences do not rewrite it')
  })

  it('derives the factual lowest lane from Notes, Rhythm, and Tempo only', () => {
    const attempt = attemptWithSevenDimensions()
    expect(deriveLowestCoreDimension(attempt.performanceResults)).toEqual({ dimensions: ['rhythm'], score: .61 })
  })

  it('changes core measure evidence with the selected Notes, Rhythm, or Tempo lane', () => {
    const results = attemptWithSevenDimensions().performanceResults
    expect(coreMeasureEvidence(results, 'notes').map((measure) => measure.score)).toEqual(results.measures.map((measure) => measure.note.noteScore).filter((score): score is number => score !== null).sort((left, right) => left - right))
    expect(coreMeasureEvidence(results, 'rhythm').map((measure) => measure.evidenceCount)).toEqual([...results.measures].filter((measure) => measure.rhythm.rhythmScore !== null).sort((left, right) => left.rhythm.rhythmScore! - right.rhythm.rhythmScore!).map((measure) => measure.rhythm.scoredIntervalCount))
    expect(coreMeasureEvidence(results, 'tempo').map((measure) => measure.evidenceCount)).toEqual([...results.measures].filter((measure) => measure.tempo.tempoScore !== null).sort((left, right) => left.tempo.tempoScore! - right.tempo.tempoScore!).map((measure) => measure.tempo.sampleCount))
  })

  it('renders the canonical seven-lane inspector without a composite or Reference score', () => {
    const attempt = attemptWithSevenDimensions()
    const scoreVersion = {
      id: attempt.scoreVersionId, arrangementId: attempt.arrangementId, version: 2, format: 'musicxml', createdAt: attempt.performedAt,
      sourceFileName: 'frozen.musicxml', sourceBytes: 1, uncompressedBytes: 1, contentHash: 'hash', canonicalMusicXml: '<score-partwise version="4.0"><part-list/></score-partwise>',
      normalizedScoreId: attempt.expectedPerformancePlan.scoreId, parserVersion: 'parser', includedPartIds: attempt.includedPartIds,
    } satisfies PersistedScoreVersion
    const markup = renderToStaticMarkup(createElement(HistoricalEvidenceInspector, { attempt, scoreVersion }))
    expect((markup.match(/role="tab"/g) ?? [])).toHaveLength(7)
    expect(markup).toContain('Reference comparison is not a scored dimension')
    expect(markup).not.toContain('Overall Performance Score')
    expect(markup).not.toContain('>Reference</span>')
  })
})
