import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { LibraryPage } from './LibraryPage'
import { TechniquePage } from './TechniquePage'
import { PersistenceContext } from '../features/persistence/PersistenceContext'

describe('truthful future-state pages', () => {
  it('exposes measured Technique modules without fabricating an overall rating', () => {
    const markup = renderToStaticMarkup(<MemoryRouter><PersistenceContext.Provider value={{ repository: null, status: 'loading', error: null, revision: 0, retry: () => undefined }}><TechniquePage /></PersistenceContext.Provider></MemoryRouter>)
    expect(markup).toContain('Independent evidence')
    expect(markup).toContain('Open workspace')
    expect(markup).not.toContain('Overall skill')
    expect(markup).not.toContain('30-day change')
    expect(markup).not.toContain('Latest session')
    expect(markup).not.toContain('strongest area')
  })

  it('keeps the Library metadata-only and cannot claim a score entered Repertoire', () => {
    const markup = renderToStaticMarkup(<MemoryRouter><LibraryPage /></MemoryRouter>)
    expect(markup).toContain('No official editions are installed')
    expect(markup).toContain('does not fabricate catalogue works or notation')
    expect(markup).not.toContain('Add to repertoire')
    expect(markup).not.toContain('In repertoire')
  })
})
