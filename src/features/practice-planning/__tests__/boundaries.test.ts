import { describe, expect, it } from 'vitest'
import { PERSISTENCE_SCHEMA_VERSION } from '../../persistence/types'
import indexedDbSource from '../../persistence/indexedDbRepository.ts?raw'
import persistenceTypesSource from '../../persistence/types.ts?raw'
import evidenceSource from '../evidence.ts?raw'
import indexSource from '../index.ts?raw'
import optionsSource from '../options.ts?raw'
import prepareContextSource from '../prepareContext.ts?raw'
import recommendationsSource from '../recommendations.ts?raw'
import sectionIdentitySource from '../sectionIdentity.ts?raw'
import sessionPlanSource from '../sessionPlan.ts?raw'
import typesSource from '../types.ts?raw'
import utilsSource from '../utils.ts?raw'
import { PRACTICE_PLANNING_MODEL_VERSION } from '../types'
import { derivePracticePlanning } from '../recommendations'
import { preparePracticePlanningContext } from '../prepareContext'
import { createPlanningSectionIdentity } from '../sectionIdentity'
import { attemptFixture, repositoryFixture } from './fixtures'

const AS_OF = '2026-08-26T12:00:00.000Z'
const CORE_SOURCE = [indexSource, typesSource, optionsSource, sectionIdentitySource, evidenceSource, recommendationsSource, sessionPlanSource, prepareContextSource, utilsSource].join('\n')

describe('Practice Planning architectural boundaries', () => {
  it('uses the frozen Phase 14 model version', () => {
    expect(PRACTICE_PLANNING_MODEL_VERSION).toBe('practice-planning-1.0.1')
  })

  it('has no React or OSMD dependency in the planning core', () => {
    expect(CORE_SOURCE).not.toMatch(/(?:from|import\s*)\s*['"]react(?:\/[^'"]*)?['"]/i)
    expect(CORE_SOURCE).not.toMatch(/opensheetmusicdisplay|\bosmd\b/i)
  })

  it('keeps IndexedDB schema 4 with the existing store family and no V5 record type', () => {
    expect(PERSISTENCE_SCHEMA_VERSION).toBe(4)
    expect(indexedDbSource).not.toMatch(/practicePlans?|recommendations?/i)
    expect(persistenceTypesSource).not.toMatch(/PerformanceAttemptRecordV5|TechniqueAttempt(?:Record|Summary)V3/)
    expect(indexedDbSource.match(/createObjectStore\(/g)).toHaveLength(9)
  })

  it('canonicalizes source IDs while preserving exact score and measure bounds', () => {
    const identity = createPlanningSectionIdentity('score-v1', {
      startMeasureIndex: 4,
      endMeasureIndex: 7,
      sourceMeasureIds: ['measure-b', 'measure-a', 'measure-b'],
      displayRange: 'Measures 5–8',
    })
    expect(identity).toEqual({
      id: JSON.stringify(['score-v1', 4, 7, ['measure-a', 'measure-b']]),
      scoreVersionId: 'score-v1',
      startMeasureIndex: 4,
      endMeasureIndex: 7,
      sourceMeasureIds: ['measure-a', 'measure-b'],
      displayRange: 'Measures 5–8',
    })
  })

  it('returns stable serializable semantics without an overall practice score', async () => {
    const fixtures = [
      attemptFixture('a', { sessionId: 'S1', score: 0.55 }),
      attemptFixture('b', { sessionId: 'S2', score: 0.58, performedAt: '2026-08-23T12:00:00.000Z' }),
    ]
    const firstSource = repositoryFixture(fixtures)
    const secondSource = repositoryFixture([...fixtures].reverse())
    const first = derivePracticePlanning(await preparePracticePlanningContext({ repository: firstSource.repository, arrangementId: 'arrangement-1', scoreVersionId: 'score-version-1', asOf: AS_OF }), { availableMinutes: 15 })
    const second = derivePracticePlanning(await preparePracticePlanningContext({ repository: secondSource.repository, arrangementId: 'arrangement-1', scoreVersionId: 'score-version-1', asOf: AS_OF }), { availableMinutes: 15 })
    expect(JSON.stringify(first)).toBe(JSON.stringify(second))
    expect(JSON.parse(JSON.stringify(first))).toEqual(first)
    expect(first).not.toHaveProperty('practiceScore')
    expect(first).not.toHaveProperty('overallScore')
    expect(first.recommendations.map((item) => item.rank)).toEqual(first.recommendations.map((_, index) => index + 1))
  })
})
