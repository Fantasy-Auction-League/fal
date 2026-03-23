/**
 * Lineup validation and API integration test.
 * Run with: npx tsx scripts/test-lineups.ts
 */
import { config } from 'dotenv'
config({ path: '.env.local' })

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const TEST_PREFIX = '__lineup_test__'

async function cleanup() {
  // Delete in dependency order
  await prisma.chipUsage.deleteMany({ where: { team: { name: { startsWith: TEST_PREFIX } } } })
  await prisma.lineupSlot.deleteMany({ where: { lineup: { team: { name: { startsWith: TEST_PREFIX } } } } })
  await prisma.lineup.deleteMany({ where: { team: { name: { startsWith: TEST_PREFIX } } } })
  await prisma.teamPlayer.deleteMany({ where: { team: { name: { startsWith: TEST_PREFIX } } } })
  await prisma.team.deleteMany({ where: { name: { startsWith: TEST_PREFIX } } })
  await prisma.gameweek.deleteMany({ where: { number: { in: [901, 902] } } })
  await prisma.league.deleteMany({ where: { name: { startsWith: TEST_PREFIX } } })
  await prisma.user.deleteMany({ where: { email: { startsWith: TEST_PREFIX } } })
}

let passed = 0
let failed = 0

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  PASS: ${msg}`)
    passed++
  } else {
    console.error(`  FAIL: ${msg}`)
    failed++
  }
}

async function main() {
  console.log('Cleaning up previous test data...')
  await cleanup()

  console.log('\n--- Setup ---')

  // Create 2 users
  const user1 = await prisma.user.create({ data: { email: `${TEST_PREFIX}user1@test.com`, name: 'TestUser1' } })
  const user2 = await prisma.user.create({ data: { email: `${TEST_PREFIX}user2@test.com`, name: 'TestUser2' } })
  console.log(`Created users: ${user1.id}, ${user2.id}`)

  // Create league
  const league = await prisma.league.create({
    data: { name: `${TEST_PREFIX}league`, inviteCode: `${TEST_PREFIX}inv`, adminUserId: user1.id },
  })
  console.log(`Created league: ${league.id}`)

  // Create 2 teams
  const team1 = await prisma.team.create({ data: { name: `${TEST_PREFIX}team1`, userId: user1.id, leagueId: league.id } })
  const team2 = await prisma.team.create({ data: { name: `${TEST_PREFIX}team2`, userId: user2.id, leagueId: league.id } })
  console.log(`Created teams: ${team1.id}, ${team2.id}`)

  // Get 15 players from DB (must exist from seed)
  const players = await prisma.player.findMany({ take: 30, orderBy: { fullname: 'asc' } })
  if (players.length < 30) {
    console.error('Need at least 30 players seeded in DB. Run seed:players first.')
    await cleanup()
    process.exit(1)
  }

  const team1Players = players.slice(0, 15)
  const team2Players = players.slice(15, 30)

  // Assign players to teams
  for (const p of team1Players) {
    await prisma.teamPlayer.create({
      data: { teamId: team1.id, playerId: p.id, leagueId: league.id },
    })
  }
  for (const p of team2Players) {
    await prisma.teamPlayer.create({
      data: { teamId: team2.id, playerId: p.id, leagueId: league.id },
    })
  }
  console.log('Assigned 15 players per team')

  // Create gameweek with future lock
  const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000) // tomorrow
  const gw1 = await prisma.gameweek.create({ data: { number: 901, lockTime: futureDate, status: 'UPCOMING' } })
  const gw2 = await prisma.gameweek.create({ data: { number: 902, lockTime: futureDate, status: 'UPCOMING' } })
  console.log(`Created gameweeks: GW${gw1.number} (${gw1.id}), GW${gw2.number} (${gw2.id})`)

  // --- Import validation directly for unit tests ---
  const { validateLineup } = await import('../lib/lineup/validation')
  const { isGameweekLocked } = await import('../lib/lineup/lock')

  // ============================================================
  console.log('\n--- Test 1: Valid lineup submission ---')
  // ============================================================

  const validSlots = [
    ...team1Players.slice(0, 11).map((p, i) => ({
      playerId: p.id,
      slotType: 'XI' as const,
      benchPriority: null,
      role: i === 0 ? ('CAPTAIN' as const) : i === 1 ? ('VC' as const) : null,
    })),
    ...team1Players.slice(11, 15).map((p, i) => ({
      playerId: p.id,
      slotType: 'BENCH' as const,
      benchPriority: i + 1,
      role: null,
    })),
  ]

  const result1 = await validateLineup(team1.id, league.id, { slots: validSlots })
  assert(result1.valid === true, 'Valid lineup passes validation')
  assert(result1.errors.length === 0, 'No errors for valid lineup')

  // ============================================================
  console.log('\n--- Test 2: Only 10 XI players ---')
  // ============================================================

  const tenXISlots = [
    ...team1Players.slice(0, 10).map((p, i) => ({
      playerId: p.id,
      slotType: 'XI' as const,
      benchPriority: null,
      role: i === 0 ? ('CAPTAIN' as const) : i === 1 ? ('VC' as const) : null,
    })),
    ...team1Players.slice(10, 15).map((p, i) => ({
      playerId: p.id,
      slotType: 'BENCH' as const,
      benchPriority: i + 1,
      role: null,
    })),
  ]

  const result2 = await validateLineup(team1.id, league.id, { slots: tenXISlots })
  assert(result2.valid === false, '10 XI fails validation')
  assert(result2.errors.some(e => e.includes('11')), 'Error mentions 11 players')

  // ============================================================
  console.log('\n--- Test 3: Same player as Captain and VC ---')
  // ============================================================

  const sameCaptVCSlots = [
    ...team1Players.slice(0, 11).map((p, i) => ({
      playerId: p.id,
      slotType: 'XI' as const,
      benchPriority: null,
      role: i === 0 ? ('CAPTAIN' as const) : i === 0 ? ('VC' as const) : i === 1 ? ('VC' as const) : null,
    })),
    ...team1Players.slice(11, 15).map((p, i) => ({
      playerId: p.id,
      slotType: 'BENCH' as const,
      benchPriority: i + 1,
      role: null,
    })),
  ]
  // Force captain=VC on same player
  sameCaptVCSlots[0] = { playerId: team1Players[0].id, slotType: 'XI', benchPriority: null, role: 'CAPTAIN' }
  // Remove VC from slot 1, give it to slot 0 too — but we need separate entry
  // Actually: test "no VC" scenario since we can't have 2 roles on 1 slot
  const noVCSlots = sameCaptVCSlots.map(s => ({ ...s, role: s.role === 'VC' ? null : s.role }))
  const result3 = await validateLineup(team1.id, league.id, { slots: noVCSlots })
  assert(result3.valid === false, 'Missing VC fails validation')
  assert(result3.errors.some(e => e.includes('Vice Captain')), 'Error mentions Vice Captain')

  // ============================================================
  console.log('\n--- Test 4: Player not on squad ---')
  // ============================================================

  const foreignSlots = [...validSlots]
  foreignSlots[5] = {
    playerId: team2Players[0].id, // player from team2
    slotType: 'XI',
    benchPriority: null,
    role: null,
  }

  const result4 = await validateLineup(team1.id, league.id, { slots: foreignSlots })
  assert(result4.valid === false, 'Foreign player fails validation')
  assert(result4.errors.some(e => e.includes('not on this team')), 'Error mentions not on team')

  // ============================================================
  console.log('\n--- Test 5: Duplicate players ---')
  // ============================================================

  const dupeSlots = [...validSlots]
  dupeSlots[5] = { ...dupeSlots[0], role: null } // duplicate player 0
  const result5 = await validateLineup(team1.id, league.id, { slots: dupeSlots })
  assert(result5.valid === false, 'Duplicate players fail validation')
  assert(result5.errors.some(e => e.includes('Duplicate')), 'Error mentions duplicate')

  // ============================================================
  console.log('\n--- Test 6: Lock check utility ---')
  // ============================================================

  assert(isGameweekLocked(null) === false, 'null lockTime is not locked')
  assert(isGameweekLocked(new Date(Date.now() + 100000)) === false, 'Future lockTime is not locked')
  assert(isGameweekLocked(new Date(Date.now() - 100000)) === true, 'Past lockTime is locked')

  // ============================================================
  console.log('\n--- Test 7: DB lineup upsert (simulating PUT) ---')
  // ============================================================

  // Create lineup via Prisma directly (simulating what the route does)
  const lineup = await prisma.lineup.create({
    data: {
      teamId: team1.id,
      gameweekId: gw1.id,
      slots: {
        create: validSlots.map(s => ({
          playerId: s.playerId,
          slotType: s.slotType,
          benchPriority: s.benchPriority,
          role: s.role,
        })),
      },
    },
    include: { slots: true },
  })

  assert(lineup.slots.length === 15, 'Lineup created with 15 slots')
  assert(lineup.slots.filter(s => s.slotType === 'XI').length === 11, '11 XI slots')
  assert(lineup.slots.filter(s => s.slotType === 'BENCH').length === 4, '4 BENCH slots')
  assert(lineup.slots.filter(s => s.role === 'CAPTAIN').length === 1, '1 Captain')
  assert(lineup.slots.filter(s => s.role === 'VC').length === 1, '1 VC')

  // ============================================================
  console.log('\n--- Test 8: Chip activation ---')
  // ============================================================

  const chip = await prisma.chipUsage.create({
    data: { teamId: team1.id, chipType: 'POWER_PLAY_BAT', gameweekId: gw1.id, status: 'PENDING' },
  })
  assert(chip.chipType === 'POWER_PLAY_BAT', 'Chip created as POWER_PLAY_BAT')
  assert(chip.status === 'PENDING', 'Chip status is PENDING')

  // Try duplicate chip (should fail due to @@unique([teamId, chipType]))
  let dupeFailed = false
  try {
    await prisma.chipUsage.create({
      data: { teamId: team1.id, chipType: 'POWER_PLAY_BAT', gameweekId: gw2.id, status: 'PENDING' },
    })
  } catch {
    dupeFailed = true
  }
  assert(dupeFailed, 'Duplicate chip activation rejected by DB constraint')

  // ============================================================
  console.log('\n--- Test 9: Chip deactivation ---')
  // ============================================================

  await prisma.chipUsage.delete({ where: { id: chip.id } })
  const deletedChip = await prisma.chipUsage.findUnique({ where: { id: chip.id } })
  assert(deletedChip === null, 'Chip deleted successfully')

  // ============================================================
  console.log('\n--- Test 10: Carry-forward ---')
  // ============================================================

  // GW2 should not have a lineup yet
  const gw2Lineup = await prisma.lineup.findUnique({
    where: { teamId_gameweekId: { teamId: team1.id, gameweekId: gw2.id } },
  })
  assert(gw2Lineup === null, 'No lineup for GW2 initially')

  // Simulate carry-forward: copy GW1 lineup to GW2
  const gw1Lineup = await prisma.lineup.findUnique({
    where: { teamId_gameweekId: { teamId: team1.id, gameweekId: gw1.id } },
    include: { slots: true },
  })

  if (gw1Lineup) {
    const carried = await prisma.lineup.create({
      data: {
        teamId: team1.id,
        gameweekId: gw2.id,
        slots: {
          create: gw1Lineup.slots.map(s => ({
            playerId: s.playerId,
            slotType: s.slotType,
            benchPriority: s.benchPriority,
            role: s.role,
          })),
        },
      },
      include: { slots: true },
    })
    assert(carried.slots.length === 15, 'Carry-forward created 15 slots for GW2')
  }

  // ============================================================
  console.log('\n--- Test 11: Lock enforcement ---')
  // ============================================================

  // Set GW1 lock to past
  await prisma.gameweek.update({ where: { id: gw1.id }, data: { lockTime: new Date(Date.now() - 60000) } })
  const updatedGw = await prisma.gameweek.findUnique({ where: { id: gw1.id } })
  assert(isGameweekLocked(updatedGw!.lockTime), 'GW1 is now locked (past lockTime)')

  // ============================================================
  console.log('\n--- Cleanup ---')
  await cleanup()
  console.log('Cleaned up.')

  // ============================================================
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch(async (err) => {
  console.error('Test error:', err)
  await cleanup().catch(() => {})
  process.exit(1)
})
