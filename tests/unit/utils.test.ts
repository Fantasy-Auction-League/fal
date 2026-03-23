import { describe, it, expect } from 'vitest'
import { oversToDecimal, mapPositionToRole } from '@/lib/sportmonks/utils'

describe('oversToDecimal', () => {
  it('4.0 = 4.0', () => {
    expect(oversToDecimal(4.0)).toBeCloseTo(4.0)
  })

  it('4.2 = 4.333...', () => {
    expect(oversToDecimal(4.2)).toBeCloseTo(4.333, 2)
  })

  it('3.5 = 3.833...', () => {
    expect(oversToDecimal(3.5)).toBeCloseTo(3.833, 2)
  })

  it('0.1 = 0.166...', () => {
    expect(oversToDecimal(0.1)).toBeCloseTo(0.1667, 2)
  })

  it('10.0 = 10.0', () => {
    expect(oversToDecimal(10.0)).toBeCloseTo(10.0)
  })
})

describe('mapPositionToRole', () => {
  it('Batsman -> BAT', () => {
    expect(mapPositionToRole('Batsman')).toBe('BAT')
  })

  it('Bowler -> BOWL', () => {
    expect(mapPositionToRole('Bowler')).toBe('BOWL')
  })

  it('Allrounder -> ALL', () => {
    expect(mapPositionToRole('Allrounder')).toBe('ALL')
  })

  it('Wicketkeeper -> WK', () => {
    expect(mapPositionToRole('Wicketkeeper')).toBe('WK')
  })

  it('Middle Order Batter -> BAT', () => {
    expect(mapPositionToRole('Middle Order Batter')).toBe('BAT')
  })
})
