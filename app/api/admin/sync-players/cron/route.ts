import { NextResponse } from 'next/server'
import { syncPlayerTeams } from '@/lib/sync-players'
import { syncFixtures } from '@/lib/sportmonks/fixture-sync'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Sync fixtures first (new matches/gameweeks from SportMonks)
    const fixtureResult = await syncFixtures()

    // Then sync player teams (team transfers)
    const playerResult = await syncPlayerTeams({ apply: true })

    return NextResponse.json({
      fixtures: {
        gameweeksCreated: fixtureResult.gameweeksCreated,
        matchesCreated: fixtureResult.matchesCreated,
        lockTimesUpdated: fixtureResult.lockTimesUpdated,
      },
      players: {
        teamChanges: playerResult.teamChanges.length,
        newPlayers: playerResult.newPlayers.length,
        roleChanges: playerResult.roleChanges.length,
        updatedCount: playerResult.updatedCount,
        createdCount: playerResult.createdCount,
      },
    })
  } catch (error) {
    console.error('Sync cron error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    )
  }
}
