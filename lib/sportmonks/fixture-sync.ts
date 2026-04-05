import { prisma } from '@/lib/db'
import { sportmonks } from './client'
import { getTeamByApiId } from './utils'
import { fetchSeasonFixtures, generateGameweeks } from './fixtures'

export interface FixtureSyncResult {
  gameweeksCreated: number
  matchesCreated: number
  matchesUpdated: number
  lockTimesUpdated: number
}

/**
 * Incrementally sync fixtures from SportMonks.
 * Adds new matches and gameweeks without deleting existing data.
 */
export async function syncFixtures(seasonId?: number): Promise<FixtureSyncResult> {
  const sid = seasonId || parseInt(process.env.SPORTMONKS_SEASON_ID || '1795')

  // 1. Fetch all fixtures from SportMonks
  const fixtures = await fetchSeasonFixtures(sid)
  if (fixtures.length === 0) return { gameweeksCreated: 0, matchesCreated: 0, matchesUpdated: 0, lockTimesUpdated: 0 }

  // 2. Get existing matches
  const existingMatches = await prisma.match.findMany({ select: { apiMatchId: true } })
  const existingIds = new Set(existingMatches.map(m => m.apiMatchId))
  const newFixtures = fixtures.filter(f => !existingIds.has(f.id))

  // Check for existing matches with null team names that SportMonks may have updated
  const nullTeamMatches = await prisma.match.findMany({
    where: { OR: [{ localTeamName: null }, { visitorTeamName: null }] },
    select: { id: true, apiMatchId: true, localTeamId: true, visitorTeamId: true, localTeamName: true, visitorTeamName: true },
  })

  let matchesUpdated = 0
  if (nullTeamMatches.length > 0) {
    const fixtureMap = new Map(fixtures.map(f => [f.id, f]))
    for (const match of nullTeamMatches) {
      const fixture = fixtureMap.get(match.apiMatchId)
      if (!fixture) continue

      const localTeam = getTeamByApiId(fixture.localteam_id)
      const visitorTeam = getTeamByApiId(fixture.visitorteam_id)
      const newLocal = localTeam?.name ?? null
      const newVisitor = visitorTeam?.name ?? null

      // Only update if SportMonks now has real team data
      const needsUpdate =
        (match.localTeamName === null && newLocal !== null) ||
        (match.visitorTeamName === null && newVisitor !== null) ||
        (match.localTeamId !== fixture.localteam_id) ||
        (match.visitorTeamId !== fixture.visitorteam_id)

      if (needsUpdate) {
        await prisma.match.update({
          where: { id: match.id },
          data: {
            localTeamId: fixture.localteam_id,
            visitorTeamId: fixture.visitorteam_id,
            localTeamName: newLocal,
            visitorTeamName: newVisitor,
          },
        })
        matchesUpdated++
      }
    }
  }

  if (newFixtures.length === 0) return { gameweeksCreated: 0, matchesCreated: 0, matchesUpdated, lockTimesUpdated: 0 }

  // 3. Generate GW windows from ALL fixtures
  const gwWindows = generateGameweeks(fixtures)

  // 4. Get existing gameweeks
  const existingGws = await prisma.gameweek.findMany({
    select: { id: true, number: true, lockTime: true },
  })
  const existingGwNumbers = new Set(existingGws.map(g => g.number))

  // 5. Create missing gameweeks
  let gameweeksCreated = 0
  for (const gw of gwWindows) {
    if (existingGwNumbers.has(gw.number)) continue
    await prisma.gameweek.create({
      data: {
        number: gw.number,
        lockTime: gw.lockTime,
        status: 'UPCOMING',
        aggregationStatus: 'PENDING',
      },
    })
    gameweeksCreated++
  }

  // 6. Update lock times for existing GWs if new earlier matches were added
  let lockTimesUpdated = 0
  for (const gw of gwWindows) {
    const existing = existingGws.find(g => g.number === gw.number)
    if (existing?.lockTime && gw.lockTime < new Date(existing.lockTime)) {
      await prisma.gameweek.updateMany({
        where: { number: gw.number },
        data: { lockTime: gw.lockTime },
      })
      lockTimesUpdated++
    }
  }

  // 7. Build GW lookup
  const allGws = await prisma.gameweek.findMany({ select: { id: true, number: true } })
  const gwLookup = new Map(allGws.map(g => [g.number, g.id]))

  function findGameweekNumber(fixtureDate: Date): number | null {
    for (const gw of gwWindows) {
      if (fixtureDate >= gw.startDate && fixtureDate <= gw.endDate) return gw.number
    }
    return null
  }

  // 8. Create missing matches
  let matchesCreated = 0
  for (const f of newFixtures) {
    const gwNum = findGameweekNumber(new Date(f.starting_at))
    if (gwNum === null) continue
    const gameweekId = gwLookup.get(gwNum)
    if (!gameweekId) continue

    const localTeam = getTeamByApiId(f.localteam_id)
    const visitorTeam = getTeamByApiId(f.visitorteam_id)
    const scoringStatus = f.status === 'Finished' ? 'COMPLETED'
      : (f.status === 'Cancl.' || f.status === 'Aban.') ? 'CANCELLED'
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
    matchesCreated++
  }

  return { gameweeksCreated, matchesCreated, matchesUpdated, lockTimesUpdated }
}
