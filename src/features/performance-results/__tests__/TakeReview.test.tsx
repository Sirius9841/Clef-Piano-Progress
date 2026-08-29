import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { alignPerformance } from '../../alignment/alignPerformance'
import { makePlan, melodyRecording } from '../../alignment/__tests__/fixtures'
import { gradeNotes } from '../../note-grading/gradeNotes'
import { analyzeTiming } from '../../timing-analysis/analyzeTiming'
import { buildPerformanceResults } from '../buildPerformanceResults'
import { TakeReview } from '../TakeReview'
import { makeScore } from './fixtures'

const noOp = () => undefined
const source = readFileSync(new URL('../TakeReview.tsx', import.meta.url), 'utf8')

function boundedTake() {
  const plan = makePlan(Array.from({ length: 8 }, (_, index) => [60 + index]), { measureIndices: Array.from({ length: 8 }, (_, index) => index) })
  const recording = melodyRecording([60, 61, 62, 63], [0, 500, 1_000, 1_500])
  const alignment = alignPerformance(plan, recording, { localizationHint: { mode: 'beginning' } })
  const noteGrading = gradeNotes({ expectedPlan: plan, recording, alignment })
  const timingAnalysis = analyzeTiming({ expectedPlan: plan, recording, alignment, noteGrading })
  const results = buildPerformanceResults({ normalizedScore: makeScore(plan, 8, 1), expectedPlan: plan, alignment, noteGrading, timingAnalysis })
  return { recording, alignment, results }
}

describe('TakeReview', () => {
  it('shows the matched range and maps only localized measures with independent core dimensions', () => {
    const take = boundedTake()
    const html = renderToStaticMarkup(<TakeReview {...take} practiceSpeed={1} expression={null} pedal={null} voicing={null} onConfirmRegion={noOp} onHighlightChange={noOp} />)

    expect(html).toContain('Matched score region · M1–M4')
    expect(html).toContain('Independent core dimensions')
    expect(html).toContain('>M1</button>')
    expect(html).toContain('>M4</button>')
    expect(html).not.toContain('>M5</button>')
    expect(html).not.toContain('overall score')
    expect(html).not.toContain('Mistake navigator')
    expect(html).toContain('Open detailed analysis for event-level evidence')
    expect(source).toContain('.slice(0, 5)')
    expect(source).not.toMatch(/focused section|focus section/i)
  })

  it('shows competing repeated regions and confirmation controls without headline grades', () => {
    const pattern = [[60], [62], [64], [65]]
    const plan = makePlan([...pattern, [80], [81], ...pattern])
    const recording = melodyRecording([60, 62, 64, 65], [0, 500, 1_000, 1_500])
    const alignment = alignPerformance(plan, recording, { localizationHint: { mode: 'auto' } })
    const html = renderToStaticMarkup(<TakeReview alignment={alignment} recording={recording} practiceSpeed={1} results={null} expression={null} pedal={null} voicing={null} onConfirmRegion={noOp} onHighlightChange={noOp} />)

    expect(html).toContain('Score region unresolved')
    expect(html).toContain('Candidate A')
    expect(html).toContain('Confirm this region')
    expect(html).toContain('remain unavailable until the score region is resolved')
  })

  it('keeps seven dimensions independent and compactly names unavailable Pedal and Voicing truth', () => {
    for (const label of ['Notes', 'Rhythm', 'Tempo', 'Dynamics', 'Articulation', 'Pedal', 'Voicing']) expect(source).toContain(`label: '${label}'`)
    expect(source).toContain('CC64 activity captured')
    expect(source).toContain('no authored pedal target in this score')
    expect(source).toContain('Not configured · explicit foreground/support intent is required')
    expect(source).not.toContain('Expression score')
    expect(source).not.toContain('Overall Performance Score')
  })
})
