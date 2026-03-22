import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

// POST /api/admin/season/start — League admin starts their season
export async function POST(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { leagueId } = body as { leagueId?: string }

    if (!leagueId) {
      return Response.json({ error: 'leagueId is required' }, { status: 400 })
    }

    const league = await prisma.league.findUnique({
      where: { id: leagueId },
      include: {
        teams: {
          include: {
            _count: { select: { teamPlayers: true } },
            user: { select: { name: true, email: true } },
          },
        },
      },
    })

    if (!league) {
      return Response.json({ error: 'League not found' }, { status: 404 })
    }

    // Verify caller is the league admin
    if (league.adminUserId !== session.user.id) {
      return Response.json({ error: 'Forbidden: only the league admin can start the season' }, { status: 403 })
    }

    // Check not already started
    if (league.seasonStarted) {
      return Response.json({ error: 'Season already started' }, { status: 409 })
    }

    // Validate: at least 2 teams
    if (league.teams.length < 2) {
      return Response.json(
        { error: 'League must have at least 2 teams (managers) to start the season', teamCount: league.teams.length },
        { status: 422 }
      )
    }

    // Validate: every team meets minSquadSize
    const incompleteTeams = league.teams
      .filter((t) => t._count.teamPlayers < league.minSquadSize)
      .map((t) => ({
        teamId: t.id,
        teamName: t.name,
        manager: t.user.name || t.user.email,
        playerCount: t._count.teamPlayers,
        required: league.minSquadSize,
      }))

    if (incompleteTeams.length > 0) {
      return Response.json(
        {
          error: 'Some teams have incomplete rosters',
          incompleteTeams,
        },
        { status: 422 }
      )
    }

    // All validations passed — start the season
    const updated = await prisma.league.update({
      where: { id: leagueId },
      data: { seasonStarted: true },
    })

    return Response.json({
      success: true,
      league: {
        id: updated.id,
        name: updated.name,
        seasonStarted: updated.seasonStarted,
        teamCount: league.teams.length,
      },
    })
  } catch (error) {
    console.error('POST /api/admin/season/start error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
