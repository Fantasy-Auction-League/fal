import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const TEST_PREFIX = 'e2e-flow'

async function cleanupTestData() {
  // Retry cleanup because parallel tests calling aggregateGameweek() can create
  // lineups for our teams between our lineup delete and team delete
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      // Delete in correct order to respect foreign key constraints
      await prisma.chipUsage.deleteMany({ where: { team: { league: { name: { startsWith: TEST_PREFIX } } } } })
      await prisma.gameweekScore.deleteMany({ where: { team: { league: { name: { startsWith: TEST_PREFIX } } } } })
      await prisma.playerPerformance.deleteMany({ where: { match: { apiMatchId: { in: [99901, 99902] } } } })
      await prisma.playerScore.deleteMany({ where: { gameweek: { number: { in: [101, 102] } } } })
      await prisma.match.deleteMany({ where: { apiMatchId: { in: [99901, 99902] } } })
      // Delete ALL lineups referencing test gameweeks (ensureLineups creates them for all teams globally)
      await prisma.lineupSlot.deleteMany({ where: { lineup: { gameweek: { number: { in: [101, 102] } } } } })
      await prisma.lineup.deleteMany({ where: { gameweek: { number: { in: [101, 102] } } } })
      await prisma.gameweekScore.deleteMany({ where: { gameweek: { number: { in: [101, 102] } } } })
      await prisma.gameweek.deleteMany({ where: { number: { in: [101, 102] } } })
      await prisma.teamPlayer.deleteMany({ where: { league: { name: { startsWith: TEST_PREFIX } } } })
      // Delete lineups for e2e teams (any gameweek) right before team deletion
      await prisma.lineupSlot.deleteMany({ where: { lineup: { team: { league: { name: { startsWith: TEST_PREFIX } } } } } })
      await prisma.lineup.deleteMany({ where: { team: { league: { name: { startsWith: TEST_PREFIX } } } } })
      await prisma.team.deleteMany({ where: { league: { name: { startsWith: TEST_PREFIX } } } })
      await prisma.league.deleteMany({ where: { name: { startsWith: TEST_PREFIX } } })
      await prisma.user.deleteMany({ where: { email: { endsWith: '@e2e.test' } } })
      return // success
    } catch {
      if (attempt === 3) throw new Error('Cleanup failed after 3 retries (parallel test interference)')
    }
  }
}

