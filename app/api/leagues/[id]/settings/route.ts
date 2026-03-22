import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

// PUT /api/leagues/[id]/settings — Update league settings (admin only)
export async function PUT(
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
    const { name, maxManagers, minSquadSize, maxSquadSize } = body

    const league = await prisma.league.findUnique({ where: { id } })

    if (!league) {
      return Response.json({ error: 'League not found' }, { status: 404 })
    }

    if (league.adminUserId !== session.user.id) {
      return Response.json({ error: 'Only the league admin can update settings' }, { status: 403 })
    }

    const data: Record<string, unknown> = {}
    if (name !== undefined && typeof name === 'string' && name.trim().length > 0) {
      data.name = name.trim()
    }
    if (maxManagers !== undefined && typeof maxManagers === 'number' && maxManagers >= 2) {
      data.maxManagers = maxManagers
    }
    if (minSquadSize !== undefined && typeof minSquadSize === 'number' && minSquadSize >= 1) {
      data.minSquadSize = minSquadSize
    }
    if (maxSquadSize !== undefined && typeof maxSquadSize === 'number' && maxSquadSize >= 1) {
      data.maxSquadSize = maxSquadSize
    }

    if (Object.keys(data).length === 0) {
      return Response.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const updated = await prisma.league.update({
      where: { id },
      data,
    })

    return Response.json(updated)
  } catch (error) {
    console.error('PUT /api/leagues/[id]/settings error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
