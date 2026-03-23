import { describe, it, expect, vi } from 'vitest'
import { applyBenchSubs, resolveMultipliers, applyChipEffects } from '@/lib/scoring/multipliers'
import type { LineupSlot } from '@/lib/scoring/multipliers'

// ─── applyBenchSubs ───────────────────────────────────────────
describe('applyBenchSubs', () => {
  const mkSlot = (
    playerId: string,
    slotType: 'XI' | 'BENCH',
    benchPriority: number | null = null,
    role: 'CAPTAIN' | 'VC' | null = null,
  ): LineupSlot => ({ playerId, slotType, benchPriority, role })

  it('no absent XI = no subs, scoringXI unchanged', () => {
    const lineup = [mkSlot('a', 'XI'), mkSlot('b', 'XI'), mkSlot('c', 'BENCH', 1)]
    const played = new Set(['a', 'b', 'c'])
    const { subs, scoringXI } = applyBenchSubs(lineup, played)
    expect(subs).toHaveLength(0)
    expect(scoringXI).toEqual(new Set(['a', 'b']))
  })

  it('1 absent XI, bench player 1 played = sub in bench 1', () => {
    const lineup = [mkSlot('a', 'XI'), mkSlot('b', 'XI'), mkSlot('c', 'BENCH', 1)]
    const played = new Set(['a', 'c']) // b absent
    const { subs, scoringXI } = applyBenchSubs(lineup, played)
    expect(subs).toEqual([{ out: 'b', in: 'c' }])
    expect(scoringXI).toEqual(new Set(['a', 'c']))
  })

  it('2 absent, bench priority order respected', () => {
    const lineup = [
      mkSlot('a', 'XI'), mkSlot('b', 'XI'), mkSlot('c', 'XI'),
      mkSlot('d', 'BENCH', 1), mkSlot('e', 'BENCH', 2),
    ]
    const played = new Set(['c', 'd', 'e']) // a,b absent
    const { subs } = applyBenchSubs(lineup, played)
    expect(subs[0]).toEqual({ out: 'a', in: 'd' })
    expect(subs[1]).toEqual({ out: 'b', in: 'e' })
  })

  it('no double-dipping: 2 absent, only 1 bench played = 1 sub', () => {
    const lineup = [
      mkSlot('a', 'XI'), mkSlot('b', 'XI'), mkSlot('c', 'XI'),
      mkSlot('d', 'BENCH', 1), mkSlot('e', 'BENCH', 2),
    ]
    const played = new Set(['c', 'd']) // a,b absent, e didn't play
    const { subs, scoringXI } = applyBenchSubs(lineup, played)
    expect(subs).toHaveLength(1)
    expect(scoringXI.has('d')).toBe(true)
    expect(scoringXI.has('b')).toBe(true) // b stays (no sub available)
  })

  it('absent XI, no bench played = no sub, scoringXI has hole', () => {
    const lineup = [mkSlot('a', 'XI'), mkSlot('b', 'XI'), mkSlot('c', 'BENCH', 1)]
    const played = new Set(['a']) // b absent, c didn't play
    const { subs, scoringXI } = applyBenchSubs(lineup, played)
    expect(subs).toHaveLength(0)
    expect(scoringXI).toEqual(new Set(['a', 'b']))
  })
})

// ─── resolveMultipliers ───────────────────────────────────────
describe('resolveMultipliers', () => {
  const mkSlot = (
    playerId: string,
    slotType: 'XI' | 'BENCH',
    benchPriority: number | null = null,
    role: 'CAPTAIN' | 'VC' | null = null,
  ): LineupSlot => ({ playerId, slotType, benchPriority, role })

  it('captain played = captain gets 2x, VC gets nothing', () => {
    const lineup = [mkSlot('a', 'XI', null, 'CAPTAIN'), mkSlot('b', 'XI', null, 'VC')]
    const played = new Set(['a', 'b'])
    const m = resolveMultipliers(lineup, played)
    expect(m.get('a')).toBe(2)
    expect(m.has('b')).toBe(false)
  })

  it('captain absent, VC played = VC gets 2x (promoted)', () => {
    const lineup = [mkSlot('a', 'XI', null, 'CAPTAIN'), mkSlot('b', 'XI', null, 'VC')]
    const played = new Set(['b']) // captain absent
    const m = resolveMultipliers(lineup, played)
    expect(m.get('b')).toBe(2)
    expect(m.has('a')).toBe(false)
  })

  it('both absent = empty multipliers', () => {
    const lineup = [mkSlot('a', 'XI', null, 'CAPTAIN'), mkSlot('b', 'XI', null, 'VC')]
    const played = new Set<string>()
    const m = resolveMultipliers(lineup, played)
    expect(m.size).toBe(0)
  })

  it('missing captain/VC in lineup = empty with warning', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const lineup = [{ playerId: 'a', slotType: 'XI' as const, benchPriority: null, role: null }]
    const m = resolveMultipliers(lineup, new Set(['a']))
    expect(m.size).toBe(0)
    expect(warnSpy).toHaveBeenCalledWith('Lineup missing captain/VC')
    warnSpy.mockRestore()
  })
})

// ─── applyChipEffects ─────────────────────────────────────────
describe('applyChipEffects', () => {
  it('no chip = sum of XI points', () => {
    const scoringXI = new Set(['a', 'b'])
    const gwPoints = new Map([['a', 50], ['b', 30]])
    const roles = new Map([['a', 'BAT'], ['b', 'BOWL']])
    expect(applyChipEffects(null, scoringXI, gwPoints, roles)).toBe(80)
  })

  it('POWER_PLAY_BAT = BAT players doubled', () => {
    const scoringXI = new Set(['a', 'b'])
    const gwPoints = new Map([['a', 50], ['b', 30]])
    const roles = new Map([['a', 'BAT'], ['b', 'BOWL']])
    // base=80, +50 for BAT player a = 130
    expect(applyChipEffects('POWER_PLAY_BAT', scoringXI, gwPoints, roles)).toBe(130)
  })

  it('BOWLING_BOOST = BOWL players doubled', () => {
    const scoringXI = new Set(['a', 'b'])
    const gwPoints = new Map([['a', 50], ['b', 30]])
    const roles = new Map([['a', 'BAT'], ['b', 'BOWL']])
    // base=80, +30 for BOWL player b = 110
    expect(applyChipEffects('BOWLING_BOOST', scoringXI, gwPoints, roles)).toBe(110)
  })

  it('captain (2x) + POWER_PLAY_BAT = 4x total for BAT captain', () => {
    // Captain BAT with 100 base -> gwPoints already has 200 (2x applied)
    // Chip doubles the gwPoints value again for BAT -> adds 200 -> total 400
    const scoringXI = new Set(['cap'])
    const gwPoints = new Map([['cap', 200]]) // already 2x from captain
    const roles = new Map([['cap', 'BAT']])
    expect(applyChipEffects('POWER_PLAY_BAT', scoringXI, gwPoints, roles)).toBe(400)
  })
})
