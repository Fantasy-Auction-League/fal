import { sportmonks, SportMonksClient } from './client'
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
