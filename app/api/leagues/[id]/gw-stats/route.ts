import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: leagueId } = await params
  const gwNumber = request.nextUrl.searchParams.get('gw')

  if (!gwNumber) {
    return NextResponse.json({ error: 'gw param required' }, { status: 400 })
  }

  const gwNum = parseInt(gwNumber)
  if (isNaN(gwNum)) {
    return NextResponse.json({ error: 'Invalid gw param' }, { status: 400 })
  }

  const gw = await prisma.gameweek.findUnique({
    where: { number: gwNum },
    select: { id: true },
  })

  if (!gw) {
    return NextResponse.json({ error: 'Gameweek not found' }, { status: 404 })
  }

  const teams = await prisma.team.findMany({
    where: { leagueId },
    select: { id: true, name: true, userId: true },
  })

  const teamIds = teams.map(t => t.id)

  const scores = await prisma.gameweekScore.findMany({
    where: {
      gameweekId: gw.id,
      teamId: { in: teamIds },
    },
    select: { teamId: true, totalPoints: true },
  })

  if (scores.length === 0) {
    return NextResponse.json({ average: 0, highest: 0, highestTeamId: null })
  }

  const total = scores.reduce((sum, s) => sum + s.totalPoints, 0)
  const average = Math.round(total / scores.length)
  const best = scores.reduce((b, s) => s.totalPoints > b.totalPoints ? s : b, scores[0])

  return NextResponse.json({
    average,
    highest: best.totalPoints,
    highestTeamId: best.teamId,
  })
}
