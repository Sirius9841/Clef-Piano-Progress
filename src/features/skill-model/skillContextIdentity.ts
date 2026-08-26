import type { TechniqueAttemptSummaryV2 } from '../persistence/types'
import type { TechniqueModuleId } from '../technique/types'

type IdentityValue = string | number
export type SkillContextDimension = 'templateId' | 'tonic' | 'mode' | 'declaredHandContext' | 'targetTempoBpm' | 'subdivision' | 'eventCount' | 'chordInversion' | 'octaveSpan' | 'direction' | 'jumpSemitones' | 'tempoShape'

/**
 * Authored challenge dimensions that materially change each module's drill.
 * Seed and generated instance identity are deliberately excluded. Template identity is always included.
 */
export const SKILL_CONTEXT_DIMENSIONS: Readonly<Record<TechniqueModuleId, readonly SkillContextDimension[]>> = Object.freeze({
  'sight-reading': ['templateId', 'tonic', 'mode', 'declaredHandContext', 'targetTempoBpm', 'subdivision', 'eventCount'],
  rhythm: ['templateId', 'tonic', 'declaredHandContext', 'targetTempoBpm', 'subdivision', 'eventCount'],
  'chord-fluency': ['templateId', 'tonic', 'mode', 'declaredHandContext', 'targetTempoBpm', 'subdivision', 'chordInversion', 'eventCount'],
  scales: ['templateId', 'tonic', 'mode', 'declaredHandContext', 'targetTempoBpm', 'subdivision', 'octaveSpan', 'direction'],
  arpeggios: ['templateId', 'tonic', 'mode', 'declaredHandContext', 'targetTempoBpm', 'subdivision', 'octaveSpan', 'direction'],
  octaves: ['templateId', 'tonic', 'declaredHandContext', 'targetTempoBpm', 'subdivision', 'eventCount'],
  'keyboard-jumps': ['templateId', 'tonic', 'declaredHandContext', 'targetTempoBpm', 'subdivision', 'jumpSemitones', 'eventCount'],
  'tempo-control': ['templateId', 'tonic', 'declaredHandContext', 'targetTempoBpm', 'subdivision', 'tempoShape', 'eventCount'],
})

function identityEntries(summary: TechniqueAttemptSummaryV2): readonly (readonly [string, IdentityValue])[] {
  const challenge = summary.challenge
  const values: Readonly<Record<SkillContextDimension, IdentityValue>> = {
    templateId: summary.templateId,
    tonic: challenge.tonic,
    mode: challenge.mode,
    declaredHandContext: challenge.declaredHandContext,
    targetTempoBpm: challenge.targetTempoBpm,
    subdivision: challenge.subdivision,
    eventCount: challenge.eventCount,
    chordInversion: challenge.chordInversion,
    octaveSpan: challenge.octaveSpan,
    direction: challenge.direction,
    jumpSemitones: challenge.jumpSemitones,
    tempoShape: challenge.tempoShape,
  }
  return SKILL_CONTEXT_DIMENSIONS[summary.moduleId].map((dimension) => [dimension, values[dimension]!] as const)
}

export function skillContextId(summary: TechniqueAttemptSummaryV2): string {
  return JSON.stringify([summary.moduleId, identityEntries(summary)])
}
