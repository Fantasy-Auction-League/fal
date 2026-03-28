import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { isGameweekLocked } from '@/lib/lineup/lock'

type ChipType = 'POWER_PLAY_BAT' | 'BOWLING_BOOST'
const VALID_CHIPS: ChipType[] = ['POWER_PLAY_BAT', 'BOWLING_BOOST']

// GET /api/teams/[teamId]/lineups/[gameweekId]/chip — Fetch chip usage for this team
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ teamId: string; gameweekId: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { teamId } = await params

    // Verify team exists and user has access
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      select: { id: true, leagueId: true, userId: true },
    })
    if (!team) return Response.json({ error: 'Team not found' }, { status: 404 })

    // Check league membership
    const isMember = await prisma.team.findFirst({
      where: { leagueId: team.leagueId, userId: session.user.id },
      select: { id: true },
    })
    if (!isMember) return Response.json({ error: 'Not a league member' }, { status: 403 })

    // Fetch all chip usages for this team
    const chipUsages = await prisma.chipUsage.findMany({
      where: { teamId },
    })

    // Enrich with gameweek numbers
    const gameweekIds = [...new Set(chipUsages.map(c => c.gameweekId))]
    const gameweeks = await prisma.gameweek.findMany({
      where: { id: { in: gameweekIds } },
      select: { id: true, number: true },
    })
    const gwMap = Object.fromEntries(gameweeks.map(g => [g.id, g.number]))

    const enriched = chipUsages.map(c => ({
      ...c,
      gameweekNumber: gwMap[c.gameweekId] ?? null,
    }))

    return Response.json({ chipUsages: enriched })
  } catch (error) {
    console.error('GET /api/teams/[teamId]/lineups/[gameweekId]/chip error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

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

    // Check if a different chip is already active for this gameweek
    const pendingChipThisGw = await prisma.chipUsage.findFirst({
      where: { teamId, gameweekId, status: 'PENDING' },
    })
    if (pendingChipThisGw) {
      return Response.json(
        { error: `Already have ${pendingChipThisGw.chipType} active for this gameweek. Deactivate it first.` },
        { status: 409 }
      )
    }

    // Create chip usage
    const chipUsage = await prisma.chipUsage.create({
      data: { teamId, chipType, gameweekId, status: 'PENDING' },
    })

    return Response.json({ chipUsage })
  } catch (error) {
    if (
      error instanceof (await import('@prisma/client')).Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return Response.json(
        { error: 'Another chip is already active for this gameweek' },
        { status: 409 }
      )
    }
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
