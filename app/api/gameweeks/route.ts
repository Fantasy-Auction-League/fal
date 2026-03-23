import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  const gameweeks = await prisma.gameweek.findMany({
    orderBy: { number: 'asc' },
    include: { _count: { select: { matches: true } } },
  })

  return NextResponse.json(gameweeks)
}
