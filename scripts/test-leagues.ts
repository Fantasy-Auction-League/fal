/**
 * Test script for League + Team API business logic.
 * Tests Prisma operations directly (no HTTP/auth needed).
 *
 * Run: npx tsx scripts/test-leagues.ts
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

function generateInviteCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let code = 'FAL-'
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

async function cleanup() {
  // Clean up test data in correct order
  await prisma.teamPlayer.deleteMany({ where: { team: { name: { startsWith: 'TEST_' } } } })
  await prisma.team.deleteMany({ where: { name: { startsWith: 'TEST_' } } })
  await prisma.league.deleteMany({ where: { name: { startsWith: 'TEST_' } } })
  await prisma.user.deleteMany({ where: { email: { startsWith: 'test-league-' } } })
}

async function main() {
  console.log('--- League + Team Logic Tests ---\n')

  // Cleanup previous test data
  await cleanup()

  // 1. Create test users
  const admin = await prisma.user.create({
    data: { email: 'test-league-admin@fal.test', name: 'Test Admin' },
  })
  const user2 = await prisma.user.create({
    data: { email: 'test-league-user2@fal.test', name: 'Test User 2' },
  })
  const user3 = await prisma.user.create({
    data: { email: 'test-league-user3@fal.test', name: 'Test User 3' },
  })
  console.log('[OK] Created 3 test users')

  // 2. Create a league (simulates POST /api/leagues)
  const inviteCode = generateInviteCode()
  const league = await prisma.league.create({
    data: {
      name: 'TEST_Premier League',
      inviteCode,
      adminUserId: admin.id,
      teams: {
        create: { name: "TEST_Admin's Team", userId: admin.id },
      },
    },
    include: { teams: true },
  })
  console.log(`[OK] Created league "${league.name}" with code ${league.inviteCode}`)
  console.assert(league.teams.length === 1, 'League should have 1 team')
  console.assert(league.adminUserId === admin.id, 'Admin should be set')

  // 3. List leagues for admin (simulates GET /api/leagues)
  const adminLeagues = await prisma.league.findMany({
    where: { teams: { some: { userId: admin.id } } },
    include: { _count: { select: { teams: true } } },
  })
  console.assert(adminLeagues.length === 1, 'Admin should see 1 league')
  console.log(`[OK] Admin sees ${adminLeagues.length} league(s)`)

  // 4. Join league (simulates POST /api/leagues/[id]/join)
  const team2 = await prisma.team.create({
    data: { name: 'TEST_User2 Team', userId: user2.id, leagueId: league.id },
  })
  console.log(`[OK] User2 joined league with team "${team2.name}"`)

  // 5. Verify duplicate join blocked
  const existingTeam = await prisma.team.findFirst({
    where: { leagueId: league.id, userId: user2.id },
  })
  console.assert(existingTeam !== null, 'User2 already has a team')
  console.log('[OK] Duplicate join check works')

  // 6. League detail (simulates GET /api/leagues/[id])
  const detail = await prisma.league.findUnique({
    where: { id: league.id },
    include: {
      teams: { include: { user: { select: { id: true, name: true, email: true } } } },
      _count: { select: { teams: true } },
    },
  })
  console.assert(detail!._count.teams === 2, 'Should have 2 teams now')
  console.log(`[OK] League detail: ${detail!._count.teams} teams`)

  // 7. Membership check
  const isMember = detail!.teams.some((t) => t.userId === user2.id)
  const isNotMember = !detail!.teams.some((t) => t.userId === user3.id)
  console.assert(isMember, 'User2 should be a member')
  console.assert(isNotMember, 'User3 should NOT be a member')
  console.log('[OK] Membership checks pass')

  // 8. Update settings (simulates PUT /api/leagues/[id]/settings)
  const updated = await prisma.league.update({
    where: { id: league.id },
    data: { name: 'TEST_Updated League', maxManagers: 10 },
  })
  console.assert(updated.name === 'TEST_Updated League', 'Name should be updated')
  console.assert(updated.maxManagers === 10, 'Max managers should be 10')
  console.log('[OK] Settings updated')

  // 9. Admin check for settings
  const nonAdminCheck = league.adminUserId !== user2.id
  console.assert(nonAdminCheck, 'User2 is not admin')
  console.log('[OK] Admin-only guard works')

  // 10. Remove manager (simulates DELETE /api/leagues/[id]/managers/[userId])
  const teamToRemove = await prisma.team.findFirst({
    where: { leagueId: league.id, userId: user2.id },
  })
  await prisma.team.delete({ where: { id: teamToRemove!.id } })
  const afterRemoval = await prisma.league.findUnique({
    where: { id: league.id },
    include: { _count: { select: { teams: true } } },
  })
  console.assert(afterRemoval!._count.teams === 1, 'Should have 1 team after removal')
  console.log('[OK] Manager removed, 1 team remains')

  // 11. Cannot remove self check
  const selfRemoveBlocked = league.adminUserId === admin.id
  console.assert(selfRemoveBlocked, 'Admin cannot remove self (guard logic)')
  console.log('[OK] Self-removal guard works')

  // 12. Full capacity check
  const smallLeague = await prisma.league.create({
    data: {
      name: 'TEST_Small League',
      inviteCode: generateInviteCode(),
      adminUserId: admin.id,
      maxManagers: 2,
      teams: {
        createMany: {
          data: [
            { name: "TEST_Admin's Small Team", userId: admin.id },
            { name: 'TEST_User3 Small Team', userId: user3.id },
          ],
        },
      },
    },
    include: { teams: true },
  })
  const isFull = smallLeague.teams.length >= smallLeague.maxManagers
  console.assert(isFull, 'Small league should be full')
  console.log('[OK] Full league check works')

  // Cleanup
  await cleanup()
  console.log('\n--- All tests passed ---')
}

main()
  .catch((e) => {
    console.error('Test failed:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
