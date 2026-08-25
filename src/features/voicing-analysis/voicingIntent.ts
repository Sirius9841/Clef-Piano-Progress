import type { VoiceLane, VoicingIntentProfile } from './types'

function canonicalIntent(profile: VoicingIntentProfile): string {
  return JSON.stringify({
    scoreVersionId: profile.scoreVersionId,
    regions: profile.regions.map((region) => ({
      startMeasureIndex: region.startMeasureIndex,
      endMeasureIndex: region.endMeasureIndex,
      foregroundLaneIds: [...new Set(region.foregroundLaneIds)].sort(),
      supportLaneIds: [...new Set(region.supportLaneIds)].sort(),
    })).sort((left, right) => left.startMeasureIndex - right.startMeasureIndex || left.endMeasureIndex - right.endMeasureIndex || JSON.stringify(left).localeCompare(JSON.stringify(right))),
  })
}

export function sameVoicingIntentMeaning(left: VoicingIntentProfile | null, right: VoicingIntentProfile | null): boolean {
  if (left === null || right === null) return left === right
  return canonicalIntent(left) === canonicalIntent(right)
}

export function validateVoicingIntentProfile(profile: VoicingIntentProfile, lanes: readonly Pick<VoiceLane, 'id' | 'ambiguous'>[], scoreVersionId = profile.scoreVersionId): readonly string[] {
  const errors: string[] = []
  const laneById = new Map(lanes.map((lane) => [lane.id, lane]))
  if (profile.scoreVersionId !== scoreVersionId) errors.push('The Voicing profile belongs to a different ScoreVersion.')
  if (profile.regions.length === 0) errors.push('A Voicing profile needs at least one configured region.')
  const regionIds = new Set<string>()
  for (const region of profile.regions) {
    if (!region.id || regionIds.has(region.id)) errors.push('Every Voicing region needs a unique identity.')
    regionIds.add(region.id)
    if (!Number.isInteger(region.startMeasureIndex) || !Number.isInteger(region.endMeasureIndex) || region.startMeasureIndex < 0 || region.endMeasureIndex < region.startMeasureIndex) errors.push(`Region ${region.id} has an invalid measure range.`)
    if (region.foregroundLaneIds.length === 0 || region.supportLaneIds.length === 0) errors.push(`Region ${region.id} needs foreground and support lanes.`)
    const foreground = new Set(region.foregroundLaneIds)
    if (region.supportLaneIds.some((id) => foreground.has(id))) errors.push(`Region ${region.id} uses one lane as both foreground and support.`)
    for (const id of [...region.foregroundLaneIds, ...region.supportLaneIds]) {
      const lane = laneById.get(id)
      if (!lane) errors.push(`Region ${region.id} references an unavailable score lane.`)
      else if (lane.ambiguous) errors.push(`Region ${region.id} references a lane with unspecified staff or voice provenance.`)
    }
  }
  const ordered = [...profile.regions].sort((left, right) => left.startMeasureIndex - right.startMeasureIndex || left.endMeasureIndex - right.endMeasureIndex || left.id.localeCompare(right.id))
  for (let index = 1; index < ordered.length; index += 1) if (ordered[index]!.startMeasureIndex <= ordered[index - 1]!.endMeasureIndex) errors.push(`Region ${ordered[index]!.id} overlaps another configured region.`)
  return [...new Set(errors)]
}
