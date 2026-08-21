import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { LibraryPage } from './LibraryPage'
import { TechniquePage } from './TechniquePage'

describe('truthful future-state pages', () => {
  it('does not expose fabricated Technique Lab ratings, history, or recommendations', () => {
    const markup = renderToStaticMarkup(<TechniquePage />)
    expect(markup).toContain('Skill ratings and recommendations are not calculated yet')
    expect(markup).toContain('No ratings yet')
    expect(markup).not.toContain('Overall skill')
    expect(markup).not.toContain('30-day change')
    expect(markup).not.toContain('Latest session')
    expect(markup).not.toContain('strongest area')
  })

  it('keeps the Library metadata-only and cannot claim a score entered Repertoire', () => {
    const markup = renderToStaticMarkup(<MemoryRouter><LibraryPage /></MemoryRouter>)
    expect(markup).toContain('Metadata preview only')
    expect(markup).toContain('Score file not available yet')
    expect(markup).not.toContain('Add to repertoire')
    expect(markup).not.toContain('In repertoire')
  })
})
