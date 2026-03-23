import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

function generateInviteCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let code = 'FAL-'
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

// POST /api/leagues — Create league
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { name } = body

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return Response.json({ error: 'League name is required' }, { status: 400 })
    }

    // Generate unique invite code
    let inviteCode = generateInviteCode()
    let exists = await prisma.league.findUnique({ where: { inviteCode } })
    while (exists) {
      inviteCode = generateInviteCode()
      exists = await prisma.league.findUnique({ where: { inviteCode } })
    }

    const league = await prisma.league.create({
      data: {
        name: name.trim(),
        inviteCode,
        adminUserId: session.user.id,
        teams: {
          create: {
            name: `${session.user.name ?? 'Manager'}'s Team`,
            userId: session.user.id,
          },
        },
      },
      include: { teams: true },
    })

    return Response.json(league, { status: 201 })
  } catch (error) {
    console.error('POST /api/leagues error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// GET /api/leagues — List user's leagues
export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const leagues = await prisma.league.findMany({
      where: {
        OR: [
          { teams: { some: { userId: session.user.id } } },
          { adminUserId: session.user.id },
        ],
      },
      include: {
        _count: { select: { teams: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    return Response.json(leagues)
  } catch (error) {
    console.error('GET /api/leagues error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
