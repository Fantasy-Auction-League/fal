import { describe, it, expect } from 'vitest'
import {
  aggregateBasePoints,
  computeLivePlayerScores,
} from '@/lib/scoring/live'
import type { LiveScoreSlot } from '@/lib/scoring/live'

// ─── aggregateBasePoints ───────────────────────────────────────────
describe('aggregateBasePoints', () => {
  it('AC1.1: single player, single match → correct points', () => {
    const performances = [{ playerId: 'p1', fantasyPoints: 50 }]
    const result = aggregateBasePoints(performances)
    expect(result.get('p1')).toBe(50)
  })

  it('AC1.2: single player, multiple matches → points accumulated', () => {
    const performances = [
      { playerId: 'p1', fantasyPoints: 50 },
      { playerId: 'p1', fantasyPoints: 30 },
    ]
    const result = aggregateBasePoints(performances)
    expect(result.get('p1')).toBe(80)
  })

  it('multiple players → each gets correct total', () => {
    const performances = [
      { playerId: 'p1', fantasyPoints: 50 },
      { playerId: 'p2', fantasyPoints: 30 },
      { playerId: 'p1', fantasyPoints: 20 },
    ]
    const result = aggregateBasePoints(performances)
    expect(result.get('p1')).toBe(70)
    expect(result.get('p2')).toBe(30)
  })

  it('AC1.3: player with 0 fantasy points → included with 0 in map', () => {
    const performances = [
      { playerId: 'p1', fantasyPoints: 0 },
      { playerId: 'p2', fantasyPoints: 50 },
    ]
    const result = aggregateBasePoints(performances)
    expect(result.get('p1')).toBe(0)
    expect(result.get('p2')).toBe(50)
  })
})