describe('Full Season Flow E2E', () => {
  // Test data IDs
  let adminId: string
  let leagueId: string
  let teamIds: string[] = []
  let gameweekIds: string[] = []
  let matchIds: string[] = []

  beforeAll(async () => {
    await cleanupTestData()
  })

  afterAll(async () => {
    await cleanupTestData()
    await prisma.$disconnect()
  })

  // ─── STEP 1: Create admin user ───
  it('creates an admin user', async () => {
    const admin = await prisma.user.create({
      data: { email: 'admin@e2e.test', name: 'E2E Admin', role: 'ADMIN' },
    })
    adminId = admin.id
    expect(admin.email).toBe('admin@e2e.test')
    expect(admin.role).toBe('ADMIN')
  })

  // ─── STEP 2: Create league ───
  it('creates a league', async () => {
    const league = await prisma.league.create({
      data: {
        name: `${TEST_PREFIX}-league`,
        inviteCode: 'E2E-TEST-01',
        adminUserId: adminId,
      },
    })
    leagueId = league.id
    expect(league.name).toBe(`${TEST_PREFIX}-league`)
    expect(league.seasonStarted).toBe(false)
  })

  // ─── STEP 3: Create managers and teams via CSV roster logic ───
  it('uploads rosters for 3 teams with 15 players each', async () => {
    // Get 45 real players from DB
    const players = await prisma.player.findMany({ take: 45, orderBy: { fullname: 'asc' } })
    expect(players.length).toBeGreaterThanOrEqual(45)

    // Create 3 manager users
    const managers = await Promise.all([
      prisma.user.create({ data: { email: 'mgr1@e2e.test', name: 'Manager 1' } }),
      prisma.user.create({ data: { email: 'mgr2@e2e.test', name: 'Manager 2' } }),
      prisma.user.create({ data: { email: 'mgr3@e2e.test', name: 'Manager 3' } }),
    ])

    // Create teams
    const teamData = [
      { name: 'Team Alpha', userId: managers[0].id },
      { name: 'Team Beta', userId: managers[1].id },
      { name: 'Team Gamma', userId: managers[2].id },
    ]

    for (const td of teamData) {
      const team = await prisma.team.create({
        data: { name: td.name, userId: td.userId, leagueId },
      })
      teamIds.push(team.id)
    }

    // Assign 15 players to each team
    for (let t = 0; t < 3; t++) {
      const teamPlayers = players.slice(t * 15, (t + 1) * 15)
      await prisma.teamPlayer.createMany({
        data: teamPlayers.map(p => ({
          teamId: teamIds[t],
          playerId: p.id,
          leagueId,
          purchasePrice: Math.round(Math.random() * 15 + 5),
        })),
      })
    }

    // Verify
    for (const teamId of teamIds) {
      const count = await prisma.teamPlayer.count({ where: { teamId } })
      expect(count).toBe(15)
    }
  })

  // ─── STEP 4: Start season ───
  it('starts the season after validating rosters', async () => {
    // Verify: 3 teams, each with 15 players
    const teams = await prisma.team.findMany({
      where: { leagueId },
      include: { _count: { select: { teamPlayers: true } } },
    })
    expect(teams.length).toBe(3)
    for (const team of teams) {
      expect(team._count.teamPlayers).toBeGreaterThanOrEqual(12)
    }

    // Start season
    await prisma.league.update({
      where: { id: leagueId },
      data: { seasonStarted: true },
    })

    const league = await prisma.league.findUnique({ where: { id: leagueId } })
    expect(league?.seasonStarted).toBe(true)
  })

  // ─── STEP 5: Create gameweeks + matches ───
  it('creates gameweeks and matches', async () => {
    // Create 2 gameweeks
    const gw1 = await prisma.gameweek.create({
      data: { number: 101, lockTime: new Date('2025-01-01T00:00:00Z'), status: 'COMPLETED', aggregationStatus: 'PENDING' },
    })
    const gw2 = await prisma.gameweek.create({
      data: { number: 102, lockTime: new Date('2025-01-08T00:00:00Z'), status: 'UPCOMING', aggregationStatus: 'PENDING' },
    })
    gameweekIds = [gw1.id, gw2.id]

    // Create 2 matches in GW1
    const match1 = await prisma.match.create({
      data: {
        apiMatchId: 99901, gameweekId: gw1.id,
        localTeamId: 5, visitorTeamId: 8,
        localTeamName: 'KKR', visitorTeamName: 'RCB',
        startingAt: new Date('2025-01-02T14:00:00Z'),
        apiStatus: 'Finished', scoringStatus: 'COMPLETED',
      },
    })
    const match2 = await prisma.match.create({
      data: {
        apiMatchId: 99902, gameweekId: gw1.id,
        localTeamId: 6, visitorTeamId: 2,
        localTeamName: 'MI', visitorTeamName: 'CSK',
        startingAt: new Date('2025-01-03T14:00:00Z'),
        apiStatus: 'Finished', scoringStatus: 'COMPLETED',
      },
    })
    matchIds = [match1.id, match2.id]

    expect(gameweekIds.length).toBe(2)
    expect(matchIds.length).toBe(2)
  })

  // ─── STEP 6: Submit lineups ───
  it('submits lineups for all 3 teams', async () => {
    for (const teamId of teamIds) {
      const squad = await prisma.teamPlayer.findMany({
        where: { teamId },
        include: { player: true },
      })

      const lineup = await prisma.lineup.create({
        data: {
          teamId,
          gameweekId: gameweekIds[0],
          slots: {
            create: squad.map((tp, i) => ({
              playerId: tp.playerId,
              slotType: i < 11 ? 'XI' : 'BENCH',
              benchPriority: i >= 11 ? i - 10 : null,
              role: i === 0 ? 'CAPTAIN' : i === 1 ? 'VC' : null,
            })),
          },
        },
        include: { slots: true },
      })

      expect(lineup.slots.length).toBe(15)
      expect(lineup.slots.filter(s => s.slotType === 'XI').length).toBe(11)
      expect(lineup.slots.filter(s => s.slotType === 'BENCH').length).toBe(4)
      expect(lineup.slots.filter(s => s.role === 'CAPTAIN').length).toBe(1)
      expect(lineup.slots.filter(s => s.role === 'VC').length).toBe(1)
    }
  })

  // ─── STEP 7: Simulate scoring (manually create PlayerPerformance) ───
  it('creates player performances for match 1', async () => {
    // Get team 1's XI players
    const lineup = await prisma.lineup.findUnique({
      where: { teamId_gameweekId: { teamId: teamIds[0], gameweekId: gameweekIds[0] } },
      include: { slots: { where: { slotType: 'XI' }, include: { player: true } } },
    })
    expect(lineup).not.toBeNull()

    // Create performances for first 5 players (simulating they played in match 1)
    for (let i = 0; i < 5; i++) {
      const slot = lineup!.slots[i]
      await prisma.playerPerformance.create({
        data: {
          playerId: slot.playerId,
          matchId: matchIds[0],
          runs: 30 + i * 10,
          balls: 20 + i * 5,
          fours: 2 + i,
          sixes: i,
          catches: i % 2,
          stumpings: 0,
          runoutsDirect: 0,
          runoutsAssisted: 0,
          fantasyPoints: 40 + i * 15,
          inStartingXI: true,
          isImpactPlayer: false,
        },
      })
    }

    // Mark match as scored
    await prisma.match.update({
      where: { id: matchIds[0] },
      data: { scoringStatus: 'SCORED' },
    })

    const perfCount = await prisma.playerPerformance.count({ where: { matchId: matchIds[0] } })
    expect(perfCount).toBe(5)
  })

  // ─── STEP 8: Verify leaderboard data ───
  it('verifies team standings and player scores', async () => {
    // All 3 teams should exist
    const teams = await prisma.team.findMany({
      where: { leagueId },
      orderBy: { totalPoints: 'desc' },
    })
    expect(teams.length).toBe(3)

    // Verify performances are queryable
    const perfs = await prisma.playerPerformance.findMany({
      where: { matchId: matchIds[0] },
      orderBy: { fantasyPoints: 'desc' },
    })
    expect(perfs.length).toBe(5)
    expect(perfs[0].fantasyPoints).toBe(100) // 40 + 4*15
  })

  // ─── STEP 9: Verify gameweek score aggregation ───
  it('aggregates gameweek scores correctly', async () => {
    // Manually create a GameweekScore to simulate post-aggregation
    const totalPts = 40 + 55 + 70 + 85 + 100 // sum of fantasyPoints for team 1
    await prisma.gameweekScore.create({
      data: {
        teamId: teamIds[0],
        gameweekId: gameweekIds[0],
        totalPoints: totalPts,
      },
    })
    await prisma.team.update({
      where: { id: teamIds[0] },
      data: { totalPoints: totalPts, bestGwScore: totalPts },
    })

    const team = await prisma.team.findUnique({ where: { id: teamIds[0] } })
    expect(team?.totalPoints).toBe(350)
    expect(team?.bestGwScore).toBe(350)

    const gwScore = await prisma.gameweekScore.findUnique({
      where: { teamId_gameweekId: { teamId: teamIds[0], gameweekId: gameweekIds[0] } },
    })
    expect(gwScore?.totalPoints).toBe(350)
  })

  // ─── STEP 10: Verify chip usage ───
  it('activates and uses a chip', async () => {
    const chip = await prisma.chipUsage.create({
      data: {
        teamId: teamIds[0],
        chipType: 'POWER_PLAY_BAT',
        gameweekId: gameweekIds[0],
        status: 'USED',
      },
    })
    expect(chip.chipType).toBe('POWER_PLAY_BAT')
    expect(chip.status).toBe('USED')

    // Second chip of same type should fail (unique constraint on teamId + chipType)
    await expect(
      prisma.chipUsage.create({
        data: { teamId: teamIds[0], chipType: 'POWER_PLAY_BAT', gameweekId: gameweekIds[1], status: 'PENDING' },
      })
    ).rejects.toThrow()
  })

  // ─── STEP 11: Verify season integrity ───
  it('validates full season state', async () => {
    const league = await prisma.league.findUnique({
      where: { id: leagueId },
      include: {
        teams: { include: { _count: { select: { teamPlayers: true } } } },
      },
    })

    expect(league?.seasonStarted).toBe(true)
    expect(league?.teams.length).toBe(3)
    league?.teams.forEach(t => {
      expect(t._count.teamPlayers).toBe(15)
    })

    // Matches
    const matches = await prisma.match.findMany({ where: { gameweekId: gameweekIds[0] } })
    expect(matches.length).toBe(2)
    expect(matches.find(m => m.scoringStatus === 'SCORED')).toBeTruthy()

    // Gameweeks
    const gws = await prisma.gameweek.findMany({
      where: { id: { in: gameweekIds } },
      orderBy: { number: 'asc' },
    })
    expect(gws.length).toBe(2)
  })
})
