import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  const current = await prisma.gameweek.findFirst({
    where: { status: { in: ['UPCOMING', 'ACTIVE'] } },
    orderBy: { number: 'asc' },
    include: {
      matches: {
        orderBy: { startingAt: 'asc' },
        select: {
          id: true,
          localTeamName: true,
          visitorTeamName: true,
          startingAt: true,
          apiStatus: true,
          scoringStatus: true,
        },
      },
    },
  })

  if (!current) {
    return NextResponse.json({ error: 'No upcoming gameweek found' }, { status: 404 })
  }

  return NextResponse.json(current)
}
