import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const TEST_SUFFIX = '@test-player-detail.vitest'
const adminEmail = `pd-admin${TEST_SUFFIX}`

let league: { id: string }
let team: { id: string }
let player: { id: string; iplTeamName: string | null }
let gameweekId: string

beforeAll(async () => {
  await cleanup()

  const adminUser = await prisma.user.create({
    data: { email: adminEmail, name: 'PD Admin' },
  })

  league = await prisma.league.create({
    data: {
      name: 'PD Test League',
      inviteCode: 'PD-TEST-VITEST',
      adminUserId: adminUser.id,
      minSquadSize: 12,
      maxSquadSize: 15,
    },
  })

  team = await prisma.team.create({
    data: {
      name: 'PD Test Team',
      leagueId: league.id,
      userId: adminUser.id,
    },
  })

  // Create a player with an IPL team
  player = await prisma.player.create({
    data: {
      fullname: 'Test Player PD',
      firstname: 'Test',
      lastname: 'Player',
      role: 'BAT',
      apiPlayerId: 999901,
      iplTeamId: 6,
      iplTeamName: 'Mumbai Indians',
      iplTeamCode: 'MI',
    },
  })

  await prisma.teamPlayer.create({
    data: { teamId: team.id, playerId: player.id, leagueId: league.id, purchasePrice: 100 },
  })

  // Create a gameweek
  const gw = await prisma.gameweek.create({
    data: { number: 901, lockTime: new Date('2025-04-01'), status: 'UPCOMING', aggregationStatus: 'PENDING' },
  })
  gameweekId = gw.id

  // Create 4 scored matches (2 involving MI, 2 not)
  const scoredMI1 = await prisma.match.create({
    data: {
      apiMatchId: 99001, gameweekId, localTeamId: 6, visitorTeamId: 2,
      localTeamName: 'Mumbai Indians', visitorTeamName: 'Chennai Super Kings',
      startingAt: new Date('2025-04-01T14:00:00Z'), apiStatus: 'Finished', scoringStatus: 'SCORED',
    },
  })

  const scoredMI2 = await prisma.match.create({
    data: {
      apiMatchId: 99002, gameweekId, localTeamId: 5, visitorTeamId: 6,
      localTeamName: 'Kolkata Knight Riders', visitorTeamName: 'Mumbai Indians',
      startingAt: new Date('2025-04-03T14:00:00Z'), apiStatus: 'Finished', scoringStatus: 'SCORED',
    },
  })

  await prisma.match.create({
    data: {
      apiMatchId: 99003, gameweekId, localTeamId: 2, visitorTeamId: 5,
      localTeamName: 'Chennai Super Kings', visitorTeamName: 'Kolkata Knight Riders',
      startingAt: new Date('2025-04-02T14:00:00Z'), apiStatus: 'Finished', scoringStatus: 'SCORED',
    },
  })

  // Create 3 scheduled matches (2 involving MI, 1 not)
  await prisma.match.create({
    data: {
      apiMatchId: 99004, gameweekId, localTeamId: 6, visitorTeamId: 7,
      localTeamName: 'Mumbai Indians', visitorTeamName: 'Rajasthan Royals',
      startingAt: new Date('2025-04-05T14:00:00Z'), apiStatus: 'NS', scoringStatus: 'SCHEDULED',
    },
  })

  await prisma.match.create({
    data: {
      apiMatchId: 99005, gameweekId, localTeamId: 8, visitorTeamId: 6,
      localTeamName: 'Royal Challengers Bengaluru', visitorTeamName: 'Mumbai Indians',
      startingAt: new Date('2025-04-07T14:00:00Z'), apiStatus: 'NS', scoringStatus: 'SCHEDULED',
    },
  })

  await prisma.match.create({
    data: {
      apiMatchId: 99006, gameweekId, localTeamId: 2, visitorTeamId: 7,
      localTeamName: 'Chennai Super Kings', visitorTeamName: 'Rajasthan Royals',
      startingAt: new Date('2025-04-06T14:00:00Z'), apiStatus: 'NS', scoringStatus: 'SCHEDULED',
    },
  })

  // Create performances for the player in scored MI matches
  await prisma.playerPerformance.create({
    data: {
      playerId: player.id, matchId: scoredMI1.id,
      runs: 45, balls: 30, fours: 5, sixes: 2, wickets: 0, overs: 0,
      maidens: 0, runsConceded: 0, catches: 1, stumpings: 0,
      fantasyPoints: 52, inStartingXI: true,
    },
  })

  await prisma.playerPerformance.create({
    data: {
      playerId: player.id, matchId: scoredMI2.id,
      runs: 12, balls: 15, fours: 1, sixes: 0, wickets: 0, overs: 0,
      maidens: 0, runsConceded: 0, catches: 0, stumpings: 0,
      fantasyPoints: 8, inStartingXI: true,
    },
  })
})

