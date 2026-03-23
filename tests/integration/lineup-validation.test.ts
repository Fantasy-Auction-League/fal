import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { validateLineup } from '@/lib/lineup/validation'
import { isGameweekLocked } from '@/lib/lineup/lock'

const prisma = new PrismaClient()

const TEST_SUFFIX = '@test.vitest'
const adminEmail = `lineup-admin${TEST_SUFFIX}`
const managerEmail = `lineup-mgr${TEST_SUFFIX}`

let league: { id: string }
let team: { id: string }
let playerIds: string[] = []
let gameweek: { id: string }

beforeAll(async () => {
  await cleanup()

  const adminUser = await prisma.user.create({
    data: { email: adminEmail, name: 'Lineup Admin' },
  })

  const managerUser = await prisma.user.create({
    data: { email: managerEmail, name: 'Lineup Manager' },
  })

  league = await prisma.league.create({
    data: {
      name: 'Lineup Test League',
      inviteCode: 'LINEUP-TEST-VITEST',
      adminUserId: adminUser.id,
      minSquadSize: 12,
      maxSquadSize: 15,
    },
  })

  team = await prisma.team.create({
    data: {
      name: 'Lineup Test Team',
      userId: managerUser.id,
      leagueId: league.id,
    },
  })

  // Create 15 test players and assign to team
  for (let i = 0; i < 15; i++) {
    const player = await prisma.player.create({
      data: {
        apiPlayerId: 800000 + i,
        fullname: `Lineup Test Player ${i + 1}`,
        iplTeamId: 99801,
        role: (['BAT', 'BOWL', 'ALL', 'WK'] as const)[i % 4],
      },
    })
    playerIds.push(player.id)

    await prisma.teamPlayer.create({
      data: {
        teamId: team.id,
        playerId: player.id,
        leagueId: league.id,
      },
    })
  }

  // Create a gameweek with future lock time
  gameweek = await prisma.gameweek.create({
    data: {
      number: 99,
      lockTime: new Date(Date.now() + 24 * 60 * 60 * 1000), // tomorrow
      status: 'UPCOMING',
    },
  })
})

afterAll(async () => {
  await cleanup()
  await prisma.$disconnect()
})

async function cleanup() {
  const testEmails = [adminEmail, managerEmail]
  const testUsers = await prisma.user.findMany({
    where: { email: { in: testEmails } },
    select: { id: true },
  })
  const testUserIds = testUsers.map((u) => u.id)

  if (testUserIds.length > 0) {
    const leagues = await prisma.league.findMany({
      where: { adminUserId: { in: testUserIds } },
      select: { id: true },
    })
    const leagueIds = leagues.map((l) => l.id)

    if (leagueIds.length > 0) {
      // Delete lineups and slots
      const teams = await prisma.team.findMany({
        where: { leagueId: { in: leagueIds } },
        select: { id: true },
      })
      const teamIds = teams.map((t) => t.id)
      const lineups = await prisma.lineup.findMany({
        where: { teamId: { in: teamIds } },
        select: { id: true },
      })
      if (lineups.length > 0) {
        await prisma.lineupSlot.deleteMany({
          where: { lineupId: { in: lineups.map((l) => l.id) } },
        })
        await prisma.lineup.deleteMany({ where: { teamId: { in: teamIds } } })
      }

      await prisma.teamPlayer.deleteMany({ where: { leagueId: { in: leagueIds } } })
      await prisma.team.deleteMany({ where: { leagueId: { in: leagueIds } } })
      await prisma.league.deleteMany({ where: { id: { in: leagueIds } } })
    }
  }

  await prisma.user.deleteMany({ where: { email: { in: testEmails } } })
  await prisma.player.deleteMany({
    where: { apiPlayerId: { gte: 800000, lt: 800100 } },
  })
  await prisma.gameweek.deleteMany({ where: { number: 99 } })
}

function buildValidLineup() {
  // 11 XI + 4 bench, first XI player is captain, second is VC
  return {
    slots: [
      ...playerIds.slice(0, 11).map((id, i) => ({
        playerId: id,
        slotType: 'XI' as const,
        benchPriority: null,
        role: i === 0 ? ('CAPTAIN' as const) : i === 1 ? ('VC' as const) : null,
      })),
      ...playerIds.slice(11, 15).map((id, i) => ({
        playerId: id,
        slotType: 'BENCH' as const,
        benchPriority: i + 1,
        role: null,
      })),
    ],
  }
}

describe('Lineup Validation', () => {
  it('should accept a valid lineup: 11 XI + 4 bench, 1 captain, 1 VC', async () => {
    const lineup = buildValidLineup()
    const result = await validateLineup(team.id, league.id, lineup)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('should reject only 10 XI', async () => {
    const lineup = {
      slots: [
        ...playerIds.slice(0, 10).map((id, i) => ({
          playerId: id,
          slotType: 'XI' as const,
          benchPriority: null,
          role: i === 0 ? ('CAPTAIN' as const) : i === 1 ? ('VC' as const) : null,
        })),
        ...playerIds.slice(10, 15).map((id, i) => ({
          playerId: id,
          slotType: 'BENCH' as const,
          benchPriority: i + 1,
          role: null,
        })),
      ],
    }
    const result = await validateLineup(team.id, league.id, lineup)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('11 players'))).toBe(true)
  })

  it('should reject 2 captains', async () => {
    const lineup = buildValidLineup()
    // Make player index 2 also a captain
    lineup.slots[2].role = 'CAPTAIN'
    const result = await validateLineup(team.id, league.id, lineup)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('Captain'))).toBe(true)
  })

  it('should reject captain == VC (same player)', async () => {
    const lineup = buildValidLineup()
    // Make the captain also the VC
    lineup.slots[1].role = null // remove VC from player 1
    lineup.slots[0].role = 'CAPTAIN'
    // Add a second slot-like entry that sets VC on the same player — but we
    // actually need to set both roles on slots referencing the same playerId.
    // Simpler: set captain on slot 0, VC also on slot 0 won't work (one role field).
    // Instead, duplicate the player: put player 0 twice with CAPTAIN and VC.
    const captainPlayerId = lineup.slots[0].playerId
    lineup.slots[1] = {
      playerId: captainPlayerId,
      slotType: 'XI',
      benchPriority: null,
      role: 'VC',
    }
    const result = await validateLineup(team.id, league.id, lineup)
    expect(result.valid).toBe(false)
    // Should fail on either "Captain and Vice Captain must be different" or "Duplicate players"
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('should reject player not on squad', async () => {
    const lineup = buildValidLineup()
    // Replace one player with a fake ID
    lineup.slots[5].playerId = 'not-a-real-player-id'
    const result = await validateLineup(team.id, league.id, lineup)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('not on this team'))).toBe(true)
  })

  it('should reject duplicate player in lineup', async () => {
    const lineup = buildValidLineup()
    // Duplicate player 3 into slot 4
    lineup.slots[4].playerId = lineup.slots[3].playerId
    const result = await validateLineup(team.id, league.id, lineup)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('Duplicate'))).toBe(true)
  })
})

describe('Gameweek Lock', () => {
  it('should return true when lockTime is in the past', () => {
    const pastLock = new Date(Date.now() - 60 * 60 * 1000) // 1 hour ago
    expect(isGameweekLocked(pastLock)).toBe(true)
  })

  it('should return false when lockTime is in the future', () => {
    const futureLock = new Date(Date.now() + 60 * 60 * 1000) // 1 hour from now
    expect(isGameweekLocked(futureLock)).toBe(false)
  })

  it('should return false when lockTime is null', () => {
    expect(isGameweekLocked(null)).toBe(false)
  })
})
