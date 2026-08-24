function comparePartId(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

export function canonicalizePartSelection(partIds: readonly string[]): readonly string[] {
  return [...new Set(partIds)].sort(comparePartId)
}

export function samePartSelection(left: readonly string[], right: readonly string[]): boolean {
  const canonicalLeft = canonicalizePartSelection(left)
  const canonicalRight = canonicalizePartSelection(right)
  return canonicalLeft.length === canonicalRight.length && canonicalLeft.every((partId, index) => partId === canonicalRight[index])
}

export function exactPartOrder(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((partId, index) => partId === right[index])
}
