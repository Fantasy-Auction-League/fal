import { describe, it, expect } from 'vitest'
import { computeBowlingPoints } from '@/lib/scoring/bowling'

describe('computeBowlingPoints', () => {
  const base = { wickets: 0, overs: 0, maidens: 0, runsConceded: 0, dotBalls: 0, lbwBowledCount: 0 }

  it('3 wickets = 90 + 4 (3w bonus) = 94', () => {
    expect(computeBowlingPoints({ ...base, wickets: 3, overs: 4.0, runsConceded: 30 })).toBe(94)
  })

  it('4 wickets = 120 + 8 (4w bonus) = 128', () => {
    expect(computeBowlingPoints({ ...base, wickets: 4, overs: 4.0, runsConceded: 30 })).toBe(128)
  })

  it('5 wickets = 150 + 12 (5w bonus) = 162', () => {
    expect(computeBowlingPoints({ ...base, wickets: 5, overs: 4.0, runsConceded: 30 })).toBe(162)
  })

  it('wicket bonuses do NOT stack: 5w = +12 only', () => {
    const pts = computeBowlingPoints({ ...base, wickets: 5, overs: 4.0, runsConceded: 30 })
    // 5*30=150 + 12 = 162, NOT 150+4+8+12=174
    expect(pts).toBe(162)
  })

  it('maiden = +12', () => {
    expect(computeBowlingPoints({ ...base, maidens: 1 })).toBe(12)
  })

  it('dot balls: 18 dots = +18', () => {
    expect(computeBowlingPoints({ ...base, dotBalls: 18 })).toBe(18)
  })

  it('LBW/Bowled bonus: 2 LBW = +16', () => {
    expect(computeBowlingPoints({ ...base, lbwBowledCount: 2 })).toBe(16)
  })

  it('economy rate: 4.0 overs, 24 runs = ER 6.0 = +2', () => {
    // 4.0 cricket overs = 4.0 decimal overs; ER = 24/4 = 6.0
    expect(computeBowlingPoints({ ...base, overs: 4.0, runsConceded: 24 })).toBe(2)
  })

  it('economy rate: 4.2 overs (4.333 decimal), 22 runs = ER ~5.08 = +4', () => {
    // 4.2 cricket = 4 + 2/6 = 4.333 decimal; ER = 22/4.333 ≈ 5.077
    expect(computeBowlingPoints({ ...base, overs: 4.2, runsConceded: 22 })).toBe(4)
  })

  it('ER < 5 = +6', () => {
    // 4 overs, 16 runs = ER 4.0
    expect(computeBowlingPoints({ ...base, overs: 4.0, runsConceded: 16 })).toBe(6)
  })

  it('ER 5-6 = +4', () => {
    // 4 overs, 20 runs = ER 5.0
    expect(computeBowlingPoints({ ...base, overs: 4.0, runsConceded: 20 })).toBe(4)
  })

  it('ER 6-7 = +2', () => {
    // 4 overs, 26 runs = ER 6.5
    expect(computeBowlingPoints({ ...base, overs: 4.0, runsConceded: 26 })).toBe(2)
  })

  it('ER 10-11 = -2', () => {
    // 4 overs, 42 runs = ER 10.5
    expect(computeBowlingPoints({ ...base, overs: 4.0, runsConceded: 42 })).toBe(-2)
  })

  it('ER 11-12 = -4', () => {
    // 4 overs, 46 runs = ER 11.5
    expect(computeBowlingPoints({ ...base, overs: 4.0, runsConceded: 46 })).toBe(-4)
  })

  it('ER > 12 = -6', () => {
    // 4 overs, 52 runs = ER 13.0
    expect(computeBowlingPoints({ ...base, overs: 4.0, runsConceded: 52 })).toBe(-6)
  })

  it('ER with < 2 overs = no bonus/penalty', () => {
    // 1 over, 2 runs = ER 2.0 but under 2 overs threshold
    expect(computeBowlingPoints({ ...base, overs: 1.0, runsConceded: 2 })).toBe(0)
  })

  it('ER with 1.5 overs (1.833 decimal) = no bonus (< 2 overs)', () => {
    // 1.5 cricket overs = 1 + 5/6 = 1.833 decimal
    expect(computeBowlingPoints({ ...base, overs: 1.5, runsConceded: 5 })).toBe(0)
  })
})
