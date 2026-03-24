import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

// POST /api/leagues/join — Join a league by invite code
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { inviteCode } = body

    if (!inviteCode || typeof inviteCode !== 'string') {
      return Response.json({ error: 'Invite code is required' }, { status: 400 })
    }

    const league = await prisma.league.findUnique({
      where: { inviteCode: inviteCode.trim().toUpperCase() },
      include: { teams: { select: { userId: true } } },
    })

    if (!league) {
      return Response.json({ error: 'Invalid invite code' }, { status: 404 })
    }

    const userId = session.user.id
    const alreadyMember = league.teams.some((t) => t.userId === userId)

    if (alreadyMember) {
      // Already in the league — just switch active league
      await prisma.user.update({
        where: { id: userId },
        data: { activeLeagueId: league.id },
      })
      return Response.json({ id: league.id, name: league.name, alreadyMember: true })
    }

    // Check if league is full
    if (league.teams.length >= league.maxManagers) {
      return Response.json({ error: 'League is full' }, { status: 409 })
    }

    // Create a team for the user and switch active league
    const displayName = session.user.name ?? session.user.email ?? 'Manager'
    await prisma.$transaction([
      prisma.team.create({
        data: {
          name: `${displayName}'s Team`,
          userId,
          leagueId: league.id,
        },
      }),
      prisma.user.update({
        where: { id: userId },
        data: { activeLeagueId: league.id },
      }),
    ])

    return Response.json({ id: league.id, name: league.name, alreadyMember: false }, { status: 201 })
  } catch (error) {
    console.error('POST /api/leagues/join error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