// ─── computeLivePlayerScores ───────────────────────────────────────
describe('computeLivePlayerScores', () => {
  const mkSlot = (
    playerId: string,
    slotType: 'XI' | 'BENCH',
    role: string,
    isCaptain: boolean = false,
    isVC: boolean = false,
  ): LiveScoreSlot => ({
    playerId,
    slotType,
    role,
    isCaptain,
    isVC,
  })

  it('AC2.1: captain has played (points > 0) → multipliedPoints = basePoints * 2', () => {
    const slots = [
      mkSlot('cap', 'XI', 'BAT', true),
      mkSlot('other', 'XI', 'BOWL'),
    ]
    const basePointsMap = new Map([
      ['cap', 100],
      ['other', 50],
    ])
    const matchesPlayedMap = new Map([
      ['cap', 1],
      ['other', 1],
    ])

    const result = computeLivePlayerScores({
      slots,
      basePointsMap,
      chipType: null,
      matchesPlayedMap,
    })

    const cap = result.find((p) => p.playerId === 'cap')!
    expect(cap.basePoints).toBe(100)
    expect(cap.multipliedPoints).toBe(200)
    expect(cap.isCaptain).toBe(true)
  })

  it('AC2.2: captain has not played (points = 0) → multipliedPoints = 0', () => {
    const slots = [
      mkSlot('cap', 'XI', 'BAT', true),
      mkSlot('other', 'XI', 'BOWL'),
    ]
    const basePointsMap = new Map([
      ['cap', 0],
      ['other', 50],
    ])
    const matchesPlayedMap = new Map([
      ['other', 1],
    ])

    const result = computeLivePlayerScores({
      slots,
      basePointsMap,
      chipType: null,
      matchesPlayedMap,
    })

    const cap = result.find((p) => p.playerId === 'cap')!
    expect(cap.basePoints).toBe(0)
    expect(cap.multipliedPoints).toBe(0)
  })

  it('AC2.3: VC has played, captain has not → VC stays at 1x (no promotion)', () => {
    const slots = [
      mkSlot('cap', 'XI', 'BAT', true),
      mkSlot('vc', 'XI', 'BOWL', false, true),
    ]
    const basePointsMap = new Map([
      ['cap', 0],
      ['vc', 50],
    ])
    const matchesPlayedMap = new Map([
      ['vc', 1],
    ])

    const result = computeLivePlayerScores({
      slots,
      basePointsMap,
      chipType: null,
      matchesPlayedMap,
    })

    const vc = result.find((p) => p.playerId === 'vc')!
    expect(vc.basePoints).toBe(50)
    expect(vc.multipliedPoints).toBe(50) // stays at 1x
    expect(vc.isVC).toBe(true)
  })

  it('AC3.1: POWER_PLAY_BAT chip → BAT player chipBonus equals multipliedPoints, non-BAT = 0', () => {
    const slots = [
      mkSlot('bat', 'XI', 'BAT'),
      mkSlot('bowl', 'XI', 'BOWL'),
    ]
    const basePointsMap = new Map([
      ['bat', 50],
      ['bowl', 30],
    ])
    const matchesPlayedMap = new Map([
      ['bat', 1],
      ['bowl', 1],
    ])

    const result = computeLivePlayerScores({
      slots,
      basePointsMap,
      chipType: 'POWER_PLAY_BAT',
      matchesPlayedMap,
    })

    const bat = result.find((p) => p.playerId === 'bat')!
    const bowl = result.find((p) => p.playerId === 'bowl')!

    expect(bat.chipBonus).toBe(50) // equals multipliedPoints for BAT
    expect(bowl.chipBonus).toBe(0) // non-BAT gets 0
  })

  it('AC3.2: BOWLING_BOOST chip → BOWL player chipBonus equals multipliedPoints, non-BOWL = 0', () => {
    const slots = [
      mkSlot('bat', 'XI', 'BAT'),
      mkSlot('bowl', 'XI', 'BOWL'),
    ]
    const basePointsMap = new Map([
      ['bat', 50],
      ['bowl', 30],
    ])
    const matchesPlayedMap = new Map([
      ['bat', 1],
      ['bowl', 1],
    ])

    const result = computeLivePlayerScores({
      slots,
      basePointsMap,
      chipType: 'BOWLING_BOOST',
      matchesPlayedMap,
    })

    const bat = result.find((p) => p.playerId === 'bat')!
    const bowl = result.find((p) => p.playerId === 'bowl')!

    expect(bat.chipBonus).toBe(0) // non-BOWL gets 0
    expect(bowl.chipBonus).toBe(30) // equals multipliedPoints for BOWL
  })

  it('AC3.3: BAT captain with POWER_PLAY_BAT → base 100, captain 2x = 200, chip 2x = 200, total 400', () => {
    const slots = [mkSlot('cap', 'XI', 'BAT', true)]
    const basePointsMap = new Map([['cap', 100]])
    const matchesPlayedMap = new Map([['cap', 1]])

    const result = computeLivePlayerScores({
      slots,
      basePointsMap,
      chipType: 'POWER_PLAY_BAT',
      matchesPlayedMap,
    })

    const cap = result[0]!
    expect(cap.basePoints).toBe(100)
    expect(cap.multipliedPoints).toBe(200) // captain 2x
    expect(cap.chipBonus).toBe(200) // chip adds multipliedPoints
    expect(cap.basePoints + cap.chipBonus).toBe(300)
    // total contribution: multipliedPoints + chipBonus = 200 + 200 = 400
    const totalContribution = cap.multipliedPoints + cap.chipBonus
    expect(totalContribution).toBe(400)
  })

  it('AC3.4: no chip → all chipBonus = 0', () => {
    const slots = [
      mkSlot('bat', 'XI', 'BAT'),
      mkSlot('bowl', 'XI', 'BOWL'),
    ]
    const basePointsMap = new Map([
      ['bat', 50],
      ['bowl', 30],
    ])
    const matchesPlayedMap = new Map([
      ['bat', 1],
      ['bowl', 1],
    ])

    const result = computeLivePlayerScores({
      slots,
      basePointsMap,
      chipType: null,
      matchesPlayedMap,
    })

    result.forEach((p) => {
      expect(p.chipBonus).toBe(0)
    })
  })

  it('AC4.1: only XI players counted in totalPoints', () => {
    const slots = [
      mkSlot('xi', 'XI', 'BAT'),
      mkSlot('bench', 'BENCH', 'BOWL'),
    ]
    const basePointsMap = new Map([
      ['xi', 50],
      ['bench', 30],
    ])
    const matchesPlayedMap = new Map([
      ['xi', 1],
      ['bench', 1],
    ])

    const result = computeLivePlayerScores({
      slots,
      basePointsMap,
      chipType: null,
      matchesPlayedMap,
    })

    const xiPoints = result
      .filter((p) => p.slotType === 'XI')
      .reduce((sum, p) => sum + p.multipliedPoints, 0)

    expect(xiPoints).toBe(50)
  })

  it('AC4.2: bench player present in results with slotType BENCH, points not in total', () => {
    const slots = [
      mkSlot('xi', 'XI', 'BAT'),
      mkSlot('bench', 'BENCH', 'BOWL'),
    ]
    const basePointsMap = new Map([
      ['xi', 50],
      ['bench', 30],
    ])
    const matchesPlayedMap = new Map([
      ['xi', 1],
      ['bench', 1],
    ])

    const result = computeLivePlayerScores({
      slots,
      basePointsMap,
      chipType: null,
      matchesPlayedMap,
    })

    const benchPlayer = result.find((p) => p.playerId === 'bench')
    expect(benchPlayer).toBeDefined()
    expect(benchPlayer?.slotType).toBe('BENCH')
    expect(benchPlayer?.multipliedPoints).toBe(30) // shown but not counted in total
  })

  it('non-playing player → multipliedPoints = 0', () => {
    const slots = [mkSlot('missing', 'XI', 'BAT')]
    const basePointsMap = new Map()
    const matchesPlayedMap = new Map()

    const result = computeLivePlayerScores({
      slots,
      basePointsMap,
      chipType: null,
      matchesPlayedMap,
    })

    const missing = result[0]!
    expect(missing.basePoints).toBe(0)
    expect(missing.multipliedPoints).toBe(0)
  })
})
