import { PageHeader } from '../components/ui'
import { ArrangementMasteryPanel, SkillRatingsPanel } from '../components/Phase13Panels'
import { deriveArrangementMastery } from '../features/mastery-model'
import type { AttemptSummary, TechniqueAttemptSummary, TechniqueAttemptSummaryV2 } from '../features/persistence/types'
import { deriveAllSkillRatings } from '../features/skill-model'
import type { TechniqueChallengeProfileV2, TechniqueFacetId, TechniqueModuleId } from '../features/technique/types'

const AS_OF = '2026-08-26T12:00:00.000Z'
const FACETS: Readonly<Record<TechniqueModuleId, readonly TechniqueFacetId[]>> = {
  'sight-reading': ['note-accuracy', 'pulse-continuity'], rhythm: ['rhythm-precision', 'pulse-continuity'],
  'chord-fluency': ['chord-accuracy', 'chord-synchronization'], scales: ['note-accuracy', 'onset-evenness', 'direction-change-continuity'],
  arpeggios: ['note-accuracy', 'arpeggio-transition-consistency'], octaves: ['octave-integrity', 'onset-evenness'],
  'keyboard-jumps': ['landing-accuracy', 'jump-timing-consistency', 'recovery-continuity'],
  'tempo-control': ['target-tempo-control', 'tempo-stability', 'tempo-transition-control'],
}

function challenge(moduleId: TechniqueModuleId, index: number): TechniqueChallengeProfileV2 {
  return { targetTempoBpm: 72 + index * 4, eventCount: 16, expectedDuration: { numerator: 4, denominator: 1 }, expectedDurationMs: 3_000,
    minimumMidi: 60, maximumMidi: 72, pitchSpanSemitones: 12, maximumChordSize: moduleId === 'chord-fluency' ? 3 : 1,
    maximumJumpSemitones: moduleId === 'keyboard-jumps' ? 12 : 2, rhythmicDensity: 4, smallestSubdivision: 4,
    tempoChangeCount: moduleId === 'tempo-control' ? 4 : 0, octaveSpan: index % 2 ? 2 : 1, moduleSpecific: {}, tonic: index % 12,
    mode: index % 2 ? 'natural-minor' : 'major', declaredHandContext: index % 3 === 0 ? 'both' : index % 2 ? 'left' : 'right',
    direction: moduleId === 'scales' && index % 2 ? 'both' : 'ascending', subdivision: 4, chordInversion: index % 3 as 0 | 1 | 2,
    jumpSemitones: index % 2 ? 24 : 7, tempoShape: moduleId === 'tempo-control' ? index % 2 ? 'arch' : 'accelerate' : 'steady' }
}

function techniqueSummary(moduleId: TechniqueModuleId, index: number, score: number): TechniqueAttemptSummaryV2 {
  const profile = challenge(moduleId, index)
  const applicable = FACETS[moduleId].filter((id) => !(moduleId === 'scales' && profile.direction !== 'both' && id === 'direction-change-continuity'))
  return { schemaVersion: 2, id: `qa-${moduleId}-${index}`, moduleId, templateId: `${moduleId}-standard-v2`, exerciseInstanceId: `qa-instance-${moduleId}-${index}`,
    performedAt: `2026-08-${String(10 + index).padStart(2, '0')}T12:00:00.000Z`, durationMs: 3_000, exerciseEngineVersion: 'technique-exercise-1.1.1', techniqueAnalysisEngineVersion: 'technique-analysis-1.1.2', challenge: profile,
    completion: { expectedEventCount: 16, attemptedEventCount: 16, completeCorrectOrIncorrectEventCount: 16, reachedSpanEndIndex: 15, eventCoverageRatio: .9, spanReachedRatio: 1, completeEnoughForEvidence: true },
    novelty: { exerciseInstanceId: `qa-instance-${moduleId}-${index}`, priorSavedAttemptCount: 0, firstSavedAttempt: true },
    facets: applicable.map((id) => ({ id, label: id, status: 'ready', score, reliability: 'reliable', evidenceCount: 8, eligibleCount: 8, coverage: .9, evidenceFamily: id.includes('accuracy') || id.includes('integrity') ? 'pitch' : id.includes('tempo') ? 'tempo' : 'interval-precision', evidenceContext: moduleId === 'sight-reading' ? 'first-pass' : 'technical-drill', minimumEvidence: 4 })),
  }
}

