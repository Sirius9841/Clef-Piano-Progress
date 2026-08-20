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

export type RepertoireStatus = 'Learning' | 'Practicing' | 'Performance Ready' | 'Completed'
export type Difficulty = 'Foundation' | 'Intermediate' | 'Advanced'

export interface Arrangement {
  id: EntityId
  workId: EntityId
  name: string
  difficulty: Difficulty
  source: 'curated' | 'user-imported'
  targetTempoBpm?: number
}

export interface ScoreVersion {
  id: EntityId
  arrangementId: EntityId
  version: number
  format: 'musicxml' | 'mxl'
  createdAt: string
  sourceFileName: string
  checksum?: string
}

export type PerformanceMetricName =
  | 'noteAccuracy'
  | 'rhythm'
  | 'tempo'
  | 'dynamics'
  | 'articulation'

export type PerformanceMetrics = Record<PerformanceMetricName, number>

export interface PerformanceAttempt {
  id: EntityId
  arrangementId: EntityId
  scoreVersionId: EntityId
  gradingEngineVersion: string
  performedAt: string
  durationSeconds: number
  overallScore?: number
  metrics?: Partial<PerformanceMetrics>
  rawMidiReference?: string
}

export interface ArrangementProgress {
  arrangementId: EntityId
  status: RepertoireStatus
  mastery: number
  cleanTempoBpm: number
  latestPerformanceScore: number
  bestPerformanceScore: number
  recentChange: number
  lastPracticedAt: string
}

export type SkillName =
  | 'Sight Reading'
  | 'Rhythm'
  | 'Dynamics'
  | 'Chord Fluency'
  | 'Scales'
  | 'Arpeggios'
  | 'Octaves'
  | 'Tempo Control'
  | 'Keyboard Jumps'

export interface SkillRating {
  name: SkillName
  rating: number
  recentChange: number
  latestSessionAt?: string
}

export interface RepertoireItem {
  work: Work
  arrangement: Arrangement
  progress: ArrangementProgress
}
