import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { HistoricalPedalPanel } from '../HistoricalPedalPanel'
import { PedalAnalysisPanel } from '../PedalAnalysisPanel'
import type { PedalAnalysisResult } from '../types'

describe('historical pedal presentation', () => {
  it('labels V1/V2 history as not analyzed without inventing a zero or engine', () => {
    const html = renderToStaticMarkup(<HistoricalPedalPanel result={null} />)
    expect(html).toContain('Pedal not analyzed')
    expect(html).toContain('will not silently reanalyze')
    expect(html).not.toContain('0.0')
    expect(html).not.toContain('pedal-analysis-')
  })

  it('presents complete, partial, unavailable, and event coverage without overstating phrases', () => {
    const result = {
      id: 'pedal:test', status: 'ready', reliability: 'limited', unavailableReason: null, score: 0.86,
      coverage: {
        authoredPhraseCount: 5, analyzedPhraseCount: 3, ratio: 0.6,
        fullyAnalyzedPhraseCount: 3, partiallyAnalyzedPhraseCount: 1, unanalyzedPhraseCount: 1,
        authoredEventCount: 9, analyzedEventCount: 7, truncatedEventCount: 1, unavailableEventCount: 1, eventCoverageRatio: 7 / 9,
      },
      controllerEvidence: { mode: 'binary-like', rawSampleCount: 2, downTransitionCount: 1, upTransitionCount: 1, intermediateValueCount: 0, extraUnassignedTransitionCount: 0, authoritativeChannel: 0, channelMode: 'single-channel' },
      timeline: { rawSamples: [], transitions: [] }, targets: [], observations: [], phraseResults: [], interactions: [], damperHolds: [],
      diagnostics: { pedalAnalysisEngineVersion: 'pedal-analysis-1.1.0', localTimingAnchorCount: 7, globalTimingFallbackCount: 2 },
    } as unknown as PedalAnalysisResult
    const html = renderToStaticMarkup(<PedalAnalysisPanel analysis={{ status: 'ready', result }} onAnalyze={() => undefined} />)
    expect(html).toContain('3 complete phrases')
    expect(html).toContain('1 partial phrase')
    expect(html).toContain('1 unavailable phrase')
    expect(html).toContain('7 / 9 authored pedal events analyzed')
    expect(html).toContain('aligned musical performance')
    expect(html).not.toContain('5 / 5 phrases analyzed')
  })
})
