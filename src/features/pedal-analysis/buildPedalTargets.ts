import type { AlignmentResult } from '../alignment/types'
import type { ExpectedPerformancePlan } from '../expected-performance/types'
import { compareTime, ZERO_TIME, type MusicalTime } from '../musicxml/musicalTime'
import type { NormalizedScore, PedalEvent } from '../musicxml/types'
import type { NoteGradingResult } from '../note-grading/types'
import { notationLaneCompatible } from '../expression-analysis/notationLane'
import { createPedalTimingAnchorResolver } from './pedalTimingAnchors'
import { resolvePedalAnalysisOptions, type PedalAnalysisOptions } from './options'
import type { PedalExclusion, PedalPhraseTarget, PedalScope, PedalTargetEvent, PedalWarning } from './types'

export interface BuiltPedalTargets {
  readonly targets: PedalPhraseTarget[]
  readonly exclusions: PedalExclusion[]
  readonly warnings: PedalWarning[]
}

interface OpenPhrase {
  readonly start: PedalEvent
  readonly events: PedalEvent[]
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 0x01000193) }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function pedalScope(noteGrading: NoteGradingResult): PedalScope {
  return {
    type: noteGrading.scope.type,
    expectedStartIndex: noteGrading.scope.expectedStartIndex,
    expectedEndIndex: noteGrading.scope.expectedEndIndex,
    expectedStartGroupId: noteGrading.scope.expectedStartGroupId,
    expectedEndGroupId: noteGrading.scope.expectedEndGroupId,
  }
}

function scopeBounds(plan: ExpectedPerformancePlan, alignment: AlignmentResult, scope: PedalScope): { start: MusicalTime; end: MusicalTime } | null {
  if (scope.type === 'full-plan') return { start: ZERO_TIME, end: plan.statistics.totalScoreDuration }
  if (scope.expectedStartIndex === null || scope.expectedEndIndex === null) return null
  const start = alignment.expectedGroups[scope.expectedStartIndex]?.position
  const end = alignment.expectedGroups[scope.expectedEndIndex]?.position
  return start && end ? { start, end } : null
}

function targetEvent(event: PedalEvent, timingAnchor: NonNullable<PedalTargetEvent['timingAnchor']>): PedalTargetEvent {
  return {
    id: `pedal-target-event:${stableHash(event.id)}`,
    kind: event.type as 'start' | 'change' | 'stop',
    sourceEventId: event.id,
    position: { ...event.position },
    expectedPerformedMs: timingAnchor.anchoredPerformedMs,
    timingAnchor,
    measureIndex: event.measureIndex,
    measureNumber: event.measureNumber,
  }
}

export function buildPedalTargets(score: NormalizedScore, plan: ExpectedPerformancePlan, alignment: AlignmentResult, noteGrading: NoteGradingResult, partialOptions: Partial<PedalAnalysisOptions> = {}): BuiltPedalTargets {
  const options = resolvePedalAnalysisOptions(partialOptions)
  const timingAnchorFor = createPedalTimingAnchorResolver(plan, alignment, options)
  const included = new Set(plan.includedPartIds)
  const events = score.pedalEvents.filter((event) => included.has(event.partId)).sort((left, right) => compareTime(left.position, right.position) || left.id.localeCompare(right.id))
  const open: OpenPhrase[] = []
  const complete: { start: PedalEvent; events: PedalEvent[]; stop: PedalEvent }[] = []
  const exclusions: PedalExclusion[] = []
  const warnings: PedalWarning[] = []
  const exclude = (event: PedalEvent, reason: string) => exclusions.push({ id: `pedal-exclusion:${stableHash(`${event.id}|${reason}`)}`, sourceEventId: event.id, reason, measureNumber: event.measureNumber })

  for (const event of events) {
    const compatible = open.map((phrase, index) => ({ phrase, index })).filter(({ phrase }) => notationLaneCompatible(phrase.start, event))
    if (event.type === 'start') {
      for (const item of compatible) {
        exclude(item.phrase.start, 'A new pedal start overlaps an unclosed compatible phrase.')
        open.splice(open.indexOf(item.phrase), 1)
      }
      open.push({ start: event, events: [event] })
      continue
    }
    if (event.type === 'continue') {
      const phrase = compatible.length === 1 ? compatible[0]!.phrase : undefined
      if (phrase) phrase.events.push(event)
      else exclude(event, 'The pedal continue has no single unambiguous earlier start in a compatible notation lane.')
      continue
    }
    if (event.type === 'change') {
      const phrase = compatible.length === 1 ? compatible[0]!.phrase : undefined
      if (phrase) phrase.events.push(event)
      else exclude(event, 'The pedal change has no single unambiguous active phrase in a compatible notation lane.')
      continue
    }
    const phrase = compatible.length === 1 ? compatible[0]!.phrase : undefined
    if (!phrase) { exclude(event, 'The pedal stop has no single unambiguous earlier start in a compatible notation lane.'); continue }
    phrase.events.push(event)
    complete.push({ start: phrase.start, events: phrase.events, stop: event })
    open.splice(open.indexOf(phrase), 1)
  }
  for (const phrase of open) exclude(phrase.start, 'The pedal phrase has no unambiguous stop and cannot be graded.')
  if (exclusions.length) warnings.push({ code: 'PEDAL_NOTATION_EXCLUDED', severity: 'info', message: `${exclusions.length} incomplete or ambiguous pedal direction${exclusions.length === 1 ? ' was' : 's were'} excluded.` })

  const bounds = scopeBounds(plan, alignment, pedalScope(noteGrading))
  const targets: PedalPhraseTarget[] = []
  for (const phrase of complete) {
    if (!bounds || compareTime(phrase.start.position, bounds.start) < 0 || compareTime(phrase.stop.position, bounds.end) > 0) {
      exclude(phrase.start, 'The complete pedal phrase crosses or falls outside the exact grading scope.')
      continue
    }
    const gradeableEvents = phrase.events.filter((event) => event.type !== 'continue').map((event) => targetEvent(event, timingAnchorFor(event)))
    targets.push({
      id: `pedal-phrase:${stableHash(phrase.events.map((event) => event.id).join('|'))}`,
      sourceEventIds: phrase.events.map((event) => event.id),
      partId: phrase.start.partId,
      staff: phrase.start.staff,
      voice: phrase.start.voice,
      measureIndex: phrase.start.measureIndex,
      measureNumber: phrase.start.measureNumber,
      startPosition: { ...phrase.start.position },
      endPosition: { ...phrase.stop.position },
      events: gradeableEvents,
    })
  }
  return { targets, exclusions, warnings }
}
