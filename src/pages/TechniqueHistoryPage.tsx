import { ChevronLeft, History } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { PageHeader, StatusPill } from '../components/ui'
import { useRepositoryQuery } from '../features/persistence/PersistenceContext'
import { OsmdScoreRenderer } from '../features/score-renderer/OsmdScoreRenderer'
import { TechniqueResultPanel } from '../features/technique/TechniqueResultPanel'

export function TechniqueHistoryPage() {
  const { attemptId = '' } = useParams()
  const attempt = useRepositoryQuery((repository) => repository.getTechniqueAttempt(attemptId), `technique-history:${attemptId}`)
  if (attempt.status === 'loading') return <div className="page"><PageHeader title="Opening frozen Technique take…" /></div>
  if (attempt.status === 'error' || !attempt.data) return <div className="page"><PageHeader title="Technique take unavailable" description={attempt.status === 'error' ? attempt.error.message : 'No saved record has this identity.'} /><Link to="/technique">Back to Technique Lab</Link></div>
  const record = attempt.data
  return <div className="page"><PageHeader eyebrow="Read-only local history" title={record.exercise.title} description={`Performed ${new Date(record.performedAt).toLocaleString()}`} action={<StatusPill tone="neutral"><History size={13} /> Frozen V{record.schemaVersion} snapshot · {record.engineVersions.exercise} / {record.engineVersions.techniqueAnalysis}</StatusPill>} /><Link className="button ghost" to="/technique"><ChevronLeft size={14} /> Technique Lab</Link><section className="panel challenge-profile"><strong>Exact challenge</strong><span>{record.exercise.challenge.targetTempoBpm} BPM · {record.exercise.challenge.eventCount} events · instance {record.exerciseInstanceId} · {record.novelty.firstSavedAttempt ? 'first saved encounter' : 'repeat encounter'}</span></section><section className="panel notation-panel"><div className="notation-paper"><OsmdScoreRenderer musicXmlText={record.exercise.generatedMusicXml} zoom={.78} /></div></section><TechniqueResultPanel result={record.techniqueAnalysis} /><p className="honest-notice">Historical Technique evidence is displayed from its saved snapshots. It is never silently regenerated with current engines.</p></div>
}
