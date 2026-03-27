import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { computeLeagueLiveScores } from '@/lib/scoring/live'

// GET /api/leaderboard/[leagueId] — League standings
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { leagueId } = await params

    const league = await prisma.league.findUnique({
      where: { id: leagueId },
      select: { adminUserId: true },
    })
    if (!league) {
      return Response.json({ error: 'League not found' }, { status: 404 })
    }

    const isAdmin = league.adminUserId === session.user.id
    const isMember = await prisma.team.findFirst({
      where: { leagueId, userId: session.user.id },
    })
    if (!isMember && !isAdmin) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Get all teams with their latest GW score
    const teams = await prisma.team.findMany({
      where: { leagueId },
      include: {
        user: { select: { id: true, name: true, email: true } },
        gameweekScores: {
          orderBy: { gameweek: { number: 'desc' } },
          take: 1,
          include: { gameweek: { select: { number: true } } },
        },
      },
      orderBy: [{ totalPoints: 'desc' }, { bestGwScore: 'desc' }],
    })

    // Detect active gameweek (status ACTIVE, aggregationStatus not DONE)
    // ASSUMPTION: Only one gameweek is active at a time per season.
    // orderBy: { number: 'desc' } ensures determinism if multiple exist.
    const activeGw = await prisma.gameweek.findFirst({
      where: { status: 'ACTIVE', aggregationStatus: { not: 'DONE' } },
      orderBy: { number: 'desc' },
    })

    let liveResult: Awaited<ReturnType<typeof computeLeagueLiveScores>> | null = null
    let gwStatus: 'LIVE' | 'FINAL' = 'FINAL'

    // If active GW exists, compute live standings
    if (activeGw) {
      liveResult = await computeLeagueLiveScores(prisma, activeGw.id, leagueId)
      gwStatus = 'LIVE'
    }

    // Compute previous rank (by stored season total only)
    // Tiebreaker: totalPoints desc, then bestGwScore desc, then team.id for determinism
    const previousRankMap = new Map<string, number>()
    const sortedByStoredTotal = [...teams].sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) {
        return b.totalPoints - a.totalPoints
      }
      if (b.bestGwScore !== a.bestGwScore) {
        return b.bestGwScore - a.bestGwScore
      }
      return a.id.localeCompare(b.id)
    })
    sortedByStoredTotal.forEach((team, index) => {
      previousRankMap.set(team.id, index + 1)
    })

    // If live mode, compute current rank with live GW points
    let teamsForRanking = teams
    if (liveResult) {
      // Merge live GW points with stored totals
      teamsForRanking = teams.map((team) => ({
        ...team,
        totalPoints: team.totalPoints + (liveResult!.teamScores.get(team.id)?.liveGwPoints ?? 0),
      }))
    }

    // Sort by merged total points for current ranking
    // Tiebreaker: totalPoints desc, then bestGwScore desc, then team.id for determinism
    const sortedByCurrentTotal = [...teamsForRanking].sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) {
        return b.totalPoints - a.totalPoints
      }
      if (b.bestGwScore !== a.bestGwScore) {
        return b.bestGwScore - a.bestGwScore
      }
      return a.id.localeCompare(b.id)
    })
    const currentRankMap = new Map<string, number>()
    sortedByCurrentTotal.forEach((team, index) => {
      currentRankMap.set(team.id, index + 1)
    })

    // Build standings
    const standings = teams.map((team) => {
      const latestGw = team.gameweekScores[0]
      const liveGwPoints = liveResult?.teamScores.get(team.id)?.liveGwPoints ?? null
      const currentTotal = team.totalPoints + (liveGwPoints ?? 0)
      const currentRank = currentRankMap.get(team.id) ?? teams.length
      const previousRank = previousRankMap.get(team.id) ?? teams.length
      const rankChange = previousRank - currentRank

      return {
        rank: currentRank,
        rankChange,
        teamId: team.id,
        teamName: team.name,
        manager: team.user.name || team.user.email,
        managerId: team.user.id,
        totalPoints: currentTotal,
        storedTotalPoints: team.totalPoints,
        bestGwScore: team.bestGwScore,
        liveGwPoints,
        lastGwPoints: latestGw?.totalPoints ?? 0,
        lastGwNumber: latestGw?.gameweek.number ?? null,
        chipUsed: latestGw?.chipUsed ?? null,
        chipActive: liveResult?.teamScores.get(team.id)?.chipType ?? null,
      }
    })

    // Sort standings by current rank
    standings.sort((a, b) => a.rank - b.rank)

    // Set cache headers
    const headers: Record<string, string> =
      gwStatus === 'LIVE'
        ? { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' }
        : { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' }

    return Response.json(
      {
        standings,
        leagueId,
        gwStatus,
        activeGwNumber: activeGw?.number ?? null,
        matchesScored: liveResult?.matchesScored ?? null,
        matchesTotal: liveResult?.matchesTotal ?? null,
      },
      { headers }
    )
  } catch (error) {
    console.error('GET /api/leaderboard/[leagueId] error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
