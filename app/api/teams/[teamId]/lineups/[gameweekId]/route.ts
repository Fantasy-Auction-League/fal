import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { isGameweekLocked } from '@/lib/lineup/lock'
import { validateLineup } from '@/lib/lineup/validation'
import type { LineupSubmission } from '@/lib/lineup/validation'

// GET /api/teams/[teamId]/lineups/[gameweekId] — Fetch lineup (with carry-forward)
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ teamId: string; gameweekId: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { teamId, gameweekId } = await params

    // Verify team exists
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

    // Try to find existing lineup
    let lineup = await prisma.lineup.findUnique({
      where: { teamId_gameweekId: { teamId, gameweekId } },
      include: {
        slots: {
          include: {
            player: {
              select: { id: true, fullname: true, role: true, iplTeamCode: true, iplTeamName: true },
            },
          },
          orderBy: [{ slotType: 'asc' }, { benchPriority: 'asc' }],
        },
      },
    })

    // Carry-forward from previous gameweek if no lineup exists
    if (!lineup) {
      const gameweek = await prisma.gameweek.findUnique({ where: { id: gameweekId } })
      if (gameweek && gameweek.number > 1) {
        const prevGw = await prisma.gameweek.findFirst({
          where: { number: gameweek.number - 1 },
        })
        if (prevGw) {
          const prevLineup = await prisma.lineup.findUnique({
            where: { teamId_gameweekId: { teamId, gameweekId: prevGw.id } },
            include: { slots: true },
          })
          if (prevLineup) {
            lineup = await prisma.lineup.create({
              data: {
                teamId,
                gameweekId,
                slots: {
                  create: prevLineup.slots.map(s => ({
                    playerId: s.playerId,
                    slotType: s.slotType,
                    benchPriority: s.benchPriority,
                    role: s.role,
                  })),
                },
              },
              include: {
                slots: {
                  include: {
                    player: {
                      select: { id: true, fullname: true, role: true, iplTeamCode: true, iplTeamName: true },
                    },
                  },
                  orderBy: [{ slotType: 'asc' }, { benchPriority: 'asc' }],
                },
              },
            })
          }
        }
      }
    }

    if (!lineup) return Response.json({ error: 'No lineup found' }, { status: 404 })

    const isOwner = team.userId === session.user.id
    const gameweek = await prisma.gameweek.findUnique({ where: { id: gameweekId } })
    const locked = isGameweekLocked(gameweek?.lockTime ?? null)

    return Response.json({ lineup, isOwner, locked, canEdit: isOwner && !locked })
  } catch (error) {
    console.error('GET /api/teams/[teamId]/lineups/[gameweekId] error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT /api/teams/[teamId]/lineups/[gameweekId] — Submit/update lineup
export async function PUT(
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
      select: { id: true, leagueId: true, userId: true },
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

    // Parse and validate
    const body = (await req.json()) as LineupSubmission
    const validation = await validateLineup(teamId, team.leagueId, body)
    if (!validation.valid) {
      return Response.json({ error: 'Validation failed', errors: validation.errors }, { status: 400 })
    }

    // Upsert lineup: delete old slots, create new ones
    const lineup = await prisma.$transaction(async (tx) => {
      // Find or create lineup
      let existing = await tx.lineup.findUnique({
        where: { teamId_gameweekId: { teamId, gameweekId } },
      })

      if (existing) {
        // Delete old slots
        await tx.lineupSlot.deleteMany({ where: { lineupId: existing.id } })
      } else {
        existing = await tx.lineup.create({
          data: { teamId, gameweekId },
        })
      }

      // Create new slots
      await tx.lineupSlot.createMany({
        data: body.slots.map(s => ({
          lineupId: existing.id,
          playerId: s.playerId,
          slotType: s.slotType,
          benchPriority: s.benchPriority,
          role: s.role,
        })),
      })

      return tx.lineup.findUnique({
        where: { id: existing.id },
        include: {
          slots: {
            include: {
              player: {
                select: { id: true, fullname: true, role: true, iplTeamCode: true, iplTeamName: true },
              },
            },
            orderBy: [{ slotType: 'asc' }, { benchPriority: 'asc' }],
          },
        },
      })
    })

    return Response.json({ lineup })
  } catch (error) {
    console.error('PUT /api/teams/[teamId]/lineups/[gameweekId] error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
