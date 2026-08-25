export interface NotationLane {
  readonly partId: string
  readonly staff: number | null
  readonly voice: string | null
}

export function notationLaneCompatible(left: NotationLane, right: NotationLane): boolean {
  return left.partId === right.partId
    && (left.staff === null || right.staff === null || left.staff === right.staff)
    && (left.voice === null || right.voice === null || left.voice === right.voice)
}

export function notationLaneKey(lane: NotationLane, suffix = ''): string {
  return `${lane.partId}|${lane.staff ?? '*'}|${lane.voice ?? '*'}|${suffix}`
}
