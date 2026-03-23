import { describe, it, expect } from 'vitest'
import { computeFieldingPoints } from '@/lib/scoring/fielding'

describe('computeFieldingPoints', () => {
  const base = { catches: 0, stumpings: 0, runoutsDirect: 0, runoutsAssisted: 0 }

  it('1 catch = 8', () => {
    expect(computeFieldingPoints({ ...base, catches: 1 })).toBe(8)
  })

  it('3 catches = 24 + 4 (bonus) = 28', () => {
    expect(computeFieldingPoints({ ...base, catches: 3 })).toBe(28)
  })

  it('5 catches = 40 + 4 (one-time bonus) = 44', () => {
    expect(computeFieldingPoints({ ...base, catches: 5 })).toBe(44)
  })

  it('stumping = 12', () => {
    expect(computeFieldingPoints({ ...base, stumpings: 1 })).toBe(12)
  })

  it('direct runout = 12', () => {
    expect(computeFieldingPoints({ ...base, runoutsDirect: 1 })).toBe(12)
  })

  it('assisted runout = 6', () => {
    expect(computeFieldingPoints({ ...base, runoutsAssisted: 1 })).toBe(6)
  })

  it('combined: 2 catches + 1 stumping + 1 direct runout = 40', () => {
    expect(computeFieldingPoints({
      catches: 2, stumpings: 1, runoutsDirect: 1, runoutsAssisted: 0,
    })).toBe(16 + 12 + 12)
  })

  it('zero everything = 0', () => {
    expect(computeFieldingPoints(base)).toBe(0)
  })
})
