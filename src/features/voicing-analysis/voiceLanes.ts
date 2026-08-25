import type { NormalizedScore } from '../musicxml/types'
import type { VoiceLane } from './types'

export function voiceLaneId(partId: string, staff: number | null, voice: string | null): string {
  return `voice-lane:${partId}:${staff ?? 'unspecified'}:${voice ?? 'unspecified'}`
}

export function voiceLaneLabel(partName: string | null, partId: string, staff: number | null, voice: string | null): string {
  return `${partName ?? partId} · Staff ${staff ?? 'unspecified'} · Voice ${voice ?? 'unspecified'}`
}

export function buildVoiceLanes(score: NormalizedScore, includedPartIds: readonly string[]): VoiceLane[] {
  const included = new Set(includedPartIds)
  const accumulated = new Map<string, { partId: string; partName: string | null; staff: number | null; voice: string | null; measures: Set<number>; noteCount: number }>()
  for (const part of score.parts) {
    if (!included.has(part.id)) continue
    for (const measure of part.measures) for (const event of measure.events) {
      if (event.type !== 'note' || event.pitch?.midi === null || event.isGrace || event.isCue) continue
      const id = voiceLaneId(part.id, event.staff, event.voice)
      const lane = accumulated.get(id) ?? { partId: part.id, partName: part.name, staff: event.staff, voice: event.voice, measures: new Set<number>(), noteCount: 0 }
      lane.measures.add(measure.index)
      lane.noteCount += 1
      accumulated.set(id, lane)
    }
  }
  return [...accumulated.entries()].map(([id, lane]): VoiceLane => ({
    id, partId: lane.partId, partName: lane.partName, staff: lane.staff, voice: lane.voice,
    measureCoverage: [...lane.measures].sort((a, b) => a - b), noteCount: lane.noteCount,
    ambiguous: lane.staff === null || lane.voice === null,
    label: voiceLaneLabel(lane.partName, lane.partId, lane.staff, lane.voice),
  })).sort((left, right) => left.partId.localeCompare(right.partId) || (left.staff ?? Number.MAX_SAFE_INTEGER) - (right.staff ?? Number.MAX_SAFE_INTEGER) || (left.voice ?? '').localeCompare(right.voice ?? '') || left.id.localeCompare(right.id))
}
