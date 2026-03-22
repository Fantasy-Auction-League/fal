import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

// POST /api/leagues/[id]/join — Join league via invite code
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const body = await req.json()
    const { inviteCode, teamName } = body

    if (!inviteCode || typeof inviteCode !== 'string') {
      return Response.json({ error: 'Invite code is required' }, { status: 400 })
    }

    if (!teamName || typeof teamName !== 'string' || teamName.trim().length === 0) {
      return Response.json({ error: 'Team name is required' }, { status: 400 })
    }

    const league = await prisma.league.findUnique({
      where: { id },
      include: { teams: true },
    })

    if (!league) {
      return Response.json({ error: 'League not found' }, { status: 404 })
    }

    if (league.inviteCode !== inviteCode) {
      return Response.json({ error: 'Invalid invite code' }, { status: 403 })
    }

    // Check if already a member
    const alreadyMember = league.teams.some((t) => t.userId === session.user!.id)
    if (alreadyMember) {
      return Response.json({ error: 'Already a member of this league' }, { status: 409 })
    }

    // Check if league is full
    if (league.teams.length >= league.maxManagers) {
      return Response.json({ error: 'League is full' }, { status: 409 })
    }

    const team = await prisma.team.create({
      data: {
        name: teamName.trim(),
        userId: session.user.id,
        leagueId: id,
      },
    })

    return Response.json(team, { status: 201 })
  } catch (error) {
    console.error('POST /api/leagues/[id]/join error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