function skillFixture(scenario: string): readonly TechniqueAttemptSummary[] {
  if (scenario === 'legacy') return [{ ...techniqueSummary('scales', 0, 88), exerciseEngineVersion: 'technique-exercise-1.1.0', techniqueAnalysisEngineVersion: 'technique-analysis-1.1.0' } as TechniqueAttemptSummary]
  if (scenario === 'one') return [techniqueSummary('scales', 0, 94)]
  if (scenario === 'several') return (['sight-reading', 'rhythm', 'scales', 'keyboard-jumps'] as const).flatMap((moduleId, moduleIndex) => [techniqueSummary(moduleId, moduleIndex, 78 + moduleIndex * 3), techniqueSummary(moduleId, moduleIndex + 1, 80 + moduleIndex * 3)])
  if (scenario === 'narrow') return Array.from({ length: 8 }, (_, index) => ({ ...techniqueSummary('scales', index, 98), challenge: challenge('scales', 0) }))
  if (scenario === 'broad') return Array.from({ length: 10 }, (_, index) => techniqueSummary('scales', index, 74))
  if (scenario === 'stale') return [0, 2, 4, 6].flatMap((tonic, contextIndex) => [0, 1].map((repeat) => ({ ...techniqueSummary('scales', contextIndex * 2 + repeat, 94), performedAt: `2022-01-0${repeat + 1}T12:00:00.000Z`, challenge: { ...challenge('scales', contextIndex), tonic } })))
  if (scenario === 'provenance') return (['rhythm', 'chord-fluency', 'octaves', 'keyboard-jumps', 'tempo-control'] as const).flatMap((moduleId, moduleIndex) => [0, 1].map((variant) => {
    const source = techniqueSummary(moduleId, moduleIndex * 2 + variant, 86)
    return { ...source, templateId: variant === 0 ? `${moduleId}-standard-v2` : `${moduleId}-alternate-v2`, challenge: { ...source.challenge, tonic: variant === 0 ? 0 : 7, subdivision: variant === 0 ? 1 : 4 } }
  }))
  return []
}

function attempt(id: string, speed = 1, score = .92, scoreVersionId = 'score-current', performedAt = '2026-08-20T12:00:00.000Z', practiceSessionId = `session-${id}`): AttemptSummary {
  return { id, arrangementId: 'qa-arrangement', scoreVersionId, practiceSessionId, performedAt, durationMs: 60_000, practiceSpeedMultiplier: speed, gradingScope: 'full-plan', reliability: 'reliable', notes: score, rhythm: score, tempo: score }
}

function masteryFixture(scenario: string): readonly AttemptSummary[] {
  if (scenario === 'limited') return [attempt('limited')]
  if (scenario === 'reduced') return [attempt('reduced-1', .6), attempt('reduced-2', .6)]
  if (scenario === 'full') return Array.from({ length: 5 }, (_, index) => attempt(`full-${index}`, 1, .94 - index * .005))
  if (scenario === 'recent-100') return [attempt('recent-100-a'), attempt('recent-100-b')]
  if (scenario === 'same-session-100') return [attempt('same-100-a', 1, .94, 'score-current', '2026-08-24T12:00:00.000Z', 'S1'), attempt('same-100-b', 1, .94, 'score-current', '2026-08-23T12:00:00.000Z', 'S1')]
  if (scenario === 'current-multi-100') return [attempt('full-a', 1, .94, 'score-current', '2026-08-24T12:00:00.000Z', 'S1'), attempt('full-b', 1, .94, 'score-current', '2026-08-23T12:00:00.000Z', 'S2'), attempt('lower-c', .8, .92, 'score-current', '2026-08-22T12:00:00.000Z', 'S3'), attempt('lower-d', .8, .92, 'score-current', '2026-08-21T12:00:00.000Z', 'S4'), attempt('lower-e', .8, .92, 'score-current', '2026-08-20T12:00:00.000Z', 'S5')]
  if (scenario === 'stale-second-session') return [attempt('full-a', 1, .94, 'score-current', '2026-08-24T12:00:00.000Z', 'S1'), attempt('full-b', 1, .94, 'score-current', '2026-08-23T12:00:00.000Z', 'S1'), attempt('full-old-c', 1, .94, 'score-current', '2025-08-20T12:00:00.000Z', 'S2'), attempt('lower-d', .8, .92, 'score-current', '2026-08-22T12:00:00.000Z', 'S3'), attempt('lower-e', .8, .92, 'score-current', '2026-08-21T12:00:00.000Z', 'S4'), attempt('lower-f', .8, .92, 'score-current', '2026-08-20T12:00:00.000Z', 'S5')]
  if (scenario === 'recent-60') return [attempt('recent-60-a', .6), attempt('recent-60-b', .6)]
  if (scenario === 'stale-mixed') return [attempt('old-full-a', 1, .95, 'score-current', '2025-08-20T12:00:00.000Z'), attempt('old-full-b', 1, .95, 'score-current', '2025-08-19T12:00:00.000Z'), attempt('recent-60', .6)]
  if (scenario === 'old') return [attempt('old-1', 1, .95, 'score-old'), attempt('old-2', 1, .95, 'score-old')]
  return []
}

export function Phase13QaPage() {
  const params = new URLSearchParams(window.location.search)
  const skillScenario = params.get('skill') ?? 'none'
  const masteryScenario = params.get('mastery') ?? 'none'
  const skills = deriveAllSkillRatings(skillFixture(skillScenario), AS_OF)
  const mastery = deriveArrangementMastery({ arrangementId: 'qa-arrangement', scoreVersionId: 'score-current', attempts: masteryFixture(masteryScenario), asOf: AS_OF })
  return <div className="page"><PageHeader eyebrow="Development-only visual review" title="Phase 13.2 QA fixtures" description="Static, explicitly labeled fixtures for responsive presentation checks. They are not persisted and make no product claims." /><p className="qa-fixture-label">Visual QA fixture · Skill: {skillScenario} · not saved evidence</p><SkillRatingsPanel skills={skills} clarifyProgressRange /><p className="qa-fixture-label">Visual QA fixture · Mastery: {masteryScenario} · not saved evidence</p><ArrangementMasteryPanel mastery={mastery} /><section className="panel local-data-actions"><div><strong>Manual repertoire status: Learning</strong><p>This fixture demonstrates that user-controlled status remains independent from derived Mastery.</p></div></section></div>
}
