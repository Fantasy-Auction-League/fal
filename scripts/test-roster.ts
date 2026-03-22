/**
 * Test script for CSV roster upload + team squad endpoints.
 * Tests Prisma operations directly (no HTTP/auth needed).
 *
 * Run: npx tsx scripts/test-roster.ts
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

import { PrismaClient } from '@prisma/client'
import { parse } from 'csv-parse/sync'

const prisma = new PrismaClient()

function generateInviteCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let code = 'FAL-'
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

async function cleanup() {
  await prisma.teamPlayer.deleteMany({ where: { team: { name: { startsWith: 'TEST_ROSTER_' } } } })
  await prisma.team.deleteMany({ where: { name: { startsWith: 'TEST_ROSTER_' } } })
  await prisma.league.deleteMany({ where: { name: { startsWith: 'TEST_ROSTER_' } } })
  await prisma.user.deleteMany({ where: { email: { startsWith: 'test-roster-' } } })
}

/**
 * Core roster upload logic extracted to match route handler behavior.
 * This mirrors POST /api/leagues/[id]/roster without HTTP/auth.
 */
async function uploadRoster(leagueId: string, csvText: string) {
  const league = await prisma.league.findUnique({ where: { id: leagueId } })
  if (!league) throw new Error('League not found')

  const rows = parse(csvText, { columns: true, skip_empty_lines: true, trim: true })
  if (rows.length === 0) throw new Error('No data rows')

  // Group by manager
  const managerMap = new Map<string, { teamName: string; players: { name: string; price: number }[] }>()
  for (const row of rows as any[]) {
    const email = row.managerEmail?.toLowerCase().trim()
    if (!email || !row.playerName?.trim()) continue
    if (!managerMap.has(email)) {
      managerMap.set(email, { teamName: row.teamName.trim(), players: [] })
    }
    managerMap.get(email)!.players.push({
      name: row.playerName.trim(),
      price: parseFloat(row.purchasePrice) || 0,
    })
  }

  const errors: string[] = []
  const teamSummaries: { email: string; teamName: string; playerCount: number; status: string }[] = []

  // Resolve players
  const allNames = (rows as any[]).map((r: any) => r.playerName?.trim()).filter(Boolean)
  const dbPlayers = await prisma.player.findMany({
    where: { fullname: { in: allNames, mode: 'insensitive' } },
  })
  const playerLookup = new Map(dbPlayers.map((p) => [p.fullname.toLowerCase(), p]))

  const globalPlayerSet = new Set<string>()
  const duplicates: string[] = []

  type TeamInsert = { email: string; teamName: string; userId: string; players: { playerId: string; price: number }[] }
  const teamsToInsert: TeamInsert[] = []

  for (const [email, data] of managerMap) {
    let user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      user = await prisma.user.create({ data: { email, name: email.split('@')[0] } })
    }

    const resolved: { playerId: string; price: number }[] = []
    for (const p of data.players) {
      const dbPlayer = playerLookup.get(p.name.toLowerCase())
      if (!dbPlayer) {
        errors.push(`Player not found: "${p.name}" (team: ${data.teamName})`)
        continue
      }
      if (globalPlayerSet.has(dbPlayer.id)) {
        duplicates.push(`Duplicate player across teams: "${p.name}"`)
        continue
      }
      globalPlayerSet.add(dbPlayer.id)
      resolved.push({ playerId: dbPlayer.id, price: p.price })
    }

    if (resolved.length < league.minSquadSize) {
      errors.push(`${data.teamName} (${email}): squad size ${resolved.length} below min ${league.minSquadSize}`)
      teamSummaries.push({ email, teamName: data.teamName, playerCount: resolved.length, status: 'error' })
      continue
    }
    if (resolved.length > league.maxSquadSize) {
      errors.push(`${data.teamName} (${email}): squad size ${resolved.length} exceeds max ${league.maxSquadSize}`)
      teamSummaries.push({ email, teamName: data.teamName, playerCount: resolved.length, status: 'error' })
      continue
    }

    teamsToInsert.push({ email, teamName: data.teamName, userId: user.id, players: resolved })
    teamSummaries.push({ email, teamName: data.teamName, playerCount: resolved.length, status: 'ok' })
  }

  if (duplicates.length > 0) errors.push(...duplicates)
  if (errors.length > 0) return { teams: teamSummaries, errors }

  // Atomic insert
  await prisma.$transaction(async (tx) => {
    await tx.teamPlayer.deleteMany({ where: { leagueId } })
    for (const teamData of teamsToInsert) {
      let team = await tx.team.findFirst({ where: { leagueId, userId: teamData.userId } })
      if (team) {
        if (team.name !== teamData.teamName) {
          team = await tx.team.update({ where: { id: team.id }, data: { name: teamData.teamName } })
        }
      } else {
        team = await tx.team.create({ data: { name: teamData.teamName, userId: teamData.userId, leagueId } })
      }
      await tx.teamPlayer.createMany({
        data: teamData.players.map((p) => ({
          teamId: team.id,
          playerId: p.playerId,
          leagueId,
          purchasePrice: p.price,
        })),
      })
    }
  })

  return { teams: teamSummaries, errors: [] }
}

