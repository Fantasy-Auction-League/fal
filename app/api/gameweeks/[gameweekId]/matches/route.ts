import { prisma } from '@/lib/db'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ gameweekId: string }> }
) {
  const { gameweekId } = await params

  const matches = await prisma.match.findMany({
    where: { gameweekId },
    orderBy: { startingAt: 'asc' },
    select: {
      id: true,
      localTeamName: true,
      visitorTeamName: true,
      startingAt: true,
      apiStatus: true,
      scoringStatus: true,
    },
  })

  return Response.json(matches)
}
