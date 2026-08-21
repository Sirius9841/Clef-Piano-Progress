export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const ordered = [...values].sort((left, right) => left - right)
  const middle = Math.floor(ordered.length / 2)
  return ordered.length % 2 ? ordered[middle]! : (ordered[middle - 1]! + ordered[middle]!) / 2
}

export function trimmedMean(values: readonly number[], trimFraction: number): number | null {
  if (values.length === 0) return null
  const ordered = [...values].sort((left, right) => left - right)
  const trim = Math.min(Math.floor(ordered.length * trimFraction), Math.floor((ordered.length - 1) / 2))
  const retained = ordered.slice(trim, ordered.length - trim)
  return retained.reduce((sum, value) => sum + value, 0) / retained.length
}

export function smoothDeviationScore(absoluteLogError: number, toleranceRatio: number, falloffRatio: number): number {
  const tolerance = Math.log1p(toleranceRatio)
  const excess = Math.max(0, absoluteLogError - tolerance)
  if (excess === 0) return 1
  const normalized = excess / Math.log1p(falloffRatio)
  return clamp01(Math.exp(-normalized * normalized))
}

export function theilSenSlope(points: readonly { x: number; y: number }[]): number | null {
  if (points.length < 2) return null
  const slopes: number[] = []
  for (let left = 0; left < points.length - 1; left += 1) {
    for (let right = left + 1; right < points.length; right += 1) {
      const run = points[right]!.x - points[left]!.x
      if (run !== 0) slopes.push((points[right]!.y - points[left]!.y) / run)
    }
  }
  return median(slopes)
}

export function stableHash(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value
  seen.add(value)
  Object.values(value as Record<string, unknown>).forEach((child) => deepFreeze(child, seen))
  return Object.freeze(value)
}