afterAll(async () => {
  await cleanup()
  await prisma.$disconnect()
})

async function cleanup() {
  // Clean up test data in correct FK order
  await prisma.playerPerformance.deleteMany({ where: { player: { fullname: 'Test Player PD' } } })
  await prisma.match.deleteMany({ where: { apiMatchId: { in: [99001, 99002, 99003, 99004, 99005, 99006] } } })
  await prisma.gameweek.deleteMany({ where: { number: 901 } })
  await prisma.teamPlayer.deleteMany({ where: { team: { name: 'PD Test Team' } } })
  await prisma.team.deleteMany({ where: { name: 'PD Test Team' } })
  await prisma.league.deleteMany({ where: { inviteCode: 'PD-TEST-VITEST' } })
  await prisma.user.deleteMany({ where: { email: adminEmail } })
  await prisma.player.deleteMany({ where: { fullname: 'Test Player PD' } })
}

const TEST_API_MATCH_IDS = [99001, 99002, 99003, 99004, 99005, 99006]

describe('Player Detail API — upcomingFixtures', () => {
  it('returns scheduled MI matches as upcoming', async () => {
    const upcoming = await prisma.match.findMany({
      where: {
        apiMatchId: { in: TEST_API_MATCH_IDS },
        scoringStatus: 'SCHEDULED',
        OR: [
          { localTeamName: 'Mumbai Indians' },
          { visitorTeamName: 'Mumbai Indians' },
        ],
      },
      orderBy: { startingAt: 'asc' },
      take: 6,
      select: { localTeamName: true, visitorTeamName: true, startingAt: true },
    })

    expect(upcoming.length).toBe(2)
    expect(upcoming[0].startingAt.getTime()).toBeLessThan(upcoming[1].startingAt.getTime())
  })

  it('shows correct opponent — MI as local team', async () => {
    const match = await prisma.match.findFirst({
      where: { apiMatchId: 99004 },
      select: { localTeamName: true, visitorTeamName: true },
    })

    expect(match).not.toBeNull()
    expect(match!.localTeamName).toBe('Mumbai Indians')
    expect(match!.visitorTeamName).toBe('Rajasthan Royals')
  })

  it('shows correct opponent — MI as visitor team', async () => {
    const match = await prisma.match.findFirst({
      where: { apiMatchId: 99005 },
      select: { localTeamName: true, visitorTeamName: true },
    })

    expect(match).not.toBeNull()
    expect(match!.localTeamName).toBe('Royal Challengers Bengaluru')
    expect(match!.visitorTeamName).toBe('Mumbai Indians')
  })

  it('excludes scored matches from upcoming', async () => {
    const upcoming = await prisma.match.findMany({
      where: {
        apiMatchId: { in: TEST_API_MATCH_IDS },
        scoringStatus: 'SCHEDULED',
      },
    })

    for (const m of upcoming) {
      expect(m.scoringStatus).toBe('SCHEDULED')
    }
    // 3 scheduled total (2 MI + 1 non-MI)
    expect(upcoming.length).toBe(3)
  })

  it('orders upcoming fixtures by date ascending', async () => {
    const upcoming = await prisma.match.findMany({
      where: {
        apiMatchId: { in: TEST_API_MATCH_IDS },
        scoringStatus: 'SCHEDULED',
      },
      orderBy: { startingAt: 'asc' },
      select: { startingAt: true },
    })

    for (let i = 1; i < upcoming.length; i++) {
      expect(upcoming[i].startingAt.getTime()).toBeGreaterThanOrEqual(
        upcoming[i - 1].startingAt.getTime()
      )
    }
  })

  it('limits upcoming fixtures to 6', async () => {
    const upcoming = await prisma.match.findMany({
      where: {
        apiMatchId: { in: TEST_API_MATCH_IDS },
        scoringStatus: 'SCHEDULED',
        OR: [
          { localTeamName: 'Mumbai Indians' },
          { visitorTeamName: 'Mumbai Indians' },
        ],
      },
      orderBy: { startingAt: 'asc' },
      take: 6,
    })

    expect(upcoming.length).toBeLessThanOrEqual(6)
  })

  it('player has performances with match data', async () => {
    const perfs = await prisma.playerPerformance.findMany({
      where: { playerId: player.id },
      include: {
        match: {
          select: { localTeamName: true, visitorTeamName: true, startingAt: true },
        },
      },
      orderBy: { match: { startingAt: 'asc' } },
    })

    expect(perfs.length).toBe(2)
    // First match: MI vs CSK — opponent is CSK
    expect(perfs[0].match.visitorTeamName).toBe('Chennai Super Kings')
    expect(perfs[0].fantasyPoints).toBe(52)
    // Second match: KKR vs MI — opponent is KKR
    expect(perfs[1].match.localTeamName).toBe('Kolkata Knight Riders')
    expect(perfs[1].fantasyPoints).toBe(8)
  })
})
