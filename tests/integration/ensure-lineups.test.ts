import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { aggregateGameweek } from '@/lib/scoring/pipeline'

const prisma = new PrismaClient()

const TEST_SUFFIX = '@test.vitest.ensurelineups'
const adminEmail = `ensure-admin${TEST_SUFFIX}`

let league: { id: string }
let gw1: { id: string; number: number }
let gw2: { id: string; number: number }
let team: { id: string }
let adminUser: { id: string }
let match: { id: string }
let players: { id: string; apiPlayerId: number }[] = []
let shouldSkip = false
let gw2Lineups: any = []

beforeAll(async () => {
  await cleanup()

  // Check if we have at least 15 seed players
  const allPlayers = await prisma.player.findMany({
    take: 15,
    select: { id: true, apiPlayerId: true },
  })

  if (allPlayers.length < 15) {
    console.warn(`Skipping ensure-lineups integration test: only ${allPlayers.length} players found (need 15). Run seed first.`)
    shouldSkip = true
    return
  }

  players = allPlayers
  const playerIds = players.map((p) => p.id)

  // Create test user and league
  adminUser = await prisma.user.create({
    data: { email: adminEmail, name: 'Ensure Test Admin' },
  })

  league = await prisma.league.create({
    data: {
      name: 'Ensure Lineups Test League',
      inviteCode: `ENSURE-TEST-${Date.now()}`,
      adminUserId: adminUser.id,
    },
  })

  // Create two gameweeks
  gw1 = await prisma.gameweek.create({
    data: {
      number: 9998,
      lockTime: new Date(Date.now() - 48 * 60 * 60 * 1000),
      status: 'ACTIVE',
      aggregationStatus: 'PENDING',
    },
  })

  gw2 = await prisma.gameweek.create({
    data: {
      number: 9999,
      lockTime: new Date(Date.now() - 24 * 60 * 60 * 1000),
      status: 'ACTIVE',
      aggregationStatus: 'PENDING',
    },
  })

  // Create test user's team
  const user = await prisma.user.create({
    data: { email: `user${TEST_SUFFIX}`, name: 'Test User' },
  })

  team = await prisma.team.create({
    data: {
      name: 'Ensure Test Team',
      userId: user.id,
      leagueId: league.id,
    },
  })

  // Add 15 players to team
  for (const player of players) {
    await prisma.teamPlayer.create({
      data: {
        teamId: team.id,
        playerId: player.id,
        leagueId: league.id,
      },
    })
  }

  // Create lineup for GW1 (11 XI + 4 bench, with captain/VC)
  const gw1Lineup = await prisma.lineup.create({
    data: {
      teamId: team.id,
      gameweekId: gw1.id,
    },
  })

  // Create 11 XI slots (with captain and VC)
  await prisma.lineupSlot.createMany({
    data: [
      { lineupId: gw1Lineup.id, playerId: playerIds[0], slotType: 'XI', role: 'CAPTAIN', benchPriority: null },
      { lineupId: gw1Lineup.id, playerId: playerIds[1], slotType: 'XI', role: 'VC', benchPriority: null },
      { lineupId: gw1Lineup.id, playerId: playerIds[2], slotType: 'XI', role: null, benchPriority: null },
      { lineupId: gw1Lineup.id, playerId: playerIds[3], slotType: 'XI', role: null, benchPriority: null },
      { lineupId: gw1Lineup.id, playerId: playerIds[4], slotType: 'XI', role: null, benchPriority: null },
      { lineupId: gw1Lineup.id, playerId: playerIds[5], slotType: 'XI', role: null, benchPriority: null },
      { lineupId: gw1Lineup.id, playerId: playerIds[6], slotType: 'XI', role: null, benchPriority: null },
      { lineupId: gw1Lineup.id, playerId: playerIds[7], slotType: 'XI', role: null, benchPriority: null },
      { lineupId: gw1Lineup.id, playerId: playerIds[8], slotType: 'XI', role: null, benchPriority: null },
      { lineupId: gw1Lineup.id, playerId: playerIds[9], slotType: 'XI', role: null, benchPriority: null },
      { lineupId: gw1Lineup.id, playerId: playerIds[10], slotType: 'XI', role: null, benchPriority: null },
      // 4 bench slots with priorities
      { lineupId: gw1Lineup.id, playerId: playerIds[11], slotType: 'BENCH', role: null, benchPriority: 1 },
      { lineupId: gw1Lineup.id, playerId: playerIds[12], slotType: 'BENCH', role: null, benchPriority: 2 },
      { lineupId: gw1Lineup.id, playerId: playerIds[13], slotType: 'BENCH', role: null, benchPriority: 3 },
      { lineupId: gw1Lineup.id, playerId: playerIds[14], slotType: 'BENCH', role: null, benchPriority: 4 },
    ],
  })

  // Create match for GW2 with some players from our squad
  match = await prisma.match.create({
    data: {
      apiMatchId: 99999,
      gameweekId: gw2.id,
      localTeamId: 999,
      visitorTeamId: 998,
      localTeamName: 'Test Team A',
      visitorTeamName: 'Test Team B',
      startingAt: new Date(),
      apiStatus: 'Finished',
      scoringStatus: 'SCORED', // Mark as scored so aggregateGameweek picks it up
    },
  })

  // Create PlayerPerformance records for some of our squad players
  const perfPlayers = playerIds.slice(0, 5) // Use first 5 players
  for (let i = 0; i < perfPlayers.length; i++) {
    await prisma.playerPerformance.create({
      data: {
        matchId: match.id,
        playerId: perfPlayers[i],
        runs: (i + 1) * 10,
        balls: (i + 1) * 20,
        fours: (i + 1),
        sixes: 0,
        inStartingXI: i < 3, // First 3 in starting XI
        fantasyPoints: 10 + i * 2, // Some base fantasy points
      },
    })
  }
})

