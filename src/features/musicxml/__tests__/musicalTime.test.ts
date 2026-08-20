import { describe, expect, it } from 'vitest'
import { addTime, compareTime, equalTime, musicalTime, multiplyTime, subtractTime, timeToNumber } from '../musicalTime'

describe('MusicalTime exact fractions', () => {
  it('normalizes fractions and denominator signs', () => {
    expect(musicalTime(2, 4)).toEqual({ numerator: 1, denominator: 2 })
    expect(musicalTime(2, -4)).toEqual({ numerator: -1, denominator: 2 })
  })

  it('adds exact halves', () => {
    expect(addTime(musicalTime(1, 2), musicalTime(1, 2))).toEqual(musicalTime(1))
  })

  it('adds thirds and sixths without floating-point approximation', () => {
    expect(addTime(musicalTime(1, 3), musicalTime(1, 6))).toEqual(musicalTime(1, 2))
  })

  it('subtracts exact values', () => {
    expect(subtractTime(musicalTime(3, 2), musicalTime(1, 2))).toEqual(musicalTime(1))
  })

  it('compares and checks equality', () => {
    expect(compareTime(musicalTime(1, 3), musicalTime(1, 2))).toBe(-1)
    expect(compareTime(musicalTime(2, 4), musicalTime(1, 2))).toBe(0)
    expect(equalTime(musicalTime(4, 6), musicalTime(2, 3))).toBe(true)
  })

  it('multiplies exactly and converts only for display', () => {
    expect(multiplyTime(musicalTime(3, 4), 2)).toEqual(musicalTime(3, 2))
    expect(timeToNumber(musicalTime(1, 4))).toBe(0.25)
  })

  it('rejects a zero denominator', () => {
    expect(() => musicalTime(1, 0)).toThrow(/denominator/i)
  })
})
