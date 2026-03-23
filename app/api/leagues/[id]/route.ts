import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

// GET /api/leagues/[id] — League detail
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const league = await prisma.league.findUnique({
      where: { id },
      include: {
        teams: {
          include: {
            user: { select: { id: true, name: true, email: true, image: true } },
          },
        },
        _count: { select: { teams: true } },
      },
    })

    if (!league) {
      return Response.json({ error: 'League not found' }, { status: 404 })
    }

    // Must be a member OR the league admin
    const isMember = league.teams.some((t) => t.userId === session.user!.id)
    const isAdmin = league.adminUserId === session.user!.id
    if (!isMember && !isAdmin) {
      return Response.json({ error: 'Not a member of this league' }, { status: 403 })
    }

    return Response.json(league)
  } catch (error) {
    console.error('GET /api/leagues/[id] error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
