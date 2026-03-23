import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

// GET /api/teams/[teamId]/squad — Team squad list
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
      select: { id: true, leagueId: true, name: true },
    })

    if (!team) {
      return Response.json({ error: 'Team not found' }, { status: 404 })
    }

    // Check membership OR admin
    const league = await prisma.league.findUnique({
      where: { id: team.leagueId },
      select: { adminUserId: true },
    })
    const isAdmin = league?.adminUserId === session.user.id
    const isMember = await prisma.team.findFirst({
      where: { leagueId: team.leagueId, userId: session.user.id },
      select: { id: true },
    })

    if (!isMember && !isAdmin) {
      return Response.json({ error: 'Not a member of this league' }, { status: 403 })
    }

    const squad = await prisma.teamPlayer.findMany({
      where: { teamId },
      include: {
        player: {
          select: {
            id: true,
            fullname: true,
            role: true,
            iplTeamName: true,
            iplTeamCode: true,
            imageUrl: true,
          },
        },
      },
      orderBy: { player: { fullname: 'asc' } },
    })

    const players = squad.map((tp) => ({
      id: tp.player.id,
      fullname: tp.player.fullname,
      role: tp.player.role,
      iplTeamName: tp.player.iplTeamName,
      iplTeamCode: tp.player.iplTeamCode,
      imageUrl: tp.player.imageUrl,
      purchasePrice: tp.purchasePrice,
    }))

    return Response.json({ teamId, teamName: team.name, players })
  } catch (error) {
    console.error('GET /api/teams/[teamId]/squad error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