afterAll(async () => {
  await cleanup()
  await prisma.$disconnect()
})

async function cleanup() {
  // Delete test data in FK order
  const testEmails = [adminEmail, `user${TEST_SUFFIX}`]

  // Get gameweeks first
  const testGameweeks = await prisma.gameweek.findMany({
    where: { number: { in: [9998, 9999] } },
    select: { id: true },
  })
  const gwIds = testGameweeks.map((g) => g.id)

  // Clean matches and performances first (depends on gameweek)
  if (gwIds.length > 0) {
    await prisma.playerPerformance.deleteMany({
      where: {
        match: {
          gameweekId: { in: gwIds },
        },
      },
    })

    await prisma.match.deleteMany({
      where: {
        gameweekId: { in: gwIds },
      },
    })

    // Clean lineup slots (depends on lineup)
    await prisma.lineupSlot.deleteMany({
      where: {
        lineup: {
          gameweekId: { in: gwIds },
        },
      },
    })

    // Clean lineups
    await prisma.lineup.deleteMany({
      where: {
        gameweekId: { in: gwIds },
      },
    })

    // Clean scores
    await prisma.playerScore.deleteMany({
      where: {
        gameweekId: { in: gwIds },
      },
    })

    await prisma.gameweekScore.deleteMany({
      where: {
        gameweekId: { in: gwIds },
      },
    })

    // Now delete gameweeks
    await prisma.gameweek.deleteMany({
      where: {
        number: { in: [9998, 9999] },
      },
    })
  }

  // Get test users for additional cleanup
  const testUsers = await prisma.user.findMany({
    where: { email: { in: testEmails } },
    select: { id: true },
  })
  const testUserIds = testUsers.map((u) => u.id)

  if (testUserIds.length > 0) {
    const testLeagues = await prisma.league.findMany({
      where: { OR: [{ adminUserId: { in: testUserIds } }] },
      select: { id: true },
    })
    const leagueIds = testLeagues.map((l) => l.id)

    // Clean team players and teams
    if (leagueIds.length > 0) {
      await prisma.teamPlayer.deleteMany({
        where: { leagueId: { in: leagueIds } },
      })

      await prisma.team.deleteMany({
        where: { leagueId: { in: leagueIds } },
      })

      // Clean leagues
      await prisma.league.deleteMany({
        where: { id: { in: leagueIds } },
      })
    }
  }

  // Clean users
  await prisma.user.deleteMany({
    where: { email: { in: testEmails } },
  })
}

describe('Ensure Lineups - Integration Test', () => {
  it('AC3.2: carry-forward results in team scoring points through full pipeline', async () => {
    if (shouldSkip) {
      console.warn('Test skipped: prerequisites not met')
      return
    }

    // Before aggregation: GW2 has no lineup for our team
    gw2Lineups = await prisma.lineup.findMany({
      where: { teamId: team.id, gameweekId: gw2.id },
    })
    expect(gw2Lineups).toHaveLength(0)

    // Run aggregateGameweek for GW2
    await aggregateGameweek(gw2.id)

    // After aggregation: GW2 should have a carried-forward lineup
    gw2Lineups = (await prisma.lineup.findMany({
      where: { teamId: team.id, gameweekId: gw2.id },
      include: { slots: true },
    })) as any
    expect(gw2Lineups).toHaveLength(1)

    const gw2Lineup = gw2Lineups[0]
    expect(gw2Lineup.slots.length).toBeGreaterThan(0)

    // Verify lineup was carried forward (should have 15 slots: 11 XI + 4 bench)
    expect(gw2Lineup.slots.length).toBe(15)

    // Verify captain and VC were preserved
    const captainSlot = gw2Lineup.slots.find((s: any) => s.role === 'CAPTAIN')
    const vcSlot = gw2Lineup.slots.find((s: any) => s.role === 'VC')
    expect(captainSlot).toBeDefined()
    expect(vcSlot).toBeDefined()

    // Verify bench priorities were preserved
    const benchSlots = gw2Lineup.slots.filter((s: any) => s.slotType === 'BENCH')
    expect(benchSlots.length).toBe(4)
    expect(benchSlots.some((s: any) => s.benchPriority === 1)).toBe(true)
    expect(benchSlots.some((s: any) => s.benchPriority === 4)).toBe(true)

    // Verify GameweekScore exists with non-zero points
    const gw2Score = await prisma.gameweekScore.findUnique({
      where: { teamId_gameweekId: { teamId: team.id, gameweekId: gw2.id } },
    })
    expect(gw2Score).toBeDefined()
    expect(gw2Score!.totalPoints).toBeGreaterThan(0)

    // Verify team's total points were incremented
    const updatedTeam = await prisma.team.findUnique({
      where: { id: team.id },
    })
    expect(updatedTeam!.totalPoints).toBeGreaterThan(0)
  })
})
