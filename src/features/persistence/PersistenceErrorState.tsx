import { AlertCircle, RefreshCw, Settings, Upload } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '../../components/ui'
import type { PianoStorageError } from './errors'
import { usePersistence } from './PersistenceContext'

export function PersistenceErrorState({ title, error }: { title: string; error: PianoStorageError }) {
  const persistence = usePersistence()
  const guidance: Record<PianoStorageError['code'], string> = {
    DATABASE_UNAVAILABLE: 'This browser cannot provide the local database Clef needs. Other pages may remain available, but saved musical history cannot be read here.',
    DATABASE_OPEN_FAILED: 'The browser could not open Clef’s local database. Closing another Clef tab or retrying may help.',
    TRANSACTION_FAILED: 'A browser storage operation failed. Existing data was not intentionally cleared; retry before taking another action.',
    NOT_FOUND: 'The requested local record is no longer available.',
    REFERENTIAL_INTEGRITY: 'Related local records do not agree. Verify integrity in Settings before changing data.',
    IMMUTABLE_RECORD: 'Clef refused a change that would overwrite frozen historical evidence.',
    CORRUPT_RECORD: 'A local record did not pass Clef’s structural checks. Verify integrity or inspect a known-good backup.',
    DUPLICATE_RECORD: 'Clef found a conflicting local identity and refused to overwrite it.',
  }
  return <div className="empty-state persistence-error-state"><AlertCircle /><h2>{title}</h2><p>{guidance[error.code]}</p><p>{error.message}</p><div><Button variant="secondary" icon={RefreshCw} onClick={persistence.retry}>Retry local storage</Button><Link className="button secondary" to="/settings"><Settings size={16} /> Open Local Data settings</Link><Link className="button ghost" to="/settings"><Upload size={16} /> Restore backup</Link></div><details><summary>Technical diagnostics</summary><code>{error.code}</code></details></div>
}
