import { describe, it, expect, beforeAll } from 'vitest'
import { prisma } from '../../lib/db'
import { getSimLeague, getSimGameweeks, generateLineup } from './helpers'

describe('Layer 2: Lineup Lifecycle', () => {
  let league: any
  let teams: any[]
  let gameweeks: any[]
  let teamSquads: Map<string, any[]> // teamId -> players

  beforeAll(async () => {
    league = await getSimLeague()
    teams = league?.teams || []
    gameweeks = await getSimGameweeks()

    // Load squads for all teams
    teamSquads = new Map()
    for (const team of teams) {
      const tp = await prisma.teamPlayer.findMany({
        where: { teamId: team.id },
        include: { player: true },
      })
      teamSquads.set(team.id, tp.map(t => t.player))
    }
  }, 30000)

  it('all 10 users submit lineups for GW1', async () => {
    const gw1 = gameweeks[0]
    for (const team of teams) {
      const squad = teamSquads.get(team.id)!
      const slots = generateLineup(squad)

      // Delete existing lineup if any (idempotent)
      const existing = await prisma.lineup.findUnique({
        where: { teamId_gameweekId: { teamId: team.id, gameweekId: gw1.id } },
      })
      if (existing) {
        await prisma.lineupSlot.deleteMany({ where: { lineupId: existing.id } })
        await prisma.lineup.delete({ where: { id: existing.id } })
      }

      const lineup = await prisma.lineup.create({
        data: {
          teamId: team.id,
          gameweekId: gw1.id,
          slots: { create: slots },
        },
        include: { slots: true },
      })

      expect(lineup.slots).toHaveLength(15)
      expect(lineup.slots.filter((s: any) => s.slotType === 'XI')).toHaveLength(11)
      expect(lineup.slots.filter((s: any) => s.slotType === 'BENCH')).toHaveLength(4)
      expect(lineup.slots.filter((s: any) => s.role === 'CAPTAIN')).toHaveLength(1)
      expect(lineup.slots.filter((s: any) => s.role === 'VC')).toHaveLength(1)
    }
  })

  it('lineup validation: captain and VC are different players', async () => {
    const gw1 = gameweeks[0]
    const lineup = await prisma.lineup.findFirst({
      where: { gameweekId: gw1.id },
      include: { slots: true },
    })
    const captain = lineup!.slots.find((s: any) => s.role === 'CAPTAIN')
    const vc = lineup!.slots.find((s: any) => s.role === 'VC')
    expect(captain!.playerId).not.toBe(vc!.playerId)
  })

  it('bench priorities are sequential 1-4', async () => {
    const gw1 = gameweeks[0]
    const lineup = await prisma.lineup.findFirst({
      where: { gameweekId: gw1.id },
      include: { slots: true },
    })
    const benchSlots = lineup!.slots
      .filter((s: any) => s.slotType === 'BENCH')
      .sort((a: any, b: any) => a.benchPriority! - b.benchPriority!)
    expect(benchSlots.map((s: any) => s.benchPriority)).toEqual([1, 2, 3, 4])
  })

  it('GW1 no-lineup: team 7 has no lineup for GW1', async () => {
    // Delete team 7's lineup for GW1 (user 7 skips GW1)
    const team7 = teams[6] // 0-indexed
    const gw1 = gameweeks[0]
    const lineup = await prisma.lineup.findUnique({
      where: { teamId_gameweekId: { teamId: team7.id, gameweekId: gw1.id } },
    })
    if (lineup) {
      await prisma.lineupSlot.deleteMany({ where: { lineupId: lineup.id } })
      await prisma.lineup.delete({ where: { id: lineup.id } })
    }
    const check = await prisma.lineup.findUnique({
      where: { teamId_gameweekId: { teamId: team7.id, gameweekId: gw1.id } },
    })
    expect(check).toBeNull()
  })

  it('submit lineups for mid-season and last gameweek', async () => {
    const midGw = gameweeks[Math.floor(gameweeks.length / 2)]
    const lastGw = gameweeks[gameweeks.length - 1]

    for (const gw of [midGw, lastGw]) {
      // Submit for teams 1-6 and 8-10 (skip some for mid)
      for (let i = 0; i < teams.length; i++) {
        if (gw.id === midGw.id && (i === 3 || i === 4)) continue // users 4-5 skip mid GW
        if (gw.id === midGw.id && i === 6) continue // user 7 continues to skip

        const team = teams[i]
        const squad = teamSquads.get(team.id)!
        const slots = generateLineup(squad, i % 11, (i + 1) % 11) // rotate captain

        // Delete existing lineup if any (idempotent)
        const existing = await prisma.lineup.findUnique({
          where: { teamId_gameweekId: { teamId: team.id, gameweekId: gw.id } },
        })
        if (existing) {
          await prisma.lineupSlot.deleteMany({ where: { lineupId: existing.id } })
          await prisma.lineup.delete({ where: { id: existing.id } })
        }

        await prisma.lineup.create({
          data: {
            teamId: team.id,
            gameweekId: gw.id,
            slots: { create: slots },
          },
        })
      }
    }

    // Verify mid GW: users 4-5 have no lineup (carry-forward scenario)
    const user4Lineup = await prisma.lineup.findUnique({
      where: { teamId_gameweekId: { teamId: teams[3].id, gameweekId: midGw.id } },
    })
    expect(user4Lineup).toBeNull() // will carry forward from GW1
  })

  it('chip strategist: user 8 activates POWER_PLAY_BAT', async () => {
    const team8 = teams[7]
    const midGw = gameweeks[Math.floor(gameweeks.length / 2)]

    // Upsert to be idempotent
    await prisma.chipUsage.deleteMany({ where: { teamId: team8.id, chipType: 'POWER_PLAY_BAT' } })
    const chip = await prisma.chipUsage.create({
      data: {
        teamId: team8.id,
        chipType: 'POWER_PLAY_BAT',
        gameweekId: midGw.id,
        status: 'PENDING',
      },
    })
    expect(chip.status).toBe('PENDING')
    expect(chip.chipType).toBe('POWER_PLAY_BAT')
  })

  it('chip strategist: user 9 activates BOWLING_BOOST', async () => {
    const team9 = teams[8]
    const lastGw = gameweeks[gameweeks.length - 1]

    await prisma.chipUsage.deleteMany({ where: { teamId: team9.id, chipType: 'BOWLING_BOOST' } })
    const chip = await prisma.chipUsage.create({
      data: {
        teamId: team9.id,
        chipType: 'BOWLING_BOOST',
        gameweekId: lastGw.id,
        status: 'PENDING',
      },
    })
    expect(chip.status).toBe('PENDING')
  })

  it('one chip per season enforcement: duplicate chip type rejected', async () => {
    const team8 = teams[7]
    // Team 8 already has POWER_PLAY_BAT — trying again should fail (unique constraint)
    await expect(
      prisma.chipUsage.create({
        data: {
          teamId: team8.id,
          chipType: 'POWER_PLAY_BAT',
          gameweekId: gameweeks[gameweeks.length - 1].id,
          status: 'PENDING',
        },
      })
    ).rejects.toThrow()
  })
})
