/**
 * Test script for POST /api/admin/season/start validation logic.
 * Tests Prisma operations directly (no HTTP/auth needed).
 *
 * Run: npx tsx scripts/test-season-start.ts
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const PREFIX = 'TEST_SEASON_'

function generateInviteCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let code = 'FAL-'
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

async function cleanup() {
  await prisma.teamPlayer.deleteMany({ where: { team: { name: { startsWith: PREFIX } } } })
  await prisma.team.deleteMany({ where: { name: { startsWith: PREFIX } } })
  await prisma.league.deleteMany({ where: { name: { startsWith: PREFIX } } })
  await prisma.user.deleteMany({ where: { email: { startsWith: 'test-season-' } } })
}

/**
 * Mirrors the core validation logic from POST /api/admin/season/start.
 * Returns the same shape as the HTTP response, minus the Response wrapper.
 */
async function startSeason(leagueId: string, callerUserId: string) {
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    include: {
      teams: {
        include: {
          _count: { select: { teamPlayers: true } },
          user: { select: { name: true, email: true } },
        },
      },
    },
  })

  if (!league) return { status: 404, body: { error: 'League not found' } }

  if (league.adminUserId !== callerUserId) {
    return { status: 403, body: { error: 'Forbidden: only the league admin can start the season' } }
  }

  if (league.seasonStarted) {
    return { status: 409, body: { error: 'Season already started' } }
  }

  if (league.teams.length < 2) {
    return {
      status: 422,
      body: { error: 'League must have at least 2 teams (managers) to start the season', teamCount: league.teams.length },
    }
  }

  const incompleteTeams = league.teams
    .filter((t) => t._count.teamPlayers < league.minSquadSize)
    .map((t) => ({
      teamId: t.id,
      teamName: t.name,
      manager: t.user.name || t.user.email,
      playerCount: t._count.teamPlayers,
      required: league.minSquadSize,
    }))

  if (incompleteTeams.length > 0) {
    return { status: 422, body: { error: 'Some teams have incomplete rosters', incompleteTeams } }
  }

  const updated = await prisma.league.update({
    where: { id: leagueId },
    data: { seasonStarted: true },
  })

  return {
    status: 200,
    body: {
      success: true,
      league: {
        id: updated.id,
        name: updated.name,
        seasonStarted: updated.seasonStarted,
        teamCount: league.teams.length,
      },
    },
  }
}

let passed = 0
let failed = 0

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++
    console.log(`  [PASS] ${message}`)
  } else {
    failed++
    console.error(`  [FAIL] ${message}`)
  }
}

