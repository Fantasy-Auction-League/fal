import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { getSportMonksClient } from '@/lib/sportmonks/client'

// Known IPL season IDs from SportMonks (past seasons only — current season uses local data)
const IPL_SEASONS: Record<number, string> = {
  1689: 'IPL 2025',
  1484: 'IPL 2024',
  1223: 'IPL 2023',
}

interface SeasonBatting {
  runs: number
  matches: number
  innings: number
  balls: number
  fours: number
  sixes: number
  strikeRate: number
  average: number
  highestScore: number | null
}

interface SeasonBowling {
  wickets: number
  matches: number
  overs: number
  runs: number
  economyRate: number
  average: number
}

interface SeasonEntry {
  seasonId: number
  seasonName: string
  batting?: SeasonBatting
  bowling?: SeasonBowling
}

interface SeasonStats {
  seasons: SeasonEntry[]
}

// In-memory cache for SportMonks career stats (avoids repeated API calls)
const careerCache = new Map<number, { data: CareerStats | null; seasons: SeasonStats | null; ts: number }>()
const CACHE_TTL = 1000 * 60 * 60 // 1 hour

interface CareerStats {
  batting: {
    matches: number
    innings: number
    runs: number
    balls: number
    fours: number
    sixes: number
    strikeRate: number
    average: number
    highestScore: number | null
    hundreds: number
    fifties: number
    notOuts: number
  } | null
  bowling: {
    matches: number
    innings: number
    overs: number
    runs: number
    wickets: number
    economyRate: number
    average: number
    bestInnings: string | null
    fourWickets: number
    fiveWickets: number
  } | null
  /** true when stats are filtered to IPL only, false when falling back to all T20/T20I */
  isIplSpecific?: boolean
}