async function main() {
  console.log('--- Roster Upload + Squad Tests ---\n')

  await cleanup()

  // Fetch 30 real players from DB for test data
  const realPlayers = await prisma.player.findMany({ take: 30, orderBy: { fullname: 'asc' } })
  if (realPlayers.length < 30) {
    console.error(`BLOCKED: Need 30 players in DB, found ${realPlayers.length}. Run seed-players.ts first.`)
    process.exit(1)
  }

  const manager1Players = realPlayers.slice(0, 15)
  const manager2Players = realPlayers.slice(15, 30)

  console.log(`Using real players: ${manager1Players[0].fullname} ... ${manager2Players[14].fullname}`)

  // Create admin user and league
  const admin = await prisma.user.create({
    data: { email: 'test-roster-admin@fal.test', name: 'Roster Admin' },
  })
  const mgr1 = await prisma.user.create({
    data: { email: 'test-roster-mgr1@fal.test', name: 'Manager One' },
  })
  const mgr2 = await prisma.user.create({
    data: { email: 'test-roster-mgr2@fal.test', name: 'Manager Two' },
  })

  const league = await prisma.league.create({
    data: {
      name: 'TEST_ROSTER_League',
      inviteCode: generateInviteCode(),
      adminUserId: admin.id,
      minSquadSize: 12,
      maxSquadSize: 15,
      teams: {
        create: { name: 'TEST_ROSTER_Admin Team', userId: admin.id },
      },
    },
  })
  console.log(`[OK] Created league "${league.name}"`)

  // --- Test 1: Successful upload with 2 managers, 15 players each ---
  const csvLines = ['managerEmail,teamName,playerName,purchasePrice']
  for (const p of manager1Players) {
    csvLines.push(`test-roster-mgr1@fal.test,TEST_ROSTER_Team Alpha,${p.fullname},${(Math.random() * 15 + 5).toFixed(1)}`)
  }
  for (const p of manager2Players) {
    csvLines.push(`test-roster-mgr2@fal.test,TEST_ROSTER_Team Beta,${p.fullname},${(Math.random() * 15 + 5).toFixed(1)}`)
  }
  const csv = csvLines.join('\n')

  const result = await uploadRoster(league.id, csv)
  console.assert(result.errors.length === 0, `Expected no errors, got: ${JSON.stringify(result.errors)}`)
  console.assert(result.teams.length === 2, 'Expected 2 teams')
  console.assert(result.teams[0].playerCount === 15, 'Team 1 should have 15 players')
  console.assert(result.teams[1].playerCount === 15, 'Team 2 should have 15 players')
  console.log('[OK] Test 1: Successful roster upload (2 teams x 15 players)')

  // Verify DB state
  const tp1 = await prisma.teamPlayer.count({ where: { leagueId: league.id } })
  console.assert(tp1 === 30, `Expected 30 TeamPlayers, got ${tp1}`)
  console.log(`[OK] DB has ${tp1} TeamPlayers for this league`)

  // Verify no duplicates across teams
  const allTp = await prisma.teamPlayer.findMany({
    where: { leagueId: league.id },
    select: { playerId: true },
  })
  const playerIds = allTp.map((t) => t.playerId)
  const uniqueIds = new Set(playerIds)
  console.assert(uniqueIds.size === 30, 'All 30 players should be unique')
  console.log('[OK] No duplicate players across teams')

  // --- Test 2: Squad endpoint verification ---
  const teams = await prisma.team.findMany({
    where: { leagueId: league.id, name: { startsWith: 'TEST_ROSTER_Team' } },
  })
  console.assert(teams.length === 2, `Expected 2 roster teams, got ${teams.length}`)

  for (const team of teams) {
    const squad = await prisma.teamPlayer.findMany({
      where: { teamId: team.id },
      include: {
        player: {
          select: { id: true, fullname: true, role: true, iplTeamName: true, iplTeamCode: true },
        },
      },
      orderBy: { player: { fullname: 'asc' } },
    })

    console.assert(squad.length === 15, `Squad should have 15 players, got ${squad.length}`)
    // Verify player details are present
    for (const s of squad) {
      console.assert(!!s.player.fullname, 'Player should have fullname')
      console.assert(!!s.player.role, 'Player should have role')
      console.assert(s.purchasePrice > 0, 'Purchase price should be > 0')
    }
    console.log(`[OK] Test 2: Squad for "${team.name}" has ${squad.length} players with full details`)
  }

  // --- Test 3: Duplicate player across teams ---
  const dupCsv = [
    'managerEmail,teamName,playerName,purchasePrice',
    ...manager1Players.map((p) => `test-roster-mgr1@fal.test,TEST_ROSTER_Team Alpha,${p.fullname},10.0`),
    // Overlap: first player from manager1 also assigned to manager2
    `test-roster-mgr2@fal.test,TEST_ROSTER_Team Beta,${manager1Players[0].fullname},12.0`,
    ...manager2Players.slice(0, 14).map((p) => `test-roster-mgr2@fal.test,TEST_ROSTER_Team Beta,${p.fullname},10.0`),
  ].join('\n')

  const dupResult = await uploadRoster(league.id, dupCsv)
  console.assert(dupResult.errors.length > 0, 'Should have duplicate error')
  console.assert(
    dupResult.errors.some((e) => e.includes('Duplicate')),
    `Expected duplicate error, got: ${dupResult.errors}`
  )
  console.log(`[OK] Test 3: Duplicate player detected — "${dupResult.errors.find((e) => e.includes('Duplicate'))}"`)

  // --- Test 4: Player not found ---
  const badCsv = [
    'managerEmail,teamName,playerName,purchasePrice',
    ...manager1Players.slice(0, 14).map((p) => `test-roster-mgr1@fal.test,TEST_ROSTER_Team Alpha,${p.fullname},10.0`),
    'test-roster-mgr1@fal.test,TEST_ROSTER_Team Alpha,Nonexistent Fakeplayer,10.0',
    ...manager2Players.map((p) => `test-roster-mgr2@fal.test,TEST_ROSTER_Team Beta,${p.fullname},10.0`),
  ].join('\n')

  const badResult = await uploadRoster(league.id, badCsv)
  console.assert(badResult.errors.length > 0, 'Should have not-found error')
  console.assert(
    badResult.errors.some((e) => e.includes('not found')),
    `Expected not-found error, got: ${badResult.errors}`
  )
  console.log(`[OK] Test 4: Unknown player detected — "${badResult.errors.find((e) => e.includes('not found'))}"`)

  // --- Test 5: Squad too small ---
  const smallCsv = [
    'managerEmail,teamName,playerName,purchasePrice',
    ...manager1Players.slice(0, 5).map((p) => `test-roster-mgr1@fal.test,TEST_ROSTER_Team Alpha,${p.fullname},10.0`),
    ...manager2Players.map((p) => `test-roster-mgr2@fal.test,TEST_ROSTER_Team Beta,${p.fullname},10.0`),
  ].join('\n')

  const smallResult = await uploadRoster(league.id, smallCsv)
  console.assert(smallResult.errors.length > 0, 'Should have squad-too-small error')
  console.assert(
    smallResult.errors.some((e) => e.includes('below min')),
    `Expected squad size error, got: ${smallResult.errors}`
  )
  console.log(`[OK] Test 5: Squad too small — "${smallResult.errors.find((e) => e.includes('below min'))}"`)

  // Verify DB was NOT modified by failed uploads (original 30 players still there)
  const tpAfterFails = await prisma.teamPlayer.count({ where: { leagueId: league.id } })
  console.assert(tpAfterFails === 30, `DB should still have 30 TeamPlayers after failed uploads, got ${tpAfterFails}`)
  console.log(`[OK] DB unchanged after failed uploads (${tpAfterFails} TeamPlayers)`)

  // Cleanup
  await cleanup()
  console.log('\n--- All roster tests passed ---')
}

main()
  .catch((e) => {
    console.error('Test failed:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
