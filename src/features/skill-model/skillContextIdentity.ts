import type { TechniqueAttemptSummaryV2 } from '../persistence/types'
import type { TechniqueModuleId } from '../technique/types'

type IdentityValue = string | number
export type SkillContextDimension = 'templateId' | 'tonic' | 'mode' | 'declaredHandContext' | 'targetTempoBpm' | 'subdivision' | 'eventCount' | 'chordInversion' | 'octaveSpan' | 'direction' | 'jumpSemitones' | 'tempoShape'
export type SkillTonicSemantics = 'tonal-key' | 'starting-pitch'

export interface SkillContextDefinition {
  readonly dimensions: readonly SkillContextDimension[]
  readonly tonicSemantics: SkillTonicSemantics
}

function contextDefinition(dimensions: readonly SkillContextDimension[], tonicSemantics: SkillTonicSemantics): SkillContextDefinition {
  return Object.freeze({ dimensions: Object.freeze(dimensions), tonicSemantics })
}

/**
 * Authored challenge dimensions that materially change each module's drill.
 * Seed and generated instance identity are deliberately excluded. Template identity is always included.
 */
export const SKILL_CONTEXT_DEFINITIONS: Readonly<Record<TechniqueModuleId, SkillContextDefinition>> = Object.freeze({
  'sight-reading': contextDefinition(['templateId', 'tonic', 'mode', 'declaredHandContext', 'targetTempoBpm', 'subdivision', 'eventCount'], 'tonal-key'),
  rhythm: contextDefinition(['templateId', 'tonic', 'declaredHandContext', 'targetTempoBpm', 'subdivision', 'eventCount'], 'starting-pitch'),
  'chord-fluency': contextDefinition(['templateId', 'tonic', 'mode', 'declaredHandContext', 'targetTempoBpm', 'subdivision', 'chordInversion', 'eventCount'], 'tonal-key'),
  scales: contextDefinition(['templateId', 'tonic', 'mode', 'declaredHandContext', 'targetTempoBpm', 'subdivision', 'octaveSpan', 'direction'], 'tonal-key'),
  arpeggios: contextDefinition(['templateId', 'tonic', 'mode', 'declaredHandContext', 'targetTempoBpm', 'subdivision', 'octaveSpan', 'direction'], 'tonal-key'),
  octaves: contextDefinition(['templateId', 'tonic', 'declaredHandContext', 'targetTempoBpm', 'subdivision', 'eventCount'], 'starting-pitch'),
  'keyboard-jumps': contextDefinition(['templateId', 'tonic', 'declaredHandContext', 'targetTempoBpm', 'subdivision', 'jumpSemitones', 'eventCount'], 'starting-pitch'),
  'tempo-control': contextDefinition(['templateId', 'tonic', 'declaredHandContext', 'targetTempoBpm', 'subdivision', 'tempoShape', 'eventCount'], 'starting-pitch'),
})

export const SKILL_CONTEXT_DIMENSIONS: Readonly<Record<TechniqueModuleId, readonly SkillContextDimension[]>> = Object.freeze(Object.fromEntries(
  Object.entries(SKILL_CONTEXT_DEFINITIONS).map(([moduleId, definition]) => [moduleId, definition.dimensions]),
) as Record<TechniqueModuleId, readonly SkillContextDimension[]>)

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
  return SKILL_CONTEXT_DEFINITIONS[summary.moduleId].dimensions.map((dimension) => [dimension, values[dimension]!] as const)
}

export function skillContextUsesDimension(moduleId: TechniqueModuleId, dimension: SkillContextDimension): boolean {
  return SKILL_CONTEXT_DEFINITIONS[moduleId].dimensions.includes(dimension)
}

export function skillContextId(summary: TechniqueAttemptSummaryV2): string {
  return JSON.stringify([summary.moduleId, identityEntries(summary)])
}
