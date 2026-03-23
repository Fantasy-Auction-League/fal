import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { isGameweekLocked } from '@/lib/lineup/lock'

type ChipType = 'POWER_PLAY_BAT' | 'BOWLING_BOOST'
const VALID_CHIPS: ChipType[] = ['POWER_PLAY_BAT', 'BOWLING_BOOST']

// POST /api/teams/[teamId]/lineups/[gameweekId]/chip — Activate a chip
export async function POST(
  req: Request,
  { params }: { params: Promise<{ teamId: string; gameweekId: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { teamId, gameweekId } = await params

    // Verify team ownership
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      select: { id: true, userId: true },
    })
    if (!team) return Response.json({ error: 'Team not found' }, { status: 404 })
    if (team.userId !== session.user.id) {
      return Response.json({ error: 'Not your team' }, { status: 403 })
    }

    // Check lock
    const gameweek = await prisma.gameweek.findUnique({ where: { id: gameweekId } })
    if (!gameweek) return Response.json({ error: 'Gameweek not found' }, { status: 404 })
    if (isGameweekLocked(gameweek.lockTime)) {
      return Response.json({ error: 'Gameweek is locked' }, { status: 423 })
    }

    // Parse body
    const body = await req.json()
    const chipType = body.chipType as ChipType
    if (!VALID_CHIPS.includes(chipType)) {
      return Response.json({ error: `Invalid chip type. Must be one of: ${VALID_CHIPS.join(', ')}` }, { status: 400 })
    }

    // Check if chip already used this season (any gameweek)
    const existingUsage = await prisma.chipUsage.findUnique({
      where: { teamId_chipType: { teamId, chipType } },
    })
    if (existingUsage) {
      return Response.json(
        { error: `${chipType} has already been used this season` },
        { status: 409 }
      )
    }

    // Create chip usage
    const chipUsage = await prisma.chipUsage.create({
      data: { teamId, chipType, gameweekId, status: 'PENDING' },
    })

    return Response.json({ chipUsage })
  } catch (error) {
    console.error('POST /api/teams/[teamId]/lineups/[gameweekId]/chip error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/teams/[teamId]/lineups/[gameweekId]/chip — Deactivate chip before lock
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ teamId: string; gameweekId: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { teamId, gameweekId } = await params

    // Verify team ownership
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      select: { id: true, userId: true },
    })
    if (!team) return Response.json({ error: 'Team not found' }, { status: 404 })
    if (team.userId !== session.user.id) {
      return Response.json({ error: 'Not your team' }, { status: 403 })
    }

    // Check lock
    const gameweek = await prisma.gameweek.findUnique({ where: { id: gameweekId } })
    if (!gameweek) return Response.json({ error: 'Gameweek not found' }, { status: 404 })
    if (isGameweekLocked(gameweek.lockTime)) {
      return Response.json({ error: 'Gameweek is locked' }, { status: 423 })
    }

    // Find pending chip for this gameweek
    const chipUsage = await prisma.chipUsage.findFirst({
      where: { teamId, gameweekId, status: 'PENDING' },
    })
    if (!chipUsage) {
      return Response.json({ error: 'No pending chip found for this gameweek' }, { status: 404 })
    }

    await prisma.chipUsage.delete({ where: { id: chipUsage.id } })

    return Response.json({ ok: true })
  } catch (error) {
    console.error('DELETE /api/teams/[teamId]/lineups/[gameweekId]/chip error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
