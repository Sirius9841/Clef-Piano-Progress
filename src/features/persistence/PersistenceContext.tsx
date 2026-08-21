import { createContext, useContext, useEffect, useEffectEvent, useState } from 'react'
import { asPianoStorageError, type PianoStorageError } from './errors'
import type { PianoProgressRepository } from './repository'

export type PersistenceStatus = 'loading' | 'ready' | 'error'

export interface PersistenceContextValue {
  readonly repository: PianoProgressRepository | null
  readonly status: PersistenceStatus
  readonly error: PianoStorageError | null
  readonly revision: number
  readonly retry: () => void
}

export const PersistenceContext = createContext<PersistenceContextValue | null>(null)

export function usePersistence(): PersistenceContextValue {
  const context = useContext(PersistenceContext)
  if (!context) throw new Error('usePersistence must be used inside PersistenceProvider')
  return context
}

export type RepositoryQueryState<T> =
  | { readonly status: 'loading'; readonly data: null; readonly error: null }
  | { readonly status: 'ready'; readonly data: T; readonly error: null }
  | { readonly status: 'error'; readonly data: null; readonly error: PianoStorageError }

export function useRepositoryQuery<T>(loader: (repository: PianoProgressRepository) => Promise<T>, queryKey = 'default'): RepositoryQueryState<T> {
  const persistence = usePersistence()
  const runLoader = useEffectEvent(loader)
  const effectiveKey = `${queryKey}:${persistence.revision}`
  const [stored, setStored] = useState<{ readonly key: string; readonly state: RepositoryQueryState<T> } | null>(null)
  useEffect(() => {
    if (persistence.status !== 'ready' || !persistence.repository) return
    let active = true
    runLoader(persistence.repository).then((data) => {
      if (active) setStored({ key: effectiveKey, state: { status: 'ready', data, error: null } })
    }).catch((cause: unknown) => {
      if (active) setStored({ key: effectiveKey, state: { status: 'error', data: null, error: asPianoStorageError(cause) } })
    })
    return () => { active = false }
  }, [effectiveKey, persistence.repository, persistence.status])
  if (persistence.status === 'error') return { status: 'error', data: null, error: persistence.error ?? asPianoStorageError(new Error('Local storage failed.')) }
  if (persistence.status !== 'ready') return { status: 'loading', data: null, error: null }
  return stored?.key === effectiveKey ? stored.state : { status: 'loading', data: null, error: null }
}
