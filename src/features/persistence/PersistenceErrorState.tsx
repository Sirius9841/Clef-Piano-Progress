import { AlertCircle, RefreshCw } from 'lucide-react'
import { Button } from '../../components/ui'
import type { PianoStorageError } from './errors'
import { usePersistence } from './PersistenceContext'

export function PersistenceErrorState({ title, error }: { title: string; error: PianoStorageError }) {
  const persistence = usePersistence()
  return <div className="empty-state"><AlertCircle /><h2>{title}</h2><p>{error.message}</p><Button variant="secondary" icon={RefreshCw} onClick={persistence.retry}>Retry local storage</Button></div>
}
