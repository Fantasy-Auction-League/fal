import { NextResponse } from 'next/server'
import { syncMatchStatuses } from '@/lib/sportmonks/match-sync'
import { runScoringPipeline, scoreLiveMatches } from '@/lib/scoring/pipeline'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // 1. Sync match statuses (SCHEDULED → LIVE_SCORING or COMPLETED)
    const syncResult = await syncMatchStatuses()

    // 2. Score live in-progress matches (upsert PlayerPerformance with latest stats)
    const liveResult = await scoreLiveMatches()

    // 3. Run normal pipeline (COMPLETED → SCORING → SCORED, then GW aggregation)
    const pipelineResult = await runScoringPipeline()

    return NextResponse.json({
      ...pipelineResult,
      matchesTransitioned: syncResult.transitioned,
      liveMatchesScored: liveResult.matchesScored,
      liveMatchesFailed: liveResult.matchesFailed,
      lineupsCreated: liveResult.lineupsCreated,
      liveErrors: liveResult.errors,
    })
  } catch (error) {
    console.error('Scoring cron error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    )
  }
}
