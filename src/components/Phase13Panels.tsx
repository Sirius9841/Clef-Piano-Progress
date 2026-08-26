import { ShieldCheck } from 'lucide-react'
import { MASTERY_MODEL_VERSION, type ArrangementMastery } from '../features/mastery-model'
import { SKILL_MODEL_VERSION, type SkillRating } from '../features/skill-model'
import { TECHNIQUE_MODULES, tonicLabel } from '../features/technique/catalog'
import { SectionHeading, StatusPill } from './ui'

function formatDate(value: string | null, includeTime = false): string {
  return value ? new Intl.DateTimeFormat(undefined, includeTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' }).format(new Date(value)) : 'Not measured'
}

function breadthLabel(skill: SkillRating): string {
  const envelope = skill.challengeEnvelope
  const bpm = envelope.targetTempoBpm ? `${envelope.targetTempoBpm.minimum}${envelope.targetTempoBpm.maximum === envelope.targetTempoBpm.minimum ? '' : `–${envelope.targetTempoBpm.maximum}`} BPM` : 'no tempo range'
  if (skill.moduleId === 'sight-reading') return `${envelope.distinctFirstPassExerciseInstances} first-pass instance${envelope.distinctFirstPassExerciseInstances === 1 ? '' : 's'} · ${envelope.tonics.length} key${envelope.tonics.length === 1 ? '' : 's'} · ${bpm}`
  if (skill.moduleId === 'scales' || skill.moduleId === 'arpeggios') return `${envelope.tonics.map(tonicLabel).join(', ') || 'No keys'} · ${envelope.modes.join(' / ') || 'no modes'} · ${envelope.octaveSpans.join(' / ') || '—'} octave · ${bpm}`
  if (skill.moduleId === 'chord-fluency') return `${envelope.tonics.length} key${envelope.tonics.length === 1 ? '' : 's'} · inversions ${envelope.chordInversions.join(', ') || '—'} · ${bpm}`
  if (skill.moduleId === 'keyboard-jumps') return `${envelope.jumpDistancesSemitones.join(', ') || '—'} semitones · ${envelope.declaredHandContexts.join(' / ') || 'no hand context'} · ${bpm}`
  if (skill.moduleId === 'tempo-control') return `${envelope.tempoShapes.join(' / ') || 'no shapes'} · ${bpm}`
  return `${envelope.declaredHandContexts.join(' / ') || 'no hand context'} · subdivisions ${envelope.subdivisions.join(', ') || '—'} · ${bpm}`
}

export function SkillRatingsPanel({ skills, clarifyProgressRange = false }: { readonly skills: readonly SkillRating[]; readonly clarifyProgressRange?: boolean }) {
  return <section className="panel skill-model-panel reveal delay-3">
    <SectionHeading title="Transferable skills" subtitle="Challenge-qualified Technique evidence. Read the quality estimate together with its evidence breadth." />
    {clarifyProgressRange && <p className="model-scope-note">Skill estimates use all eligible Technique history with their own current-state recency. The 7/30/all filter applies only to practice and performance trends.</p>}
    <div className="skill-rating-grid">{skills.map((skill) => {
      const module = TECHNIQUE_MODULES.find((candidate) => candidate.id === skill.moduleId)!
      const legacyOnly = skill.status === 'unestablished' && skill.exclusions.some((item) => item.code === 'legacy-engine')
      return <article className="skill-rating-card" key={skill.moduleId}>
        <div><span>{module.name}</span><StatusPill tone="neutral">{skill.confidence}</StatusPill></div>
        <strong>{skill.qualityEstimate === null ? 'Needs evidence' : `${skill.qualityEstimate.toFixed(1)}`}</strong>
        <small>{skill.qualityEstimate === null ? legacyOnly ? 'Historical Technique evidence is preserved, but this model requires the current 1.1.1 / 1.1.2 evidence pair.' : 'Needs current Technique evidence.' : `${skill.modelEvidenceAttemptCount} current-window take${skill.modelEvidenceAttemptCount === 1 ? '' : 's'} · ${skill.eligibleAttemptCount} eligible historical take${skill.eligibleAttemptCount === 1 ? '' : 's'}`}</small>
        <p>{skill.qualityEstimate === null ? 'No current challenge envelope yet.' : breadthLabel(skill)}</p>
        <time>{formatDate(skill.lastMeasuredAt)}</time>
      </article>
    })}</div>
    <details className="model-diagnostics"><summary>Skill model details</summary><span>{SKILL_MODEL_VERSION} · current Technique engine pair only · bounded context evidence · no overall pianist score</span></details>
  </section>
}

export function ArrangementMasteryPanel({ mastery }: { readonly mastery: ArrangementMastery }) {
  const oldVersionOnly = mastery.status === 'unestablished' && mastery.exclusions.length > 0 && mastery.exclusions.every((item) => item.code === 'different-score-version')
  const speedDetail = mastery.demonstratedSpeedStatus === 'established'
    ? `${mastery.demonstratedSpeedQualifyingAttemptCount} current supporting takes · last demonstrated ${formatDate(mastery.demonstratedSpeedLastEvidenceAt)}`
    : mastery.demonstratedSpeedStatus === 'needs-current-support'
      ? 'Older qualifying speed evidence is no longer strong enough to establish current speed.'
      : mastery.demonstratedSpeedStatus === 'needs-repetition'
        ? `${mastery.demonstratedSpeedQualifyingAttemptCount} current qualifying take${mastery.demonstratedSpeedQualifyingAttemptCount === 1 ? '' : 's'} · repeat at this speed`
        : 'No dimension-qualified full-score speed evidence yet.'
  return <section className="panel mastery-model-panel reveal delay-2">
    <div className="mastery-model-heading"><div><span className="mastery-icon"><ShieldCheck /></span><div><small>Current arrangement evidence</small><h2>Arrangement Mastery</h2><p>Current ScoreVersion only. A value near 100 means strong, recent, repeated full-score control near target speed—not artistic perfection.</p></div></div><StatusPill tone="neutral">{mastery.confidence} confidence</StatusPill></div>
    {mastery.status === 'unestablished' ? <div className="mastery-empty"><strong>Mastery needs current full-score evidence</strong><p>{oldVersionOnly ? 'Earlier ScoreVersions have preserved history, but their evidence does not carry into this score realization.' : 'Save reliable or limited full-score Notes, Rhythm, and Tempo results for this ScoreVersion.'}</p></div> : <div className="mastery-component-grid">
      <article><span>Mastery</span><strong>{mastery.mastery?.toFixed(1)}</strong><small>Qualified current state</small></article>
      <article><span>Control</span><strong>{mastery.control?.toFixed(1)}</strong><small>{mastery.minimumDimension ? `Minimum: ${mastery.minimumDimension.metric} ${mastery.minimumDimension.value.toFixed(1)}` : 'Notes · Rhythm · Tempo'}</small></article>
      <article><span>Demonstrated speed</span><strong>{mastery.demonstratedSpeedMultiplier === null ? mastery.demonstratedSpeedStatus === 'needs-current-support' ? 'Needs current repetition' : 'Needs repetition' : `${Math.round(mastery.demonstratedSpeedMultiplier * 100)}%`}</strong><small>{speedDetail}</small></article>
      <article><span>Consistency</span><strong>{mastery.consistency === null ? 'Needs repetition' : mastery.consistency.toFixed(1)}</strong><small>Robust recent control spread</small></article>
      <article><span>Last evidence</span><strong>{formatDate(mastery.lastEvidenceAt, true)}</strong><small>{mastery.evidenceAttemptIds.length} current-window take{mastery.evidenceAttemptIds.length === 1 ? '' : 's'} · {mastery.distinctSessionCount} session{mastery.distinctSessionCount === 1 ? '' : 's'}</small></article>
    </div>}
    <details className="model-diagnostics"><summary>Mastery model details</summary><span>{MASTERY_MODEL_VERSION} · current ScoreVersion · component-specific current evidence · Notes, Rhythm, and Tempo only</span></details>
  </section>
}
