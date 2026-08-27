export const DAY_MS = 86_400_000

export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    Object.values(value as Record<string, unknown>).forEach(deepFreeze)
  }
  return value
}

export function cloneSerializable<T>(value: T): T {
  return structuredClone(value)
}

export function parseExplicitAsOf(asOf: string): number {
  const value = Date.parse(asOf)
  if (!Number.isFinite(value)) throw new RangeError('Practice Planning requires a valid explicit asOf timestamp.')
  return value
}

export function uniqueSorted(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right))
}

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

export function weightedMean(values: readonly { readonly value: number; readonly weight: number }[]): number | null {
  const totalWeight = values.reduce((sum, item) => sum + item.weight, 0)
  if (values.length === 0 || totalWeight <= 0 || !Number.isFinite(totalWeight)) return null
  return values.reduce((sum, item) => sum + item.value * item.weight, 0) / totalWeight
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!
}
