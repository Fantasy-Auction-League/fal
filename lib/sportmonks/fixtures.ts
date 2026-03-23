import { sportmonks, SportMonksClient } from './client'
import { getTeamByApiId } from './utils'
import type { PrismaClient } from '@prisma/client'
import type {
  SportMonksFixture,
  SportMonksScorecard,
  SportMonksBatting,
  SportMonksBowling,
  SportMonksLineupPlayer,
  SportMonksBall,
  SportMonksRuns,
} from './types'

export async function fetchSeasonFixtures(
  seasonId: number = 1795,
  client?: SportMonksClient
): Promise<SportMonksFixture[]> {
  const c = client || sportmonks
  const data = await c.fetch<{ fixtures: SportMonksFixture[] }>(
    `/seasons/${seasonId}`,
    { include: 'fixtures' }
  )
  return data.fixtures || []
}

export async function fetchScorecard(
  fixtureId: number,
  includeBalls = false,
  client?: SportMonksClient
): Promise<SportMonksScorecard> {
  const c = client || sportmonks
  const includes = includeBalls
    ? 'batting,bowling,lineup,runs,balls'
    : 'batting,bowling,lineup,runs'

  const data = await c.fetch<any>(`/fixtures/${fixtureId}`, {
    include: includes,
  })

  return {
    fixture: data as SportMonksFixture,
    batting: (data.batting || []) as SportMonksBatting[],
    bowling: (data.bowling || []) as SportMonksBowling[],
    lineup: (data.lineup || []) as SportMonksLineupPlayer[],
    balls: includeBalls ? ((data.balls || []) as SportMonksBall[]) : undefined,
    runs: (data.runs || []) as SportMonksRuns[],
  }
}

// Generate gameweek windows (Mon-Sun) covering the fixture dates
export function generateGameweeks(
  fixtures: SportMonksFixture[]
): { number: number; startDate: Date; endDate: Date; lockTime: Date }[] {
  if (fixtures.length === 0) return []

  const dates = fixtures
    .map((f) => new Date(f.starting_at))
    .sort((a, b) => a.getTime() - b.getTime())
  const firstMatch = dates[0]
  const lastMatch = dates[dates.length - 1]

  // Find the Monday before the first match
  const firstMonday = new Date(firstMatch)
  firstMonday.setDate(firstMonday.getDate() - ((firstMonday.getDay() + 6) % 7))
  firstMonday.setHours(0, 0, 0, 0)

  const gameweeks: {
    number: number
    startDate: Date
    endDate: Date
    lockTime: Date
  }[] = []
  let gwNum = 1
  const current = new Date(firstMonday)

  while (current <= lastMatch) {
    const start = new Date(current)
    const end = new Date(current)
    end.setDate(end.getDate() + 6)
    end.setHours(23, 59, 59, 999)

    // Lock time = earliest match in this GW window
    const gwFixtures = fixtures.filter((f) => {
      const d = new Date(f.starting_at)
      return d >= start && d <= end
    })

    if (gwFixtures.length > 0) {
      const lockTime = gwFixtures
        .map((f) => new Date(f.starting_at))
        .sort((a, b) => a.getTime() - b.getTime())[0]

      gameweeks.push({ number: gwNum, startDate: start, endDate: end, lockTime })
      gwNum++
    }

    current.setDate(current.getDate() + 7)
  }

  return gameweeks
}

export async function importFixturesAndGameweeks(
  db: PrismaClient,
  seasonId: number = 1795
) {
  // 1. Fetch fixtures from SportMonks
  const fixtures = await fetchSeasonFixtures(seasonId)
  if (fixtures.length === 0) {
    throw new Error(`No fixtures found for season ${seasonId}`)
  }

  // 2. Generate gameweek windows
  const gwWindows = generateGameweeks(fixtures)

  // 3. Run in a transaction
  const result = await db.$transaction(async (tx) => {
    // Delete existing matches then gameweeks (matches have FK to gameweeks)
    await tx.match.deleteMany()
    await tx.gameweek.deleteMany()

    // Create gameweeks
    const createdGws = await Promise.all(
      gwWindows.map((gw) =>
        tx.gameweek.create({
          data: {
            number: gw.number,
            lockTime: gw.lockTime,
            status: 'UPCOMING',
            aggregationStatus: 'PENDING',
          },
        })
      )
    )

    // Build a lookup: gwNumber -> gameweekId
    const gwLookup = new Map(createdGws.map((g) => [g.number, g.id]))

    // Map each fixture to its gameweek
    function findGameweekNumber(fixtureDate: Date): number | null {
      for (const gw of gwWindows) {
        if (fixtureDate >= gw.startDate && fixtureDate <= gw.endDate) {
          return gw.number
        }
      }
      return null
    }

    // Create matches
    const matchSummaries: {
      apiMatchId: number
      local: string
      visitor: string
      gameweek: number
      startingAt: string
    }[] = []

    for (const fixture of fixtures) {
      const fixtureDate = new Date(fixture.starting_at)
      const gwNum = findGameweekNumber(fixtureDate)
      if (gwNum === null) continue

      const gameweekId = gwLookup.get(gwNum)!
      const localTeam = getTeamByApiId(fixture.localteam_id)
      const visitorTeam = getTeamByApiId(fixture.visitorteam_id)

      const scoringStatus =
        fixture.status === 'Finished'
          ? 'COMPLETED'
          : fixture.status === 'Cancelled'
            ? 'CANCELLED'
            : 'SCHEDULED'

      await tx.match.create({
        data: {
          apiMatchId: fixture.id,
          gameweekId,
          localTeamId: fixture.localteam_id,
          visitorTeamId: fixture.visitorteam_id,
          localTeamName: localTeam?.name ?? null,
          visitorTeamName: visitorTeam?.name ?? null,
          startingAt: fixtureDate,
          apiStatus: fixture.status,
          scoringStatus,
          note: fixture.note,
          winnerTeamId: fixture.winner_team_id,
          superOver: fixture.super_over,
        },
      })

      matchSummaries.push({
        apiMatchId: fixture.id,
        local: localTeam?.code ?? String(fixture.localteam_id),
        visitor: visitorTeam?.code ?? String(fixture.visitorteam_id),
        gameweek: gwNum,
        startingAt: fixture.starting_at,
      })
    }

    return {
      gameweeks: createdGws.length,
      matches: matchSummaries.length,
      fixtures: matchSummaries,
    }
  })

  return result
}
