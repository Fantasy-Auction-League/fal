import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { computeLeagueLiveScores } from '@/lib/scoring/live'

// GET /api/leaderboard/[leagueId]/history — GW-by-GW history
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

    const scores = await prisma.gameweekScore.findMany({
      where: { team: { leagueId } },
      include: {
        team: {
          select: {
            id: true,
            name: true,
            user: { select: { name: true } },
          },
        },
        gameweek: { select: { id: true, number: true } },
      },
      orderBy: [{ gameweek: { number: 'asc' } }, { totalPoints: 'desc' }],
    })

    // Group by gameweek number
    const history: Record<
      number,
      {
        gameweekId: string
        gameweekNumber: number
        scores: {
          teamId: string
          teamName: string
          manager: string | null
          totalPoints: number
          chipUsed: string | null
        }[]
      }
    > = {}

    for (const s of scores) {
      const gwNum = s.gameweek.number
      if (!history[gwNum]) {
        history[gwNum] = {
          gameweekId: s.gameweek.id,
          gameweekNumber: gwNum,
          scores: [],
        }
      }
      history[gwNum].scores.push({
        teamId: s.team.id,
        teamName: s.team.name,
        manager: s.team.user.name,
        totalPoints: s.totalPoints,
        chipUsed: s.chipUsed,
      })
    }

    // Check for active GW with live scores (not yet aggregated)
    const activeGw = await prisma.gameweek.findFirst({
      where: { status: 'ACTIVE', aggregationStatus: { not: 'DONE' } },
      orderBy: { number: 'desc' },
    })

    if (activeGw && !history[activeGw.number]) {
      // Compute live scores for the active GW
      try {
        const liveResult = await computeLeagueLiveScores(prisma, activeGw.id, leagueId)

        // Get team names
        const teams = await prisma.team.findMany({
          where: { leagueId },
          select: { id: true, name: true, user: { select: { name: true } } },
        })
        const teamMap = new Map(teams.map(t => [t.id, t]))

        const liveScores: typeof history[number]['scores'] = []
        for (const [teamId, score] of liveResult.teamScores) {
          const team = teamMap.get(teamId)
          if (team) {
            liveScores.push({
              teamId,
              teamName: team.name,
              manager: team.user.name,
              totalPoints: score.liveGwPoints,
              chipUsed: score.chipType,
            })
          }
        }

        if (liveScores.length > 0) {
          history[activeGw.number] = {
            gameweekId: activeGw.id,
            gameweekNumber: activeGw.number,
            scores: liveScores,
          }
        }
      } catch {
        // Live scoring failed — skip, show stored data only
      }
    }

    return Response.json({
      history: Object.values(history),
      leagueId,
    })
  } catch (error) {
    console.error('GET /api/leaderboard/[leagueId]/history error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