async function main() {
  console.log('--- Season Start Validation Tests ---\n')

  await cleanup()

  // Fetch real players from DB
  const realPlayers = await prisma.player.findMany({ take: 30, orderBy: { fullname: 'asc' } })
  if (realPlayers.length < 30) {
    console.error(`BLOCKED: Need 30 players in DB, found ${realPlayers.length}. Run seed-players.ts first.`)
    process.exit(1)
  }

  // Create test users
  const admin = await prisma.user.create({
    data: { email: 'test-season-admin@fal.test', name: 'Season Admin' },
  })
  const mgr1 = await prisma.user.create({
    data: { email: 'test-season-mgr1@fal.test', name: 'Manager One' },
  })
  const mgr2 = await prisma.user.create({
    data: { email: 'test-season-mgr2@fal.test', name: 'Manager Two' },
  })

  // ==============================
  // Test 1: Success — 2 teams with 15 players each
  // ==============================
  console.log('Test 1: Success case — 2 teams, 15 players each')

  const league1 = await prisma.league.create({
    data: {
      name: `${PREFIX}League_Success`,
      inviteCode: generateInviteCode(),
      adminUserId: admin.id,
      minSquadSize: 12,
      maxSquadSize: 15,
    },
  })

  const team1 = await prisma.team.create({
    data: { name: `${PREFIX}Team Alpha`, userId: mgr1.id, leagueId: league1.id },
  })
  const team2 = await prisma.team.create({
    data: { name: `${PREFIX}Team Beta`, userId: mgr2.id, leagueId: league1.id },
  })

  // Add 15 players to each team
  await prisma.teamPlayer.createMany({
    data: realPlayers.slice(0, 15).map((p) => ({
      teamId: team1.id,
      playerId: p.id,
      leagueId: league1.id,
      purchasePrice: 10,
    })),
  })
  await prisma.teamPlayer.createMany({
    data: realPlayers.slice(15, 30).map((p) => ({
      teamId: team2.id,
      playerId: p.id,
      leagueId: league1.id,
      purchasePrice: 10,
    })),
  })

  const res1 = await startSeason(league1.id, admin.id)
  assert(res1.status === 200, `Status 200 (got ${res1.status})`)
  assert((res1.body as any).success === true, 'success: true')
  assert((res1.body as any).league.seasonStarted === true, 'seasonStarted is true')
  assert((res1.body as any).league.teamCount === 2, 'teamCount is 2')

  // Verify DB
  const dbLeague1 = await prisma.league.findUnique({ where: { id: league1.id } })
  assert(dbLeague1!.seasonStarted === true, 'DB: seasonStarted persisted')

  // ==============================
  // Test 2: Failure — only 1 team
  // ==============================
  console.log('\nTest 2: Failure — only 1 team')

  const league2 = await prisma.league.create({
    data: {
      name: `${PREFIX}League_OneTeam`,
      inviteCode: generateInviteCode(),
      adminUserId: admin.id,
      minSquadSize: 12,
    },
  })
  const soloTeam = await prisma.team.create({
    data: { name: `${PREFIX}Solo Team`, userId: mgr1.id, leagueId: league2.id },
  })
  // Add 15 players to satisfy squad size (but only 1 team)
  await prisma.teamPlayer.createMany({
    data: realPlayers.slice(0, 15).map((p) => ({
      teamId: soloTeam.id,
      playerId: p.id,
      leagueId: league2.id,
      purchasePrice: 10,
    })),
  })

  const res2 = await startSeason(league2.id, admin.id)
  assert(res2.status === 422, `Status 422 (got ${res2.status})`)
  assert((res2.body as any).error.includes('at least 2 teams'), `Error mentions 2 teams: "${(res2.body as any).error}"`)
  assert((res2.body as any).teamCount === 1, 'teamCount is 1')

  // ==============================
  // Test 3: Failure — incomplete roster (team with only 5 players)
  // ==============================
  console.log('\nTest 3: Failure — team with incomplete roster (5 players)')

  const league3 = await prisma.league.create({
    data: {
      name: `${PREFIX}League_Incomplete`,
      inviteCode: generateInviteCode(),
      adminUserId: admin.id,
      minSquadSize: 12,
    },
  })

  const team3a = await prisma.team.create({
    data: { name: `${PREFIX}Full Team`, userId: mgr1.id, leagueId: league3.id },
  })
  const team3b = await prisma.team.create({
    data: { name: `${PREFIX}Short Team`, userId: mgr2.id, leagueId: league3.id },
  })

  // Full team: 15 players
  await prisma.teamPlayer.createMany({
    data: realPlayers.slice(0, 15).map((p) => ({
      teamId: team3a.id,
      playerId: p.id,
      leagueId: league3.id,
      purchasePrice: 10,
    })),
  })
  // Short team: only 5 players
  await prisma.teamPlayer.createMany({
    data: realPlayers.slice(15, 20).map((p) => ({
      teamId: team3b.id,
      playerId: p.id,
      leagueId: league3.id,
      purchasePrice: 10,
    })),
  })

  const res3 = await startSeason(league3.id, admin.id)
  assert(res3.status === 422, `Status 422 (got ${res3.status})`)
  assert((res3.body as any).error.includes('incomplete rosters'), `Error mentions incomplete rosters`)
  assert((res3.body as any).incompleteTeams.length === 1, 'One incomplete team')
  assert((res3.body as any).incompleteTeams[0].playerCount === 5, 'Incomplete team has 5 players')
  assert((res3.body as any).incompleteTeams[0].required === 12, 'Required is 12')
  assert((res3.body as any).incompleteTeams[0].teamName === `${PREFIX}Short Team`, 'Correct team flagged')

  // Verify DB not modified
  const dbLeague3 = await prisma.league.findUnique({ where: { id: league3.id } })
  assert(dbLeague3!.seasonStarted === false, 'DB: seasonStarted still false')

  // ==============================
  // Test 4: Failure — duplicate start (409)
  // ==============================
  console.log('\nTest 4: Failure — duplicate start (409)')

  // league1 was already started in Test 1
  const res4 = await startSeason(league1.id, admin.id)
  assert(res4.status === 409, `Status 409 (got ${res4.status})`)
  assert((res4.body as any).error === 'Season already started', `Error: "${(res4.body as any).error}"`)

  // ==============================
  // Test 5: Failure — non-admin caller (403)
  // ==============================
  console.log('\nTest 5: Failure — non-admin caller (403)')

  const res5 = await startSeason(league3.id, mgr1.id)
  assert(res5.status === 403, `Status 403 (got ${res5.status})`)
  assert((res5.body as any).error.includes('Forbidden'), `Error mentions Forbidden`)

  // Cleanup
  await cleanup()

  console.log(`\n--- Results: ${passed} passed, ${failed} failed ---`)
  if (failed > 0) process.exit(1)
}

main()
  .catch((e) => {
    console.error('Test failed:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
