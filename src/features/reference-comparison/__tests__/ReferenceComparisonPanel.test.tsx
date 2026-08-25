import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { musicalTime } from '../../musicxml/musicalTime'
import { compareInterpretations } from '../compareInterpretations'
import { HistoricalReferenceComparisonPanel } from '../HistoricalReferenceComparisonPanel'
import { ReferenceComparisonPanel } from '../ReferenceComparisonPanel'
import type { InterpretationProfile } from '../types'

function profile(id: string, value: number): InterpretationProfile { return { attemptId: id, arrangementId: 'a', scoreVersionId: 's', includedPartIds: ['P1'], performedAt: '2026-08-25T12:00:00.000Z', practiceSpeed: 1, schemaVersion: 4, recordingId: `r:${id}`, scope: { type: 'full-plan', start: musicalTime(0), end: musicalTime(4), expectedStartGroupId: 'g0', expectedEndGroupId: 'g4' }, tempoShape: [{ key: 't', position: musicalTime(2), measureNumbers: ['2'], centeredLogShape: value, performedQuarterBpm: 100 }], dynamicsGestures: [], articulationGestures: [], pedalGestures: [], voicingGestures: [], reliability: { tempo: 'reliable', dynamics: 'limited', articulation: 'limited', pedal: 'limited', voicing: 'limited' }, evidenceVersions: {} } }

describe('Reference comparison presentation', () => {
  it('uses neutral language, accessible tempo chart, and no aggregate percentage', () => {
    const result = compareInterpretations({ current: profile('current', 0.15), reference: profile('reference', 0), currentVoicingAnalysisId: 'v' })
    const html = renderToStaticMarkup(<ReferenceComparisonPanel analysis={{ status: 'ready', result }} readOnly />)
    expect(html).toContain('Centered tempo-shape comparison')
    expect(html).toContain('Differences are descriptive')
    expect(html).not.toMatch(/wrong|incorrect|worse|failed/i)
    expect(html).not.toContain('Reference accuracy')
  })

  it('labels pre-Phase-11 history without reanalysis', () => {
    const html = renderToStaticMarkup(<HistoricalReferenceComparisonPanel result={null} />)
    expect(html).toContain('No saved Phase 11 comparison')
  })
})
