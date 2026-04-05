/**
 * Incremental fixture sync — adds missing matches and gameweeks
 * without deleting existing scored data.
 *
 * What it does:
 *   1. Fetches all fixtures from SportMonks
 *   2. Generates gameweek windows (Sat-Fri)
 *   3. Creates missing gameweeks (preserves existing ones)
 *   4. Creates missing matches (skips existing apiMatchIds)
 *   5. Updates existing GW lock times if new earlier matches added
 *
 * What it does NOT do:
 *   - Delete any existing matches, gameweeks, or scores
 *   - Modify scored/completed matches
 *   - Touch PlayerPerformance, PlayerScore, or GameweekScore
 *
 * Usage:
 *   npx tsx scripts/sync-fixtures.ts              # dry run
 *   npx tsx scripts/sync-fixtures.ts --apply      # write changes
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import { PrismaClient } from '@prisma/client'
import { fetchSeasonFixtures, generateGameweeks } from '../lib/sportmonks/fixtures'
import { getTeamByApiId } from '../lib/sportmonks/utils'
import { syncFixtures } from '../lib/sportmonks/fixture-sync'

const prisma = new PrismaClient()
const apply = process.argv.includes('--apply')
const quick = process.argv.includes('--quick')

async function main() {
  // Quick mode: just run syncFixtures and print result
  if (quick) {
    const result = await syncFixtures()
    console.log('Result:', JSON.stringify(result, null, 2))
    return
  }

  console.log(`Mode: ${apply ? '🔴 APPLY (writing changes)' : '🟡 DRY RUN (read-only)'}`)

  // 1. Fetch fixtures from SportMonks
  const seasonId = parseInt(process.env.SPORTMONKS_SEASON_ID || '1795')
  console.log(`\nFetching fixtures for season ${seasonId}...`)
  const fixtures = await fetchSeasonFixtures(seasonId)
  console.log(`  SportMonks: ${fixtures.length} fixtures`)

  // 2. Get existing matches from DB
  const existingMatches = await prisma.match.findMany({
    select: { apiMatchId: true },
  })
  const existingIds = new Set(existingMatches.map(m => m.apiMatchId))
  console.log(`  Database: ${existingIds.size} matches`)

  const newFixtures = fixtures.filter(f => !existingIds.has(f.id))
  console.log(`  New fixtures to add: ${newFixtures.length}`)

  if (newFixtures.length === 0) {
    console.log('\n✅ All fixtures already in database. Nothing to do.')
    return
  }

  // 3. Generate gameweek windows from ALL fixtures (existing + new)
  const gwWindows = generateGameweeks(fixtures)
  console.log(`\n  Gameweek windows: ${gwWindows.length}`)

  // 4. Get existing gameweeks
  const existingGws = await prisma.gameweek.findMany({
    select: { id: true, number: true, lockTime: true },
  })
  const existingGwNumbers = new Set(existingGws.map(g => g.number))

  // 5. Determine which GWs need creating
  const newGws = gwWindows.filter(gw => !existingGwNumbers.has(gw.number))
  console.log(`  Existing gameweeks: ${existingGws.length}`)
  console.log(`  New gameweeks to create: ${newGws.length}`)

  // 6. Map fixtures to gameweeks
  function findGameweekNumber(fixtureDate: Date): number | null {
    for (const gw of gwWindows) {
      if (fixtureDate >= gw.startDate && fixtureDate <= gw.endDate) {
        return gw.number
      }
    }
    return null
  }

  // Print summary
  console.log('\n═══ Changes ═══')

  if (newGws.length > 0) {
    console.log('\nNew gameweeks:')
    for (const gw of newGws) {
      console.log(`  GW${gw.number}: ${gw.startDate.toISOString().substring(0, 10)} → ${gw.endDate.toISOString().substring(0, 10)} (lock: ${gw.lockTime.toISOString()})`)
    }
  }

  // Check existing GWs that need lock time updates (new earlier matches added)
  const gwLockUpdates: { number: number; oldLock: Date; newLock: Date }[] = []
  for (const gw of gwWindows) {
    const existing = existingGws.find(g => g.number === gw.number)
    if (existing && existing.lockTime) {
      const existingLock = new Date(existing.lockTime)
      if (gw.lockTime < existingLock) {
        gwLockUpdates.push({ number: gw.number, oldLock: existingLock, newLock: gw.lockTime })
      }
    }
  }

  if (gwLockUpdates.length > 0) {
    console.log('\nGameweek lock time updates:')
    for (const u of gwLockUpdates) {
      console.log(`  GW${u.number}: ${u.oldLock.toISOString()} → ${u.newLock.toISOString()}`)
    }
  }

  // Group new fixtures by GW
  const byGw = new Map<number, typeof newFixtures>()
  for (const f of newFixtures) {
    const gwNum = findGameweekNumber(new Date(f.starting_at))
    if (gwNum === null) continue
    if (!byGw.has(gwNum)) byGw.set(gwNum, [])
    byGw.get(gwNum)!.push(f)
  }

  console.log('\nNew matches by gameweek:')
  for (const [gwNum, gfs] of [...byGw.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`  GW${gwNum}: ${gfs.length} matches`)
    for (const f of gfs) {
      const local = getTeamByApiId(f.localteam_id)
      const visitor = getTeamByApiId(f.visitorteam_id)
      const status = f.status === 'Finished' ? 'COMPLETED' : f.status === 'Cancl.' || f.status === 'Aban.' ? 'CANCELLED' : 'SCHEDULED'
      console.log(`    ${local?.code || '?'} vs ${visitor?.code || '?'} (${f.starting_at.substring(0, 10)}) [${status}]`)
    }
  }

  if (!apply) {
    console.log('\n═══════════════════════════════════════════════')
    console.log('DRY RUN complete. Run with --apply to write changes.')
    console.log('═══════════════════════════════════════════════')
    return
  }

  // ═══ APPLY CHANGES ═══

  // Create new gameweeks
  for (const gw of newGws) {
    await prisma.gameweek.create({
      data: {
        number: gw.number,
        lockTime: gw.lockTime,
        status: 'UPCOMING',
        aggregationStatus: 'PENDING',
      },
    })
    console.log(`  ✓ Created GW${gw.number}`)
  }

  // Update lock times for existing GWs
  for (const u of gwLockUpdates) {
    await prisma.gameweek.updateMany({
      where: { number: u.number },
      data: { lockTime: u.newLock },
    })
    console.log(`  ✓ Updated GW${u.number} lock time`)
  }

  // Build GW number → ID lookup (including newly created)
  const allGws = await prisma.gameweek.findMany({ select: { id: true, number: true } })
  const gwLookup = new Map(allGws.map(g => [g.number, g.id]))

  // Create new matches
  let created = 0
  for (const f of newFixtures) {
    const gwNum = findGameweekNumber(new Date(f.starting_at))
    if (gwNum === null) continue
    const gameweekId = gwLookup.get(gwNum)
    if (!gameweekId) continue

    const localTeam = getTeamByApiId(f.localteam_id)
    const visitorTeam = getTeamByApiId(f.visitorteam_id)
    const scoringStatus = f.status === 'Finished' ? 'COMPLETED'
      : f.status === 'Cancl.' || f.status === 'Aban.' ? 'CANCELLED'
      : 'SCHEDULED'

    await prisma.match.create({
      data: {
        apiMatchId: f.id,
        gameweekId,
        localTeamId: f.localteam_id,
        visitorTeamId: f.visitorteam_id,
        localTeamName: localTeam?.name ?? null,
        visitorTeamName: visitorTeam?.name ?? null,
        startingAt: new Date(f.starting_at),
        apiStatus: f.status,
        scoringStatus,
        note: f.note,
        winnerTeamId: f.winner_team_id,
        superOver: f.super_over,
      },
    })
    created++
  }

  console.log(`\n✅ Sync complete: ${newGws.length} gameweeks created, ${created} matches added.`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
