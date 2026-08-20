export interface MusicalTime {
  readonly numerator: number
  readonly denominator: number
}

export const ZERO_TIME: MusicalTime = Object.freeze({ numerator: 0, denominator: 1 })

function gcd(left: number, right: number): number {
  let a = Math.abs(left)
  let b = Math.abs(right)
  while (b !== 0) [a, b] = [b, a % b]
  return a || 1
}

function requireSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value)) throw new RangeError(`${label} must be a safe integer.`)
}

export function musicalTime(numerator: number, denominator = 1): MusicalTime {
  requireSafeInteger(numerator, 'Musical-time numerator')
  requireSafeInteger(denominator, 'Musical-time denominator')
  if (denominator === 0) throw new RangeError('Musical-time denominator cannot be zero.')
  if (numerator === 0) return ZERO_TIME
  const sign = denominator < 0 ? -1 : 1
  const divisor = gcd(numerator, denominator)
  return Object.freeze({ numerator: sign * numerator / divisor, denominator: Math.abs(denominator) / divisor })
}

export function addTime(left: MusicalTime, right: MusicalTime): MusicalTime {
  const denominatorDivisor = gcd(left.denominator, right.denominator)
  const leftScale = right.denominator / denominatorDivisor
  const rightScale = left.denominator / denominatorDivisor
  return musicalTime(left.numerator * leftScale + right.numerator * rightScale, left.denominator * leftScale)
}

export function subtractTime(left: MusicalTime, right: MusicalTime): MusicalTime {
  const denominatorDivisor = gcd(left.denominator, right.denominator)
  const leftScale = right.denominator / denominatorDivisor
  const rightScale = left.denominator / denominatorDivisor
  return musicalTime(left.numerator * leftScale - right.numerator * rightScale, left.denominator * leftScale)
}

export function multiplyTime(value: MusicalTime, numerator: number, denominator = 1): MusicalTime {
  const factor = musicalTime(numerator, denominator)
  const numeratorDivisor = gcd(value.numerator, factor.denominator)
  const denominatorDivisor = gcd(factor.numerator, value.denominator)
  return musicalTime(
    value.numerator / numeratorDivisor * (factor.numerator / denominatorDivisor),
    value.denominator / denominatorDivisor * (factor.denominator / numeratorDivisor),
  )
}

export function compareTime(left: MusicalTime, right: MusicalTime): -1 | 0 | 1 {
  const leftCrossProduct = BigInt(left.numerator) * BigInt(right.denominator)
  const rightCrossProduct = BigInt(right.numerator) * BigInt(left.denominator)
  return leftCrossProduct < rightCrossProduct ? -1 : leftCrossProduct > rightCrossProduct ? 1 : 0
}

export function equalTime(left: MusicalTime, right: MusicalTime): boolean {
  return left.numerator === right.numerator && left.denominator === right.denominator
}

export function maxTime(left: MusicalTime, right: MusicalTime): MusicalTime {
  return compareTime(left, right) >= 0 ? left : right
}

export function timeToNumber(value: MusicalTime): number {
  return value.numerator / value.denominator
}

export function formatMusicalTime(value: MusicalTime): string {
  return value.denominator === 1 ? String(value.numerator) : `${value.numerator}/${value.denominator}`
}
