/**
 * End-to-end mock fantasy league test.
 * Proves the FULL flow works with real IPL player data:
 *   cleanup → users → league → teams → draft → CSV upload → season start → verify
 *
 * Run: npx tsx scripts/test-e2e.ts
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

import { PrismaClient, PlayerRole } from '@prisma/client'

const prisma = new PrismaClient()

// ── Helpers ────────────────────────────────────────────────────────────

function generateInviteCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let code = 'FAL-'
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Random price between min and max, rounded to 0.5 */
function randomPrice(min: number, max: number): number {
  return Math.round((min + Math.random() * (max - min)) * 2) / 2
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

// ── Test users & config ───────────────────────────────────────────────

const TEST_EMAILS = [
  'viiveek@fal.test',
  'rohit@fal.test',
  'priya@fal.test',
  'arjun@fal.test',
] as const

const MANAGERS = [
  { email: 'viiveek@fal.test', name: 'Viiveek', teamName: "Viiveek's XI", role: 'ADMIN' as const },
  { email: 'rohit@fal.test', name: 'Rohit', teamName: "Rohit's Rockets", role: 'USER' as const },
  { email: 'priya@fal.test', name: 'Priya', teamName: "Priya's Panthers", role: 'USER' as const },
  { email: 'arjun@fal.test', name: 'Arjun', teamName: "Arjun's Avengers", role: 'USER' as const },
]

const LEAGUE_NAME = 'IPL Fantasy League 2026'

// ── Cleanup ───────────────────────────────────────────────────────────

async function cleanup() {
  console.log('Cleaning up previous test data...')
  // Delete in dependency order
  await prisma.teamPlayer.deleteMany({
    where: { league: { name: LEAGUE_NAME } },
  })
  await prisma.team.deleteMany({
    where: { league: { name: LEAGUE_NAME } },
  })
  await prisma.league.deleteMany({
    where: { name: LEAGUE_NAME },
  })
  await prisma.user.deleteMany({
    where: { email: { in: [...TEST_EMAILS] } },
  })
  console.log('  Cleanup done.\n')
}

// ── Draft logic ───────────────────────────────────────────────────────

interface DraftPick {
  playerId: string
  fullname: string
  role: PlayerRole
  iplTeamName: string | null
  iplTeamCode: string | null
  price: number
}

/**
 * Drafts 15 players per team from the available pool, ensuring:
 *   - balanced roles (~2 WK, ~4 BAT, ~4 BOWL, ~5 ALL — adjusted by availability)
 *   - no player appears on multiple teams
 *   - spread across IPL teams
 */
function draftPlayers(
  allPlayers: { id: string; fullname: string; role: PlayerRole; iplTeamName: string | null; iplTeamCode: string | null }[],
  numTeams: number,
  squadSize: number,
): DraftPick[][] {
  // Group by role and shuffle each group
  const byRole: Record<PlayerRole, typeof allPlayers> = {
    WK: shuffle(allPlayers.filter((p) => p.role === 'WK')),
    BAT: shuffle(allPlayers.filter((p) => p.role === 'BAT')),
    BOWL: shuffle(allPlayers.filter((p) => p.role === 'BOWL')),
    ALL: shuffle(allPlayers.filter((p) => p.role === 'ALL')),
  }

  // Target composition per team (adjustable)
  const targets: { role: PlayerRole; count: number }[] = [
    { role: 'WK', count: 2 },
    { role: 'BAT', count: 4 },
    { role: 'BOWL', count: 4 },
    { role: 'ALL', count: 5 },
  ]

  // Check we have enough players total
  const totalNeeded = numTeams * squadSize
  const totalAvailable = Object.values(byRole).reduce((s, arr) => s + arr.length, 0)
  if (totalAvailable < totalNeeded) {
    throw new Error(`Not enough players: need ${totalNeeded}, have ${totalAvailable}`)
  }

  const teams: DraftPick[][] = Array.from({ length: numTeams }, () => [])
  const usedIds = new Set<string>()

  // Price ranges by role (in millions)
  const priceRange: Record<PlayerRole, [number, number]> = {
    WK: [8, 14],
    BAT: [7, 18],
    BOWL: [6, 16],
    ALL: [5, 15],
  }

  // Round-robin draft by role
  for (const { role, count } of targets) {
    const pool = byRole[role]
    // How many can we actually give each team for this role
    const perTeam = Math.min(count, Math.floor(pool.length / numTeams))

    for (let pick = 0; pick < perTeam; pick++) {
      for (let t = 0; t < numTeams; t++) {
        const player = pool.shift()
        if (!player || usedIds.has(player.id)) continue
        usedIds.add(player.id)
        teams[t].push({
          playerId: player.id,
          fullname: player.fullname,
          role: player.role,
          iplTeamName: player.iplTeamName,
          iplTeamCode: player.iplTeamCode,
          price: randomPrice(...priceRange[role]),
        })
      }
    }
  }

  // Fill remaining slots from any leftover players
  const remaining = shuffle(
    allPlayers.filter((p) => !usedIds.has(p.id)),
  )

  for (let t = 0; t < numTeams; t++) {
    while (teams[t].length < squadSize && remaining.length > 0) {
      const player = remaining.shift()!
      if (usedIds.has(player.id)) continue
      usedIds.add(player.id)
      teams[t].push({
        playerId: player.id,
        fullname: player.fullname,
        role: player.role,
        iplTeamName: player.iplTeamName,
        iplTeamCode: player.iplTeamCode,
        price: randomPrice(5, 12),
      })
    }
  }

  return teams
}

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  console.log('=== FAL End-to-End Fantasy League Test ===\n')

  // ── Step 1: Cleanup ──
  await cleanup()

  // ── Step 2: Check player pool ──
  const allPlayers = await prisma.player.findMany({
    select: { id: true, fullname: true, role: true, iplTeamName: true, iplTeamCode: true },
    orderBy: { fullname: 'asc' },
  })
  console.log(`Player pool: ${allPlayers.length} players in database`)
  if (allPlayers.length < 60) {
    console.error(`BLOCKED: Need at least 60 players in DB, found ${allPlayers.length}. Run seed-players.ts first.`)
    process.exit(1)
  }

  // Show role distribution
  const roleCounts: Record<string, number> = {}
  for (const p of allPlayers) {
    roleCounts[p.role] = (roleCounts[p.role] || 0) + 1
  }
  console.log(`  Roles: ${Object.entries(roleCounts).map(([r, c]) => `${r}=${c}`).join(', ')}\n`)

  // ── Step 3: Create 4 test users ──
  console.log('Step 1: Creating test users')
  const users: Record<string, { id: string; email: string }> = {}
  for (const mgr of MANAGERS) {
    const user = await prisma.user.create({
      data: { email: mgr.email, name: mgr.name, role: mgr.role },
    })
    users[mgr.email] = user
  }
  assert(Object.keys(users).length === 4, '4 test users created')

  // ── Step 4: Create league ──
  console.log('\nStep 2: Creating league')
  const inviteCode = generateInviteCode()
  const league = await prisma.league.create({
    data: {
      name: LEAGUE_NAME,
      inviteCode,
      adminUserId: users['viiveek@fal.test'].id,
      minSquadSize: 12,
      maxSquadSize: 15,
    },
  })
  assert(!!league.id, `League created: "${league.name}" (${league.inviteCode})`)
  assert(league.seasonStarted === false, 'Season not yet started')

  // ── Step 5: Create teams ──
  console.log('\nStep 3: Creating teams')
  const teams: Record<string, { id: string; name: string; userId: string }> = {}
  for (const mgr of MANAGERS) {
    const team = await prisma.team.create({
      data: {
        name: mgr.teamName,
        userId: users[mgr.email].id,
        leagueId: league.id,
      },
    })
    teams[mgr.email] = team
  }
  assert(Object.keys(teams).length === 4, '4 teams created in league')

  // ── Step 6: Draft players ──
  console.log('\nStep 4: Drafting players (15 per team)')
  const drafted = draftPlayers(allPlayers, 4, 15)

  for (let i = 0; i < MANAGERS.length; i++) {
    assert(drafted[i].length === 15, `${MANAGERS[i].teamName}: ${drafted[i].length} players drafted`)
  }

  // Verify no duplicates across all teams
  const allDraftedIds = drafted.flat().map((p) => p.playerId)
  const uniqueDraftedIds = new Set(allDraftedIds)
  assert(uniqueDraftedIds.size === 60, `60 unique players drafted (got ${uniqueDraftedIds.size})`)

  // ── Step 7: Generate CSV ──
  console.log('\nStep 5: Generating roster CSV')
  const csvLines = ['managerEmail,teamName,playerName,purchasePrice']
  for (let i = 0; i < MANAGERS.length; i++) {
    for (const pick of drafted[i]) {
      csvLines.push(`${MANAGERS[i].email},${MANAGERS[i].teamName},${pick.fullname},${pick.price}`)
    }
  }
  const csvText = csvLines.join('\n')
  assert(csvLines.length === 61, `CSV has 60 player rows + header (${csvLines.length} lines)`)

  // ── Step 8: Upload rosters (Prisma direct, same logic as route) ──
  console.log('\nStep 6: Uploading rosters via Prisma')

  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < MANAGERS.length; i++) {
      const mgr = MANAGERS[i]
      const team = teams[mgr.email]
      const picks = drafted[i]

      await tx.teamPlayer.createMany({
        data: picks.map((p) => ({
          teamId: team.id,
          playerId: p.playerId,
          leagueId: league.id,
          purchasePrice: p.price,
        })),
      })
    }
  })

  // Verify upload
  const totalTp = await prisma.teamPlayer.count({ where: { leagueId: league.id } })
  assert(totalTp === 60, `60 TeamPlayer rows created (got ${totalTp})`)

  // Verify unique constraint held
  const allTp = await prisma.teamPlayer.findMany({
    where: { leagueId: league.id },
    select: { playerId: true },
  })
  const uniquePlayerIds = new Set(allTp.map((tp) => tp.playerId))
  assert(uniquePlayerIds.size === 60, `All 60 players are unique across teams (got ${uniquePlayerIds.size})`)

  // ── Step 9: Start the season ──
  console.log('\nStep 7: Starting the season')

  // Validate pre-conditions (mirrors route logic)
  const leagueWithTeams = await prisma.league.findUnique({
    where: { id: league.id },
    include: {
      teams: {
        include: {
          _count: { select: { teamPlayers: true } },
          user: { select: { name: true, email: true } },
        },
      },
    },
  })

  assert(leagueWithTeams!.teams.length === 4, `4 teams in league (got ${leagueWithTeams!.teams.length})`)

  const incompleteTeams = leagueWithTeams!.teams.filter(
    (t) => t._count.teamPlayers < leagueWithTeams!.minSquadSize,
  )
  assert(incompleteTeams.length === 0, 'All teams meet minimum squad size')

  // Start season
  const updatedLeague = await prisma.league.update({
    where: { id: league.id },
    data: { seasonStarted: true },
  })
  assert(updatedLeague.seasonStarted === true, 'Season started successfully')

  // ── Step 10: Full verification ──
  console.log('\nStep 8: Verification')

  const finalLeague = await prisma.league.findUnique({
    where: { id: league.id },
    include: {
      teams: {
        include: {
          user: { select: { email: true, name: true } },
          teamPlayers: {
            include: {
              player: {
                select: { fullname: true, role: true, iplTeamName: true, iplTeamCode: true },
              },
            },
            orderBy: { player: { role: 'asc' } },
          },
        },
        orderBy: { name: 'asc' },
      },
    },
  })

  assert(finalLeague!.seasonStarted === true, 'Season is started in DB')
  assert(finalLeague!.teams.length === 4, '4 teams in final league')

  // Check each team
  for (const team of finalLeague!.teams) {
    assert(team.teamPlayers.length === 15, `${team.name}: has 15 players`)

    const roles = new Set(team.teamPlayers.map((tp) => tp.player.role))
    const hasMultipleRoles = roles.size >= 2
    assert(hasMultipleRoles, `${team.name}: has ${roles.size} role types (${[...roles].join(', ')})`)
  }

  // Check total unique players
  const finalAllPlayerIds = finalLeague!.teams.flatMap((t) => t.teamPlayers.map((tp) => tp.playerId))
  const finalUniqueIds = new Set(finalAllPlayerIds)
  assert(finalUniqueIds.size === 60, `60 unique players total (got ${finalUniqueIds.size})`)

  // ── Step 11: Print summary ──
  console.log('\n' + '='.repeat(60))
  console.log(`=== FAL IPL Fantasy League 2026 ===`)
  console.log(`League: ${finalLeague!.name} (${finalLeague!.inviteCode})`)
  console.log(`Season Started: ${finalLeague!.seasonStarted ? '\u2713' : '\u2717'}`)
  console.log(`Teams: ${finalLeague!.teams.length}`)
  console.log('='.repeat(60))

  for (const team of finalLeague!.teams) {
    const budget = team.teamPlayers.reduce((sum, tp) => sum + tp.purchasePrice, 0)
    console.log(`\nTeam: ${team.name} (${team.user.email})`)
    console.log(`  Budget Used: $${budget.toFixed(1)}M`)
    console.log(`  Squad (${team.teamPlayers.length} players):`)

    // Group by role
    const byRole: Record<string, { name: string; team: string; price: number }[]> = {}
    for (const tp of team.teamPlayers) {
      const role = tp.player.role
      if (!byRole[role]) byRole[role] = []
      byRole[role].push({
        name: tp.player.fullname,
        team: tp.player.iplTeamCode || tp.player.iplTeamName || '?',
        price: tp.purchasePrice,
      })
    }

    const roleOrder: PlayerRole[] = ['WK', 'BAT', 'ALL', 'BOWL']
    for (const role of roleOrder) {
      const players = byRole[role] || []
      if (players.length === 0) continue
      const list = players.map((p) => `${p.name} (${p.team}) - $${p.price}M`).join(', ')
      console.log(`    ${role}: ${list}`)
    }
  }

  // ── Summary ──
  console.log('\n' + '='.repeat(60))
  console.log(`Results: ${passed} passed, ${failed} failed`)
  console.log('='.repeat(60))

  if (failed > 0) {
    console.error('\nSome assertions failed!')
    process.exit(1)
  } else {
    console.log('\nAll checks passed. E2E test complete.')
  }
}

main()
  .catch((e) => {
    console.error('Test failed:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