async function fetchCareerStats(apiPlayerId: number): Promise<{ career: CareerStats | null; seasons: SeasonStats | null }> {
  // Check cache
  const cached = careerCache.get(apiPlayerId)
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return { career: cached.data, seasons: cached.seasons }
  }

  try {
    const client = getSportMonksClient()
    const data = await client.fetch<any>(`/players/${apiPlayerId}`, {
      include: 'career',
    })

    if (!data || !data.career) {
      careerCache.set(apiPlayerId, { data: null, seasons: null, ts: Date.now() })
      return { career: null, seasons: null }
    }

    // SportMonks career data is an array of career entries per format/season
    // Each entry has league_id — filter for IPL (league_id = 1)
    const careers: any[] = Array.isArray(data.career) ? data.career : []
    const IPL_LEAGUE_ID = parseInt(process.env.SPORTMONKS_LEAGUE_ID ?? '1', 10)
    const iplCareers = careers.filter(
      (c: any) => c.league_id === IPL_LEAGUE_ID
    )
    // Fall back to all T20/T20I if no IPL-specific entries found
    const t20Careers = iplCareers.length > 0
      ? iplCareers
      : careers.filter((c: any) => c.type === 'T20' || c.type === 'T20I')

    // Aggregate batting stats across T20 careers
    let batting: CareerStats['batting'] = null
    const battingEntries = t20Careers.filter(
      (c: any) => c.batting && (c.batting.runs_scored != null || c.batting.innings != null)
    )
    if (battingEntries.length > 0) {
      const totalRuns = battingEntries.reduce(
        (s: number, c: any) => s + (c.batting.runs_scored ?? 0), 0
      )
      const totalBalls = battingEntries.reduce(
        (s: number, c: any) => s + (c.batting.balls_faced ?? 0), 0
      )
      const totalInnings = battingEntries.reduce(
        (s: number, c: any) => s + (c.batting.innings ?? 0), 0
      )
      const totalMatches = battingEntries.reduce(
        (s: number, c: any) => s + (c.batting.matches ?? 0), 0
      )
      const totalFours = battingEntries.reduce(
        (s: number, c: any) => s + (c.batting.four_x ?? 0), 0
      )
      const totalSixes = battingEntries.reduce(
        (s: number, c: any) => s + (c.batting.six_x ?? 0), 0
      )
      const totalNotOuts = battingEntries.reduce(
        (s: number, c: any) => s + (c.batting.not_outs ?? 0), 0
      )
      const totalHundreds = battingEntries.reduce(
        (s: number, c: any) => s + (c.batting.hundreds ?? 0), 0
      )
      const totalFifties = battingEntries.reduce(
        (s: number, c: any) => s + (c.batting.fifties ?? 0), 0
      )

      batting = {
        matches: totalMatches,
        innings: totalInnings,
        runs: totalRuns,
        balls: totalBalls,
        fours: totalFours,
        sixes: totalSixes,
        strikeRate: totalBalls > 0 ? (totalRuns / totalBalls) * 100 : 0,
        average: (totalInnings - totalNotOuts) > 0
          ? totalRuns / (totalInnings - totalNotOuts) : 0,
        highestScore: battingEntries.reduce(
          (max: number | null, c: any) => {
            const hs = c.batting.highest_inning_score ?? null
            if (hs == null) return max
            return max == null ? hs : Math.max(max, hs)
          }, null
        ),
        hundreds: totalHundreds,
        fifties: totalFifties,
        notOuts: totalNotOuts,
      }
    }

    // Aggregate bowling stats
    let bowling: CareerStats['bowling'] = null
    const bowlingEntries = t20Careers.filter(
      (c: any) => c.bowling && (c.bowling.wickets != null || c.bowling.innings != null)
    )
    if (bowlingEntries.length > 0) {
      const totalWickets = bowlingEntries.reduce(
        (s: number, c: any) => s + (c.bowling.wickets ?? 0), 0
      )
      const totalOvers = bowlingEntries.reduce(
        (s: number, c: any) => s + (c.bowling.overs ?? 0), 0
      )
      const totalRuns = bowlingEntries.reduce(
        (s: number, c: any) => s + (c.bowling.runs ?? 0), 0
      )
      const totalInnings = bowlingEntries.reduce(
        (s: number, c: any) => s + (c.bowling.innings ?? 0), 0
      )
      const totalMatches = bowlingEntries.reduce(
        (s: number, c: any) => s + (c.bowling.matches ?? 0), 0
      )
      const totalFourWickets = bowlingEntries.reduce(
        (s: number, c: any) => s + (c.bowling.four_wickets ?? 0), 0
      )
      const totalFiveWickets = bowlingEntries.reduce(
        (s: number, c: any) => s + (c.bowling.five_wickets ?? 0), 0
      )

      bowling = {
        matches: totalMatches,
        innings: totalInnings,
        overs: totalOvers,
        runs: totalRuns,
        wickets: totalWickets,
        economyRate: totalOvers > 0 ? totalRuns / totalOvers : 0,
        average: totalWickets > 0 ? totalRuns / totalWickets : 0,
        bestInnings: bowlingEntries.reduce(
          (best: string | null, c: any) => c.bowling.best_bowling ?? best, null
        ),
        fourWickets: totalFourWickets,
        fiveWickets: totalFiveWickets,
      }
    }

    const isIplSpecific = iplCareers.length > 0
    const result = (batting || bowling) ? { batting, bowling, isIplSpecific } : null

    // Build per-season stats from career entries matching known IPL season IDs
    const seasonEntries: SeasonEntry[] = []
    const iplSeasonIds = Object.keys(IPL_SEASONS).map(Number)
    for (const sid of iplSeasonIds) {
      const seasonCareers = careers.filter(
        (c: any) => c.season_id === sid && (c.type === 'T20' || c.type === 'T20I')
      )
      if (seasonCareers.length === 0) continue

      let sBatting: SeasonBatting | undefined
      const sBattingEntries = seasonCareers.filter(
        (c: any) => c.batting && (c.batting.runs_scored != null || c.batting.innings != null)
      )
      if (sBattingEntries.length > 0) {
        const runs = sBattingEntries.reduce((s: number, c: any) => s + (c.batting.runs_scored ?? 0), 0)
        const balls = sBattingEntries.reduce((s: number, c: any) => s + (c.batting.balls_faced ?? 0), 0)
        const innings = sBattingEntries.reduce((s: number, c: any) => s + (c.batting.innings ?? 0), 0)
        const matches = sBattingEntries.reduce((s: number, c: any) => s + (c.batting.matches ?? 0), 0)
        const notOuts = sBattingEntries.reduce((s: number, c: any) => s + (c.batting.not_outs ?? 0), 0)
        sBatting = {
          runs, matches, innings, balls,
          fours: sBattingEntries.reduce((s: number, c: any) => s + (c.batting.four_x ?? 0), 0),
          sixes: sBattingEntries.reduce((s: number, c: any) => s + (c.batting.six_x ?? 0), 0),
          strikeRate: balls > 0 ? (runs / balls) * 100 : 0,
          average: (innings - notOuts) > 0 ? runs / (innings - notOuts) : 0,
          highestScore: sBattingEntries.reduce(
            (max: number | null, c: any) => {
              const hs = c.batting.highest_inning_score ?? null
              if (hs == null) return max
              return max == null ? hs : Math.max(max, hs)
            }, null
          ),
        }
      }

      let sBowling: SeasonBowling | undefined
      const sBowlingEntries = seasonCareers.filter(
        (c: any) => c.bowling && (c.bowling.wickets != null || c.bowling.innings != null)
      )
      if (sBowlingEntries.length > 0) {
        const wickets = sBowlingEntries.reduce((s: number, c: any) => s + (c.bowling.wickets ?? 0), 0)
        const overs = sBowlingEntries.reduce((s: number, c: any) => s + (c.bowling.overs ?? 0), 0)
        const runs = sBowlingEntries.reduce((s: number, c: any) => s + (c.bowling.runs ?? 0), 0)
        const matches = sBowlingEntries.reduce((s: number, c: any) => s + (c.bowling.matches ?? 0), 0)
        sBowling = {
          wickets, matches, overs, runs,
          economyRate: overs > 0 ? runs / overs : 0,
          average: wickets > 0 ? runs / wickets : 0,
        }
      }

      if (sBatting || sBowling) {
        seasonEntries.push({
          seasonId: sid,
          seasonName: IPL_SEASONS[sid],
          batting: sBatting,
          bowling: sBowling,
        })
      }
    }

    // Sort by most recent season first (higher season ID = more recent)
    seasonEntries.sort((a, b) => b.seasonId - a.seasonId)

    const seasonStats: SeasonStats | null = seasonEntries.length > 0
      ? { seasons: seasonEntries }
      : null

    careerCache.set(apiPlayerId, { data: result, seasons: seasonStats, ts: Date.now() })
    return { career: result, seasons: seasonStats }
  } catch (error) {
    console.error(`SportMonks career fetch failed for player ${apiPlayerId}:`, error)
    careerCache.set(apiPlayerId, { data: null, seasons: null, ts: Date.now() })
    return { career: null, seasons: null }
  }
}

