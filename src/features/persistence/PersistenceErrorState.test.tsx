import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { PianoStorageError } from './errors'
import { PersistenceContext } from './PersistenceContext'
import { PersistenceErrorState } from './PersistenceErrorState'

describe('PersistenceErrorState', () => {
  it.each(['DATABASE_UNAVAILABLE', 'DATABASE_OPEN_FAILED', 'TRANSACTION_FAILED', 'NOT_FOUND', 'REFERENTIAL_INTEGRITY', 'IMMUTABLE_RECORD', 'CORRUPT_RECORD', 'DUPLICATE_RECORD'] as const)('offers safe recovery for %s without destructive defaults', (code) => {
    const error = new PianoStorageError(code, 'Stored details')
    const markup = renderToStaticMarkup(<MemoryRouter><PersistenceContext.Provider value={{ repository: null, status: 'error', error, revision: 0, retry: () => undefined }}><PersistenceErrorState title="Local history unavailable" error={error} /></PersistenceContext.Provider></MemoryRouter>)
    expect(markup).toContain('Retry local storage')
    expect(markup).toContain('Open Local Data settings')
    expect(markup).toContain('Restore backup')
    expect(markup).toContain(code)
    expect(markup).not.toContain('Clear all')
  })
})
