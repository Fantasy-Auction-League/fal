import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

// DELETE /api/leagues/[id]/managers/[userId] — Remove manager (admin only)
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id, userId } = await params

    const league = await prisma.league.findUnique({ where: { id } })

    if (!league) {
      return Response.json({ error: 'League not found' }, { status: 404 })
    }

    if (league.adminUserId !== session.user.id) {
      return Response.json({ error: 'Only the league admin can remove managers' }, { status: 403 })
    }

    if (userId === session.user.id) {
      return Response.json({ error: 'Cannot remove yourself as admin' }, { status: 400 })
    }

    const team = await prisma.team.findFirst({
      where: { leagueId: id, userId },
    })

    if (!team) {
      return Response.json({ error: 'User does not have a team in this league' }, { status: 404 })
    }

    // Delete team (TeamPlayers cascade via onDelete: Cascade)
    await prisma.team.delete({ where: { id: team.id } })

    return Response.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/leagues/[id]/managers/[userId] error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
