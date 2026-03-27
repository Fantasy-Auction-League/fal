import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ matchId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!session.user.isAppAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { matchId } = await params

  try {
    const match = await prisma.match.findUnique({ where: { id: matchId } })
    if (!match) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 })
    }

    if (match.scoringStatus !== 'SCORED' && match.scoringStatus !== 'ERROR') {
      return NextResponse.json(
        { error: `Cannot recalculate match with status ${match.scoringStatus}` },
        { status: 400 }
      )
    }

    // Reset to COMPLETED so the pipeline picks it up on next run
    await prisma.match.update({
      where: { id: matchId },
      data: { scoringStatus: 'COMPLETED', scoringAttempts: 0 },
    })

    return NextResponse.json({ ok: true, matchId, status: 'COMPLETED' })
  } catch (error) {
    console.error('Recalculate error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    )
  }
}
