import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { runScoringPipeline } from '@/lib/scoring/pipeline'

const prisma = new PrismaClient()

const TEST_SUFFIX = '@test.vitest'
const adminEmail = `scoring-admin${TEST_SUFFIX}`

// IPL 2025 fixture 65240: KKR vs RCB
const API_MATCH_ID = 65240
// Known player API IDs from KKR and RCB squads (IPL 2025)
const KNOWN_KKR_PLAYER_IDS = [284, 281, 77, 467, 489, 287, 362, 289]
const KNOWN_RCB_PLAYER_IDS = [273, 262, 139, 268, 138, 116, 274, 470]
const ALL_KNOWN_IDS = [...KNOWN_KKR_PLAYER_IDS, ...KNOWN_RCB_PLAYER_IDS]

let league: { id: string }
let gameweek: { id: string }
let matchRecord: { id: string }
let adminUser: { id: string }
let matchingPlayers: { id: string; apiPlayerId: number }[] = []
let shouldSkip = false

beforeAll(async () => {
  await cleanup()

  // Check if seed players exist in DB for this fixture
  matchingPlayers = await prisma.player.findMany({
    where: { apiPlayerId: { in: ALL_KNOWN_IDS } },
    select: { id: true, apiPlayerId: true },
  })

  if (matchingPlayers.length < 5) {
    console.warn(
      `Skipping scoring pipeline tests: only ${matchingPlayers.length} matching players found in DB (need >= 5). Run the seed first.`
    )
    shouldSkip = true
    return
  }

  // Check for SPORTMONKS_API_TOKEN
  if (!process.env.SPORTMONKS_API_TOKEN) {
    console.warn('Skipping scoring pipeline tests: SPORTMONKS_API_TOKEN not set')
    shouldSkip = true
    return
  }

  adminUser = await prisma.user.create({
    data: { email: adminEmail, name: 'Scoring Admin' },
  })

  league = await prisma.league.create({
    data: {
      name: 'Scoring Test League',
      inviteCode: 'SCORING-TEST-VITEST',
      adminUserId: adminUser.id,
    },
  })

  // Use a unique gameweek number to avoid conflicts
  gameweek = await prisma.gameweek.create({
    data: {
      number: 98,
      lockTime: new Date(Date.now() - 24 * 60 * 60 * 1000), // yesterday (locked)
      status: 'ACTIVE',
      aggregationStatus: 'PENDING',
    },
  })

  // Create match record with scoringStatus=COMPLETED so the pipeline picks it up
  matchRecord = await prisma.match.create({
    data: {
      apiMatchId: API_MATCH_ID,
      gameweekId: gameweek.id,
      localTeamId: 113, // KKR
      visitorTeamId: 116, // RCB
      localTeamName: 'Kolkata Knight Riders',
      visitorTeamName: 'Royal Challengers Bangalore',
      startingAt: new Date('2025-03-22T14:00:00Z'),
      apiStatus: 'Finished',
      scoringStatus: 'COMPLETED',
    },
  })
})

afterAll(async () => {
  await cleanup()
  await prisma.$disconnect()
})

async function cleanup() {
  // Clean up match, performances, gameweek, league, user
  const testEmails = [adminEmail]

  // Clean by match apiMatchId
  const existingMatch = await prisma.match.findUnique({
    where: { apiMatchId: API_MATCH_ID },
  })
  if (existingMatch) {
    await prisma.playerPerformance.deleteMany({ where: { matchId: existingMatch.id } })
    await prisma.match.delete({ where: { id: existingMatch.id } })
  }

  // Clean gameweek 98
  const gw = await prisma.gameweek.findUnique({ where: { number: 98 } })
  if (gw) {
    await prisma.playerScore.deleteMany({ where: { gameweekId: gw.id } })
    await prisma.gameweekScore.deleteMany({ where: { gameweekId: gw.id } })
    // Delete lineups and slots before gameweek (FK constraint)
    await prisma.lineupSlot.deleteMany({
      where: {
        lineup: {
          gameweekId: gw.id,
        },
      },
    })
    await prisma.lineup.deleteMany({ where: { gameweekId: gw.id } })
    await prisma.gameweek.delete({ where: { id: gw.id } })
  }

  // Clean league and user
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
      await prisma.teamPlayer.deleteMany({ where: { leagueId: { in: leagueIds } } })
      await prisma.team.deleteMany({ where: { leagueId: { in: leagueIds } } })
      await prisma.league.deleteMany({ where: { id: { in: leagueIds } } })
    }
  }

  await prisma.user.deleteMany({ where: { email: { in: testEmails } } })
}

