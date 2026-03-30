import { describe, it, expect } from 'vitest'
import { computeBattingPoints } from '@/lib/scoring/batting'

describe('computeBattingPoints', () => {
  // Basic runs (use enough balls to land SR in neutral 70-130 zone)
  it('45 runs = 45 + 4 (25-bonus) = 49 pts', () => {
    // 45 runs off 45 balls = SR 100 (neutral)
    expect(computeBattingPoints(
      { runs: 45, balls: 45, fours: 0, sixes: 0, wicketId: null }, 'BAT'
    )).toBe(49)
  })

  // Fours and sixes bonus
  it('4 fours + 2 sixes = 16 + 12 = 28 boundary bonus', () => {
    // 28 runs off 28 balls = SR 100 (neutral)
    // points: 28 runs + 4*4 four bonus + 2*6 six bonus + 4 (25-milestone) = 28 + 16 + 12 + 4 = 60
    expect(computeBattingPoints(
      { runs: 28, balls: 28, fours: 4, sixes: 2, wicketId: null }, 'BAT'
    )).toBe(60)
  })

  // Half century (highest milestone only, no stacking)
  it('50 runs = 50 + 8 (50-bonus only) = 58 pts', () => {
    // 50 runs off 50 balls = SR 100 (neutral)
    expect(computeBattingPoints(
      { runs: 50, balls: 50, fours: 0, sixes: 0, wicketId: null }, 'BAT'
    )).toBe(58)
  })

  // 75 milestone (highest only, does NOT stack with 25 and 50)
  it('75 runs = 75 + 12 (75-bonus only) = 87 pts', () => {
    // 75 runs off 75 balls = SR 100 (neutral)
    expect(computeBattingPoints(
      { runs: 75, balls: 75, fours: 0, sixes: 0, wicketId: null }, 'BAT'
    )).toBe(87)
  })

  // Century replaces all lower milestones
  it('100 runs = 100 + 16 = 116 pts (century replaces lower milestones)', () => {
    // 100 runs off 100 balls = SR 100 (neutral)
    expect(computeBattingPoints(
      { runs: 100, balls: 100, fours: 0, sixes: 0, wicketId: null }, 'BAT'
    )).toBe(116)
  })

  // Duck scenarios
  it('duck: 0 runs, 1 ball, caught (54), BAT = -2', () => {
    expect(computeBattingPoints(
      { runs: 0, balls: 1, fours: 0, sixes: 0, wicketId: 54 }, 'BAT'
    )).toBe(-2)
  })

  it('duck: 0 runs, 0 balls = NO duck (did not face a ball)', () => {
    expect(computeBattingPoints(
      { runs: 0, balls: 0, fours: 0, sixes: 0, wicketId: null }, 'BAT'
    )).toBe(0)
  })

  it('duck: 0 runs, bowler role = NO duck (bowlers exempt)', () => {
    expect(computeBattingPoints(
      { runs: 0, balls: 1, fours: 0, sixes: 0, wicketId: 54 }, 'BOWL'
    )).toBe(0)
  })

  it('duck: 0 runs, wicketId=84 (not out) = NO duck', () => {
    expect(computeBattingPoints(
      { runs: 0, balls: 1, fours: 0, sixes: 0, wicketId: 84 }, 'BAT'
    )).toBe(0)
  })

  it('duck: 0 runs, wicketId=138 (retired out) = NO duck', () => {
    expect(computeBattingPoints(
      { runs: 0, balls: 1, fours: 0, sixes: 0, wicketId: 138 }, 'BAT'
    )).toBe(0)
  })

  // Strike rate bonuses/penalties
  it('SR > 170 (10+ balls) = +6', () => {
    // 18 runs off 10 balls = SR 180
    expect(computeBattingPoints(
      { runs: 18, balls: 10, fours: 0, sixes: 0, wicketId: null }, 'BAT'
    )).toBe(18 + 6)
  })

  it('SR 150-170 = +4', () => {
    // 16 runs off 10 balls = SR 160
    expect(computeBattingPoints(
      { runs: 16, balls: 10, fours: 0, sixes: 0, wicketId: null }, 'BAT'
    )).toBe(16 + 4)
  })

  it('SR 130-150 = +2', () => {
    // 14 runs off 10 balls = SR 140
    expect(computeBattingPoints(
      { runs: 14, balls: 10, fours: 0, sixes: 0, wicketId: null }, 'BAT'
    )).toBe(14 + 2)
  })

  it('SR 70-130 = 0 bonus', () => {
    // 10 runs off 10 balls = SR 100
    expect(computeBattingPoints(
      { runs: 10, balls: 10, fours: 0, sixes: 0, wicketId: null }, 'BAT'
    )).toBe(10)
  })

  it('SR 60-70 = -2', () => {
    // 7 runs off 10 balls = SR 70
    expect(computeBattingPoints(
      { runs: 7, balls: 10, fours: 0, sixes: 0, wicketId: null }, 'BAT'
    )).toBe(7 - 2)
  })

  it('SR 50-60 = -4', () => {
    // 5 runs off 10 balls = SR 50
    expect(computeBattingPoints(
      { runs: 5, balls: 10, fours: 0, sixes: 0, wicketId: null }, 'BAT'
    )).toBe(5 - 4)
  })

  it('SR < 50 = -6', () => {
    // 4 runs off 10 balls = SR 40
    expect(computeBattingPoints(
      { runs: 4, balls: 10, fours: 0, sixes: 0, wicketId: null }, 'BAT'
    )).toBe(4 - 6)
  })

  it('SR with < 10 balls = no bonus/penalty', () => {
    // 2 runs off 9 balls = SR 22 but under threshold
    expect(computeBattingPoints(
      { runs: 2, balls: 9, fours: 0, sixes: 0, wicketId: null }, 'BAT'
    )).toBe(2)
  })

  it('SR bowler exempt = no penalty even if SR < 50', () => {
    // 4 runs off 10 balls = SR 40, but BOWL role
    expect(computeBattingPoints(
      { runs: 4, balls: 10, fours: 0, sixes: 0, wicketId: null }, 'BOWL'
    )).toBe(4)
  })
})
