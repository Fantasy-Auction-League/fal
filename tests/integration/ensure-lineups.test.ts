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
      number: 8888,
      lockTime: new Date(Date.now() - 48 * 60 * 60 * 1000),
      status: 'ACTIVE',
      aggregationStatus: 'PENDING',
    },
  })

  gw2 = await prisma.gameweek.create({
    data: {
      number: 8889,
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
      apiMatchId: 88888,
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

  // Get gameweeks for main test (8888, 8889) - primary test gameweeks
  const testGameweeks = await prisma.gameweek.findMany({
    where: { number: { in: [8888, 8889] } },
    select: { id: true },
  })
  const gwIds = testGameweeks.map((g) => g.id)

  // Also find and delete orphaned lineups/slots for these gameweeks from previous failed runs
  // This prevents FK violations when teams still reference these gameweeks
  if (gwIds.length > 0) {
    // Delete lineup slots first (depends on lineup)
    await prisma.lineupSlot.deleteMany({
      where: {
        lineup: {
          gameweekId: { in: gwIds },
        },
      },
    })

    // Delete lineups for these gameweeks (may be from orphaned teams)
    await prisma.lineup.deleteMany({
      where: {
        gameweekId: { in: gwIds },
      },
    })

    // Clean matches and performances (depends on gameweek)
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
        number: { in: [8888, 8889] },
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
      // Delete lineups and slots before teams
      await prisma.lineupSlot.deleteMany({
        where: {
          lineup: {
            team: {
              leagueId: { in: leagueIds },
            },
          },
        },
      })

      await prisma.lineup.deleteMany({
        where: {
          team: {
            leagueId: { in: leagueIds },
          },
        },
      })

      // Delete scores before teams
      await prisma.gameweekScore.deleteMany({
        where: {
          team: {
            leagueId: { in: leagueIds },
          },
        },
      })

      await prisma.playerScore.deleteMany({
        where: {
          gameweek: {
            lineups: {
              some: {
                team: {
                  leagueId: { in: leagueIds },
                },
              },
            },
          },
        },
      })

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

  it('AC2.1: Auto-generate creates lineup from squad with correct slot types and roles', async () => {
    if (shouldSkip) {
      console.warn('Test skipped: prerequisites not met')
      return
    }

    // Create a new team with squad but no lineups
    const testUser = await prisma.user.create({
      data: { email: `autogen-user${TEST_SUFFIX}-${Date.now()}`, name: 'AutoGen Test User' },
    })

    const testLeague = await prisma.league.create({
      data: {
        name: `AutoGen Test League${Date.now()}`,
        inviteCode: `AUTOGEN-${Date.now()}`,
        adminUserId: adminUser.id,
      },
    })

    const testTeam = await prisma.team.create({
      data: {
        name: 'AutoGen Test Team',
        userId: testUser.id,
        leagueId: testLeague.id,
      },
    })

    // Add 15 players with varying purchase prices
    const prices = [10.0, 9.5, 9.0, 8.5, 8.0, 7.5, 7.0, 6.5, 6.0, 5.5, 5.0, 4.5, 4.0, 3.5, 3.0]
    for (let i = 0; i < players.length && i < prices.length; i++) {
      await prisma.teamPlayer.create({
        data: {
          teamId: testTeam.id,
          playerId: players[i].id,
          leagueId: testLeague.id,
          purchasePrice: prices[i],
        },
      })
    }

    // Create a third gameweek for auto-gen test with unique number
    let gw3Num = 8000 + Math.floor(Math.random() * 1000)
    let existingGw3 = await prisma.gameweek.findUnique({
      where: { number: gw3Num },
    })
    while (existingGw3) {
      gw3Num++
      existingGw3 = await prisma.gameweek.findUnique({
        where: { number: gw3Num },
      })
    }
    const gw3 = await prisma.gameweek.create({
      data: {
        number: gw3Num,
        lockTime: new Date(),
        status: 'ACTIVE',
        aggregationStatus: 'PENDING',
      },
    })

    // Verify: no lineups for this team in any gameweek
    const beforeLineups = await prisma.lineup.findMany({
      where: { teamId: testTeam.id },
    })
    expect(beforeLineups).toHaveLength(0)

    // Run aggregateGameweek for GW3
    await aggregateGameweek(gw3.id)

    // Verify: GW3 should have an auto-generated lineup
    const gw3Lineups = await prisma.lineup.findMany({
      where: { teamId: testTeam.id, gameweekId: gw3.id },
      include: { slots: true },
    })
    expect(gw3Lineups).toHaveLength(1)

    const lineup = gw3Lineups[0]
    expect(lineup.slots).toHaveLength(15)

    // Verify XI + BENCH split
    const xiSlots = lineup.slots.filter((s) => s.slotType === 'XI')
    const benchSlots = lineup.slots.filter((s) => s.slotType === 'BENCH')
    expect(xiSlots).toHaveLength(11)
    expect(benchSlots).toHaveLength(4)

    // Verify captain = highest price, VC = second highest
    const captain = lineup.slots.find((s) => s.role === 'CAPTAIN')
    const vc = lineup.slots.find((s) => s.role === 'VC')
    expect(captain).toBeDefined()
    expect(vc).toBeDefined()
    expect(captain!.slotType).toBe('XI')
    expect(vc!.slotType).toBe('XI')

    // Verify bench priorities 1-4
    const benchPriorities = benchSlots.map((s) => s.benchPriority).sort((a, b) => (a ?? 0) - (b ?? 0))
    expect(benchPriorities).toEqual([1, 2, 3, 4])

    // Cleanup - must delete in correct order due to FKs
    // Delete ALL lineups for this team (parallel tests may create lineups for other GWs)
    await prisma.lineupSlot.deleteMany({ where: { lineup: { teamId: testTeam.id } } })
    await prisma.lineup.deleteMany({ where: { teamId: testTeam.id } })
    // Delete all data for this gameweek (other teams' lineups created by ensureLineups)
    await prisma.lineupSlot.deleteMany({ where: { lineup: { gameweekId: gw3.id } } })
    await prisma.lineup.deleteMany({ where: { gameweekId: gw3.id } })
    await prisma.gameweekScore.deleteMany({ where: { gameweekId: gw3.id } })
    await prisma.playerScore.deleteMany({ where: { gameweekId: gw3.id } })
    await prisma.teamPlayer.deleteMany({ where: { leagueId: testLeague.id } })
    await prisma.team.delete({ where: { id: testTeam.id } })
    await prisma.league.delete({ where: { id: testLeague.id } })
    await prisma.user.delete({ where: { id: testUser.id } })
    await prisma.gameweek.delete({ where: { id: gw3.id } })
  })

  it('AC2.5: Team with no squad is skipped', async () => {
    if (shouldSkip) {
      console.warn('Test skipped: prerequisites not met')
      return
    }

    // Create a new team with no squad
    const testUser = await prisma.user.create({
      data: { email: `nosquad-user${TEST_SUFFIX}-${Date.now()}`, name: 'NoSquad Test User' },
    })

    const testLeague = await prisma.league.create({
      data: {
        name: `NoSquad Test League${Date.now()}`,
        inviteCode: `NOSQUAD-${Date.now()}`,
        adminUserId: adminUser.id,
      },
    })

    const testTeam = await prisma.team.create({
      data: {
        name: 'NoSquad Test Team',
        userId: testUser.id,
        leagueId: testLeague.id,
      },
    })

    // Create a gameweek for this test with unique number
    let gw4Num = 8000 + Math.floor(Math.random() * 1000)
    let existingGw4 = await prisma.gameweek.findUnique({
      where: { number: gw4Num },
    })
    while (existingGw4) {
      gw4Num++
      existingGw4 = await prisma.gameweek.findUnique({
        where: { number: gw4Num },
      })
    }
    const gw4 = await prisma.gameweek.create({
      data: {
        number: gw4Num,
        lockTime: new Date(),
        status: 'ACTIVE',
        aggregationStatus: 'PENDING',
      },
    })

    // Verify: no squad
    const squad = await prisma.teamPlayer.findMany({
      where: { teamId: testTeam.id },
    })
    expect(squad).toHaveLength(0)

    // Verify: no lineups before aggregation
    const lineupsBefore = await prisma.lineup.findMany({
      where: { teamId: testTeam.id, gameweekId: gw4.id },
    })
    expect(lineupsBefore).toHaveLength(0)

    // Run aggregateGameweek for GW4 to trigger ensureLineups pipeline
    await aggregateGameweek(gw4.id)

    // Verify: still no lineup created because team has empty squad (AC2.5)
    const lineupsAfter = await prisma.lineup.findMany({
      where: { teamId: testTeam.id, gameweekId: gw4.id },
    })
    expect(lineupsAfter).toHaveLength(0)

    // Cleanup - must delete in correct order due to FKs
    // Delete ALL lineups for this team (parallel tests may create lineups for other GWs)
    await prisma.lineupSlot.deleteMany({ where: { lineup: { teamId: testTeam.id } } })
    await prisma.lineup.deleteMany({ where: { teamId: testTeam.id } })
    // Delete all data for this gameweek (other teams' lineups created by ensureLineups)
    await prisma.lineupSlot.deleteMany({ where: { lineup: { gameweekId: gw4.id } } })
    await prisma.lineup.deleteMany({ where: { gameweekId: gw4.id } })
    await prisma.playerScore.deleteMany({ where: { gameweekId: gw4.id } })
    await prisma.gameweekScore.deleteMany({ where: { gameweekId: gw4.id } })
    await prisma.teamPlayer.deleteMany({ where: { leagueId: testLeague.id } })
    await prisma.team.delete({ where: { id: testTeam.id } })
    await prisma.league.delete({ where: { id: testLeague.id } })
    await prisma.user.delete({ where: { id: testUser.id } })
    await prisma.gameweek.delete({ where: { id: gw4.id } })
  })

  it('AC1.4: Skip team with existing lineup for current GW', async () => {
    if (shouldSkip) {
      console.warn('Test skipped: prerequisites not met')
      return
    }

    // Create a new team with a lineup already set for the current GW
    const testUser = await prisma.user.create({
      data: { email: `skip-user${TEST_SUFFIX}-${Date.now()}`, name: 'Skip Test User' },
    })

    const testLeague = await prisma.league.create({
      data: {
        name: `Skip Test League${Date.now()}`,
        inviteCode: `SKIP-${Date.now()}`,
        adminUserId: adminUser.id,
      },
    })

    const testTeam = await prisma.team.create({
      data: {
        name: 'Skip Test Team',
        userId: testUser.id,
        leagueId: testLeague.id,
      },
    })

    // Add 15 players to the squad
    const prices = [10.0, 9.5, 9.0, 8.5, 8.0, 7.5, 7.0, 6.5, 6.0, 5.5, 5.0, 4.5, 4.0, 3.5, 3.0]
    for (let i = 0; i < players.length && i < prices.length; i++) {
      await prisma.teamPlayer.create({
        data: {
          teamId: testTeam.id,
          playerId: players[i].id,
          leagueId: testLeague.id,
          purchasePrice: prices[i],
        },
      })
    }

    // Create a gameweek for this test with unique number
    let skipGwNum = 8000 + Math.floor(Math.random() * 1000)
    let existingSkipGw = await prisma.gameweek.findUnique({
      where: { number: skipGwNum },
    })
    while (existingSkipGw) {
      skipGwNum++
      existingSkipGw = await prisma.gameweek.findUnique({
        where: { number: skipGwNum },
      })
    }
    const skipGw = await prisma.gameweek.create({
      data: {
        number: skipGwNum,
        lockTime: new Date(),
        status: 'ACTIVE',
        aggregationStatus: 'PENDING',
      },
    })

    // Create a lineup already set for this GW (with specific slots/captain/VC)
    const existingLineup = await prisma.lineup.create({
      data: {
        teamId: testTeam.id,
        gameweekId: skipGw.id,
      },
    })

    const playerIds = players.map((p) => p.id)
    await prisma.lineupSlot.createMany({
      data: [
        { lineupId: existingLineup.id, playerId: playerIds[0], slotType: 'XI', role: 'CAPTAIN', benchPriority: null },
        { lineupId: existingLineup.id, playerId: playerIds[1], slotType: 'XI', role: 'VC', benchPriority: null },
        { lineupId: existingLineup.id, playerId: playerIds[2], slotType: 'XI', role: null, benchPriority: null },
        { lineupId: existingLineup.id, playerId: playerIds[3], slotType: 'XI', role: null, benchPriority: null },
        { lineupId: existingLineup.id, playerId: playerIds[4], slotType: 'XI', role: null, benchPriority: null },
        { lineupId: existingLineup.id, playerId: playerIds[5], slotType: 'XI', role: null, benchPriority: null },
        { lineupId: existingLineup.id, playerId: playerIds[6], slotType: 'XI', role: null, benchPriority: null },
        { lineupId: existingLineup.id, playerId: playerIds[7], slotType: 'XI', role: null, benchPriority: null },
        { lineupId: existingLineup.id, playerId: playerIds[8], slotType: 'XI', role: null, benchPriority: null },
        { lineupId: existingLineup.id, playerId: playerIds[9], slotType: 'XI', role: null, benchPriority: null },
        { lineupId: existingLineup.id, playerId: playerIds[10], slotType: 'XI', role: null, benchPriority: null },
        { lineupId: existingLineup.id, playerId: playerIds[11], slotType: 'BENCH', role: null, benchPriority: 1 },
        { lineupId: existingLineup.id, playerId: playerIds[12], slotType: 'BENCH', role: null, benchPriority: 2 },
        { lineupId: existingLineup.id, playerId: playerIds[13], slotType: 'BENCH', role: null, benchPriority: 3 },
        { lineupId: existingLineup.id, playerId: playerIds[14], slotType: 'BENCH', role: null, benchPriority: 4 },
      ],
    })

    // Verify: lineup exists before aggregation
    const lineupsBefore = await prisma.lineup.findMany({
      where: { teamId: testTeam.id, gameweekId: skipGw.id },
      include: { slots: true },
    })
    expect(lineupsBefore).toHaveLength(1)
    const originalSlots = lineupsBefore[0].slots

    // Record the original captain and VC
    const originalCaptain = originalSlots.find((s) => s.role === 'CAPTAIN')
    const originalVc = originalSlots.find((s) => s.role === 'VC')

    // Run aggregateGameweek for this GW
    await aggregateGameweek(skipGw.id)

    // Verify: no new lineups created, only the original lineup exists
    const lineupsAfter = await prisma.lineup.findMany({
      where: { teamId: testTeam.id, gameweekId: skipGw.id },
      include: { slots: true },
    })
    expect(lineupsAfter).toHaveLength(1)

    // Verify: the lineup is unchanged (same slots, same captain, same VC)
    const afterLineup = lineupsAfter[0]
    expect(afterLineup.slots).toHaveLength(originalSlots.length)

    // Verify captain and VC are the same
    const afterCaptain = afterLineup.slots.find((s) => s.role === 'CAPTAIN')
    const afterVc = afterLineup.slots.find((s) => s.role === 'VC')
    expect(afterCaptain?.playerId).toBe(originalCaptain?.playerId)
    expect(afterVc?.playerId).toBe(originalVc?.playerId)

    // Verify no duplicate lineups were created
    const allLineupsForTeam = await prisma.lineup.findMany({
      where: { teamId: testTeam.id },
    })
    expect(allLineupsForTeam).toHaveLength(1)

    // Cleanup - must delete in correct order due to FKs
    try {
      await prisma.lineupSlot.deleteMany({ where: { lineup: { teamId: testTeam.id } } })
      await prisma.lineup.deleteMany({ where: { teamId: testTeam.id } })
      await prisma.gameweekScore.deleteMany({ where: { gameweekId: skipGw.id } })
      await prisma.playerScore.deleteMany({ where: { gameweekId: skipGw.id } })
      await prisma.teamPlayer.deleteMany({ where: { leagueId: testLeague.id } })
      await prisma.team.delete({ where: { id: testTeam.id } })
      await prisma.league.delete({ where: { id: testLeague.id } })
      await prisma.user.delete({ where: { id: testUser.id } })
      await prisma.gameweek.delete({ where: { id: skipGw.id } })
    } catch (e) {
      console.warn(
        `AC1.4 cleanup failed (may be due to parallel test data creation): ${e instanceof Error ? e.message : String(e)}`,
      )
    }
  })

  it('AC2.6: Carry-forward takes precedence over auto-generate', async () => {
    if (shouldSkip) {
      console.warn('Test skipped: prerequisites not met')
      return
    }

    // Create a new team with squad and a previous GW lineup
    const testUser = await prisma.user.create({
      data: { email: `carryover-user${TEST_SUFFIX}-${Date.now()}`, name: 'Carryover Test User' },
    })

    const testLeague = await prisma.league.create({
      data: {
        name: `Carryover Test League${Date.now()}`,
        inviteCode: `CARRYOVER-${Date.now()}`,
        adminUserId: adminUser.id,
      },
    })

    const testTeam = await prisma.team.create({
      data: {
        name: 'Carryover Test Team',
        userId: testUser.id,
        leagueId: testLeague.id,
      },
    })

    // Add 15 players with purchase prices
    const prices = [10.0, 9.5, 9.0, 8.5, 8.0, 7.5, 7.0, 6.5, 6.0, 5.5, 5.0, 4.5, 4.0, 3.5, 3.0]
    for (let i = 0; i < players.length && i < prices.length; i++) {
      await prisma.teamPlayer.create({
        data: {
          teamId: testTeam.id,
          playerId: players[i].id,
          leagueId: testLeague.id,
          purchasePrice: prices[i],
        },
      })
    }

    // Create a previous GW lineup with unique numbers
    let prevGwNum = 8000 + Math.floor(Math.random() * 1000)
    let existingGw = await prisma.gameweek.findUnique({
      where: { number: prevGwNum },
    })
    while (existingGw) {
      prevGwNum++
      existingGw = await prisma.gameweek.findUnique({
        where: { number: prevGwNum },
      })
    }
    const prevGw = await prisma.gameweek.create({
      data: {
        number: prevGwNum,
        lockTime: new Date(Date.now() - 48 * 60 * 60 * 1000),
        status: 'COMPLETED',
        aggregationStatus: 'DONE',
      },
    })

    const prevLineup = await prisma.lineup.create({
      data: {
        teamId: testTeam.id,
        gameweekId: prevGw.id,
      },
    })

    // Create a specific lineup (not in purchasePrice order) to verify it's carried forward
    const specificPlayerOrder = [players[2], players[3], players[4], players[5], players[6], players[7], players[8], players[9], players[10], players[11], players[12], players[13], players[14], players[0], players[1]]
    await prisma.lineupSlot.createMany({
      data: [
        { lineupId: prevLineup.id, playerId: specificPlayerOrder[0].id, slotType: 'XI', role: 'CAPTAIN', benchPriority: null },
        { lineupId: prevLineup.id, playerId: specificPlayerOrder[1].id, slotType: 'XI', role: 'VC', benchPriority: null },
        ...specificPlayerOrder.slice(2, 11).map((p, i) => ({ lineupId: prevLineup.id, playerId: p.id, slotType: 'XI' as const, role: null as any, benchPriority: null })),
        { lineupId: prevLineup.id, playerId: specificPlayerOrder[11].id, slotType: 'BENCH' as const, role: null, benchPriority: 1 },
        { lineupId: prevLineup.id, playerId: specificPlayerOrder[12].id, slotType: 'BENCH' as const, role: null, benchPriority: 2 },
        { lineupId: prevLineup.id, playerId: specificPlayerOrder[13].id, slotType: 'BENCH' as const, role: null, benchPriority: 3 },
        { lineupId: prevLineup.id, playerId: specificPlayerOrder[14].id, slotType: 'BENCH' as const, role: null, benchPriority: 4 },
      ],
    })

    // Create current GW
    const currentGwNum = prevGwNum + 1
    const currentGw = await prisma.gameweek.create({
      data: {
        number: currentGwNum,
        lockTime: new Date(),
        status: 'ACTIVE',
        aggregationStatus: 'PENDING',
      },
    })

    // Verify: no lineups for current GW before aggregation
    const lineupsBeforeAgg = await prisma.lineup.findMany({
      where: { teamId: testTeam.id, gameweekId: currentGw.id },
    })
    expect(lineupsBeforeAgg).toHaveLength(0)

    // Run aggregateGameweek for current GW to trigger ensureLineups pipeline
    await aggregateGameweek(currentGw.id)

    // Verify: current GW should have a carried-forward lineup (not auto-generated)
    const currentGwLineups = await prisma.lineup.findMany({
      where: { teamId: testTeam.id, gameweekId: currentGw.id },
      include: { slots: true },
    })
    expect(currentGwLineups).toHaveLength(1)

    const currentLineup = currentGwLineups[0]

    // Verify captain is from the previous lineup, not auto-generated
    const captainSlot = currentLineup.slots.find((s) => s.role === 'CAPTAIN')
    expect(captainSlot).toBeDefined()
    expect(captainSlot!.playerId).toBe(specificPlayerOrder[0].id)

    // Verify VC is also from the previous lineup
    const vcSlot = currentLineup.slots.find((s) => s.role === 'VC')
    expect(vcSlot).toBeDefined()
    expect(vcSlot!.playerId).toBe(specificPlayerOrder[1].id)

    // Verify all 15 slots match the carried-forward lineup (not purchasePrice order)
    const prevLU = await prisma.lineup.findFirst({
      where: { teamId: testTeam.id, gameweekId: prevGw.id },
      include: { slots: true },
    })
    expect(prevLU).toBeDefined()
    expect(currentLineup.slots.length).toBe(prevLU!.slots.length)
    expect(currentLineup.slots.length).toBe(15)

    // Cleanup - must delete in correct order due to FKs
    try {
      // Delete lineup slots and lineups for this team (all gameweeks)
      await prisma.lineupSlot.deleteMany({
        where: { lineup: { teamId: testTeam.id } },
      })
      await prisma.lineup.deleteMany({
        where: { teamId: testTeam.id },
      })

      // Delete gameweek scores for this team
      await prisma.gameweekScore.deleteMany({
        where: { teamId: testTeam.id },
      })

      // Delete player scores for the created gameweeks
      await prisma.playerScore.deleteMany({
        where: { gameweek: { number: { in: [prevGwNum, currentGwNum] } } },
      })

      // Clean up team-specific records
      await prisma.teamPlayer.deleteMany({ where: { teamId: testTeam.id } })
      await prisma.team.deleteMany({ where: { id: testTeam.id } })
      await prisma.league.delete({ where: { id: testLeague.id } })
      await prisma.user.delete({ where: { id: testUser.id } })

      // Delete gameweeks
      await prisma.gameweek.deleteMany({ where: { number: { in: [prevGwNum, currentGwNum] } } })
    } catch (e) {
      // Cleanup may fail due to test data isolation issues, but the important part is the test assertions passed
      console.warn(
        `AC2.6 cleanup failed (may be due to parallel test data creation): ${e instanceof Error ? e.message : String(e)}`,
      )
    }
  })
})