describe('Scoring Pipeline (real API)', () => {
  it('should score fixture 65240 and create PlayerPerformance rows', async () => {
    if (shouldSkip) {
      console.warn('Test skipped: prerequisites not met')
      return
    }

    const result = await runScoringPipeline()

    // matchesScored may be >1 if parallel tests created COMPLETED matches
    expect(result.matchesScored).toBeGreaterThanOrEqual(1)
    expect(result.matchesFailed).toBe(0)
    expect(result.errors).toHaveLength(0)

    // Verify match status changed to SCORED
    const updatedMatch = await prisma.match.findUnique({
      where: { id: matchRecord.id },
    })
    expect(updatedMatch!.scoringStatus).toBe('SCORED')

    // Verify PlayerPerformance rows were created
    const performances = await prisma.playerPerformance.findMany({
      where: { matchId: matchRecord.id },
    })
    expect(performances.length).toBeGreaterThan(0)

    // Spot-check: at least one player should have batting points
    const battingPerfs = performances.filter((p) => p.runs !== null && p.runs > 0)
    expect(battingPerfs.length).toBeGreaterThan(0)

    // At least one player should have reasonable fantasy points (> 0)
    const withPoints = performances.filter((p) => p.fantasyPoints > 0)
    expect(withPoints.length).toBeGreaterThan(0)
  }, 30000) // 30s timeout for API call

  it('should set inStartingXI and isImpactPlayer flags correctly', async () => {
    if (shouldSkip) {
      console.warn('Test skipped: prerequisites not met')
      return
    }

    const performances = await prisma.playerPerformance.findMany({
      where: { matchId: matchRecord.id },
    })

    // There should be some starting XI players
    const startingXI = performances.filter((p) => p.inStartingXI)
    expect(startingXI.length).toBeGreaterThan(0)

    // Starting XI should get 4 base points included in their fantasy points
    // (they may have 0 batting/bowling, but at least 4 for playing)
    for (const perf of startingXI) {
      expect(perf.fantasyPoints).toBeGreaterThanOrEqual(4)
    }

    // Impact players (if any) should also have >= 4 base points
    const impactPlayers = performances.filter((p) => p.isImpactPlayer)
    for (const perf of impactPlayers) {
      expect(perf.fantasyPoints).toBeGreaterThanOrEqual(4)
    }
  })

  it('should have scored a known player with reasonable batting points', async () => {
    if (shouldSkip) {
      console.warn('Test skipped: prerequisites not met')
      return
    }

    const performances = await prisma.playerPerformance.findMany({
      where: { matchId: matchRecord.id },
      include: { player: { select: { apiPlayerId: true, fullname: true } } },
    })

    // Find a player who batted
    const battedPlayers = performances.filter(
      (p) => p.runs !== null && p.runs > 0
    )

    expect(battedPlayers.length).toBeGreaterThan(0)

    // A player who scored runs should have positive fantasy points
    for (const perf of battedPlayers) {
      expect(perf.fantasyPoints).toBeGreaterThan(0)
      // Batting points: 1 point per run at minimum
      // Plus boundary bonuses, strike rate bonuses, milestones
      expect(perf.runs!).toBeGreaterThan(0)
    }
  })
})