// GET /api/players/[id] — Player detail with aggregated season stats
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: playerId } = await params

    const player = await prisma.player.findUnique({
      where: { id: playerId },
      include: {
        performances: {
          include: {
            match: {
              select: {
                startingAt: true,
                localTeamName: true,
                visitorTeamName: true,
                gameweek: { select: { number: true } },
              },
            },
          },
          orderBy: { match: { startingAt: 'desc' } },
        },
        teamPlayers: {
          include: {
            team: {
              select: {
                name: true,
                league: { select: { name: true } },
              },
            },
          },
        },
      },
    })

    if (!player) {
      return Response.json({ error: 'Player not found' }, { status: 404 })
    }

    const matchCount = player.performances.length
    const totalPoints = player.performances.reduce(
      (sum, p) => sum + p.fantasyPoints,
      0
    )

    const stats = {
      totalPoints,
      matches: matchCount,
      runs: player.performances.reduce((sum, p) => sum + (p.runs ?? 0), 0),
      wickets: player.performances.reduce(
        (sum, p) => sum + (p.wickets ?? 0),
        0
      ),
      catches: player.performances.reduce((sum, p) => sum + p.catches, 0),
      avgPointsPerMatch: matchCount > 0 ? Math.round(totalPoints / matchCount) : 0,
    }

    // If no local performances, try SportMonks career stats as fallback
    let careerStats: CareerStats | null = null
    let seasonStats: SeasonStats | null = null
    let dataSource: 'local' | 'sportmonks' | 'none' = 'local'

    if (player.apiPlayerId) {
      const fetched = await fetchCareerStats(player.apiPlayerId)
      careerStats = fetched.career
      seasonStats = fetched.seasons
      if (matchCount === 0) {
        dataSource = careerStats ? 'sportmonks' : 'none'
      }
    }

    // Season stats only show past IPL seasons (2025, 2024, 2023) — current season hasn't started yet

    // Fetch upcoming matches for this player's IPL team
    let upcomingFixtures: { opponent: string; startingAt: string; gameweek: number | null }[] = []
    if (player.iplTeamName) {
      const upcoming = await prisma.match.findMany({
        where: {
          scoringStatus: 'SCHEDULED',
          OR: [
            { localTeamName: player.iplTeamName },
            { visitorTeamName: player.iplTeamName },
          ],
        },
        orderBy: { startingAt: 'asc' },
        take: 6,
        select: {
          localTeamName: true,
          visitorTeamName: true,
          startingAt: true,
          gameweek: { select: { number: true } },
        },
      })
      upcomingFixtures = upcoming.map((m) => ({
        opponent: m.localTeamName === player.iplTeamName
          ? (m.visitorTeamName ?? '?')
          : (m.localTeamName ?? '?'),
        startingAt: m.startingAt.toISOString(),
        gameweek: m.gameweek?.number ?? null,
      }))
    }

    return Response.json({
      player: {
        id: player.id,
        fullname: player.fullname,
        firstname: player.firstname,
        lastname: player.lastname,
        role: player.role,
        iplTeamName: player.iplTeamName,
        iplTeamCode: player.iplTeamCode,
        battingStyle: player.battingStyle,
        bowlingStyle: player.bowlingStyle,
        imageUrl: player.imageUrl,
      },
      stats,
      performances: player.performances,
      teams: player.teamPlayers.map((tp) => ({
        teamName: tp.team.name,
        leagueName: tp.team.league.name,
      })),
      dataSource,
      careerStats,
      seasonStats,
      upcomingFixtures,
    })
  } catch (error) {
    console.error('GET /api/players/[id] error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
