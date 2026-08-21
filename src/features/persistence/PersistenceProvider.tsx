import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { PianoStorageError, asPianoStorageError } from './errors'
import { IndexedDbPianoProgressRepository } from './indexedDbRepository'
import { PersistenceContext, type PersistenceStatus } from './PersistenceContext'
import type { PianoProgressRepository } from './repository'

function createBrowserRepository(): PianoProgressRepository | null {
  try { return new IndexedDbPianoProgressRepository() } catch { return null }
}

export function PersistenceProvider({ children, repository: providedRepository }: { children: ReactNode; repository?: PianoProgressRepository }) {
  const [repository] = useState<PianoProgressRepository | null>(() => providedRepository ?? createBrowserRepository())
  const [status, setStatus] = useState<PersistenceStatus>(repository ? 'loading' : 'error')
  const [error, setError] = useState<PianoStorageError | null>(() => repository ? null : new PianoStorageError('DATABASE_UNAVAILABLE', 'IndexedDB is unavailable in this browser.'))
  const [revision, setRevision] = useState(0)
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    if (!repository) return
    let active = true
    repository.initialize().then(() => {
      if (!active) return
      setError(null)
      setStatus('ready')
    }).catch((cause: unknown) => {
      if (!active) return
      setError(asPianoStorageError(cause))
      setStatus('error')
    })
    return () => { active = false }
  }, [repository, retryKey])
  useEffect(() => repository?.subscribe(() => setRevision((value) => value + 1)), [repository])
  const retry = useCallback(() => { setStatus('loading'); setRetryKey((value) => value + 1) }, [])
  const value = useMemo(() => ({ repository, status, error, revision, retry }), [error, repository, retry, revision, status])
  return <PersistenceContext.Provider value={value}>{children}</PersistenceContext.Provider>
}
