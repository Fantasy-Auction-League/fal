import { NextResponse } from 'next/server'
import { syncPlayerTeams } from '@/lib/sync-players'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await syncPlayerTeams({ apply: true })
    return NextResponse.json({
      teamChanges: result.teamChanges.length,
      newPlayers: result.newPlayers.length,
      roleChanges: result.roleChanges.length,
      updatedCount: result.updatedCount,
      createdCount: result.createdCount,
    })
  } catch (error) {
    console.error('Sync players cron error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    )
  }
}
