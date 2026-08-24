import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { PersistenceContext } from '../features/persistence/PersistenceContext'
import { AppShell } from './AppShell'

describe('AppShell progress range copy', () => {
  it('labels the rolling seven-day repository query truthfully', () => {
    const markup = renderToStaticMarkup(
      <PersistenceContext.Provider value={{ repository: null, status: 'loading', error: null, revision: 0, retry: () => undefined }}>
        <MemoryRouter><AppShell /></MemoryRouter>
      </PersistenceContext.Provider>,
    )
    expect(markup).toContain('Last 7 days')
    expect(markup).not.toContain('This week')
  })
})
