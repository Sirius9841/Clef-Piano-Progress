export type EntityId = string

export interface WorkMetadata {
  year?: number
  genre?: string
  catalogNumber?: string
}

export interface Work {
  id: EntityId
  title: string
  composer: string
  metadata?: WorkMetadata
  derivedFromWorkId?: EntityId
}

export const REPERTOIRE_STATUSES = ['Learning', 'Practicing', 'Performance Ready', 'Completed'] as const
export type RepertoireStatus = (typeof REPERTOIRE_STATUSES)[number]
export function isRepertoireStatus(value: unknown): value is RepertoireStatus {
  return typeof value === 'string' && REPERTOIRE_STATUSES.some((status) => status === value)
}
export type Difficulty = 'Foundation' | 'Intermediate' | 'Advanced'

export interface Arrangement {
  id: EntityId
  workId: EntityId
  name: string
  difficulty: Difficulty
  source: 'curated' | 'user-imported'
  targetTempoBpm?: number
}
