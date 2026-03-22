import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

// GET /api/teams/[teamId] — Team detail
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { teamId } = await params

    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
        league: {
          select: {
            id: true,
            name: true,
            inviteCode: true,
            adminUserId: true,
            minSquadSize: true,
            maxSquadSize: true,
            seasonStarted: true,
          },
        },
        _count: { select: { teamPlayers: true } },
      },
    })

    if (!team) {
      return Response.json({ error: 'Team not found' }, { status: 404 })
    }

    // Check membership: user must be the owner or a member of the same league
    const isMember = await prisma.team.findFirst({
      where: { leagueId: team.leagueId, userId: session.user.id },
      select: { id: true },
    })

    if (!isMember) {
      return Response.json({ error: 'Not a member of this league' }, { status: 403 })
    }

    return Response.json(team)
  } catch (error) {
    console.error('GET /api/teams/[teamId] error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
