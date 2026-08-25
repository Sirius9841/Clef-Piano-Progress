import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { HistoricalPedalPanel } from '../HistoricalPedalPanel'

describe('historical pedal presentation', () => {
  it('labels V1/V2 history as not analyzed without inventing a zero or engine', () => {
    const html = renderToStaticMarkup(<HistoricalPedalPanel result={null} />)
    expect(html).toContain('Pedal not analyzed')
    expect(html).toContain('will not silently reanalyze')
    expect(html).not.toContain('0.0')
    expect(html).not.toContain('pedal-analysis-')
  })
})
