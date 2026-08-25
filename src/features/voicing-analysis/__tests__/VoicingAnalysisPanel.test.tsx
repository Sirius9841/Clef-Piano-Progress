import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { HistoricalVoicingPanel } from '../HistoricalVoicingPanel'

describe('historical Voicing presentation', () => {
  it('does not fabricate Voicing for V1-V3 history', () => {
    const html = renderToStaticMarkup(<HistoricalVoicingPanel result={null} />)
    expect(html).toContain('Not analyzed for this historical attempt')
    expect(html).not.toContain('0%')
  })
})
