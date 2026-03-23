import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { importFixturesAndGameweeks } from '@/lib/sportmonks/fixtures'

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const seasonId = (body as { seasonId?: number }).seasonId ?? 1795

    const result = await importFixturesAndGameweeks(prisma, seasonId)

    return NextResponse.json(result)
  } catch (error) {
    console.error('Season init error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    )
  }
}
