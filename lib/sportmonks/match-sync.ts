import { prisma } from '@/lib/db'
import { sportmonks } from './client'
import type { SportMonksFixture } from './types'

export interface MatchSyncResult {
  checked: number
  transitioned: number
  changes: { apiMatchId: number; oldStatus: string; newStatus: string; teams: string }[]
}

export async function syncMatchStatuses(): Promise<MatchSyncResult> {
  // 1. Get all SCHEDULED matches from DB
  const scheduledMatches = await prisma.match.findMany({
    where: { scoringStatus: 'SCHEDULED' },
    select: { id: true, apiMatchId: true, localTeamName: true, visitorTeamName: true },
  })

  if (scheduledMatches.length === 0) {
    return { checked: 0, transitioned: 0, changes: [] }
  }

  // 2. Fetch each SCHEDULED match's current status from SportMonks individually.
  // This avoids pagination issues with season-wide filters and only queries
  // matches we actually care about. IPL has max ~10 SCHEDULED matches at any time,
  // so this is at most 10 API calls (well within 3,000/hour rate limit).
  const changes: MatchSyncResult['changes'] = []

  for (const match of scheduledMatches) {
    let fixture: SportMonksFixture
    try {
      fixture = await sportmonks.fetch<SportMonksFixture>(
        `/fixtures/${match.apiMatchId}`,
        { 'fields[fixtures]': 'id,status,winner_team_id,note,super_over' }
      )
    } catch (err) {
      // API error for this fixture — skip, will retry on next sync
      console.warn(`syncMatchStatuses: failed to fetch fixture ${match.apiMatchId}:`, err)
      continue
    }

    // Map SportMonks status to local scoringStatus
    let newScoringStatus: 'COMPLETED' | 'CANCELLED' | null = null
    if (fixture.status === 'Finished') {
      newScoringStatus = 'COMPLETED'
    } else if (fixture.status === 'Cancl.' || fixture.status === 'Aban.') {
      newScoringStatus = 'CANCELLED'
    }

    if (!newScoringStatus) continue // Still NS, in progress, delayed — skip

    await prisma.match.update({
      where: { id: match.id },
      data: {
        scoringStatus: newScoringStatus,
        apiStatus: fixture.status,
        note: fixture.note ?? undefined,
        winnerTeamId: fixture.winner_team_id ?? undefined,
        superOver: fixture.super_over ?? undefined,
      },
    })
    changes.push({
      apiMatchId: match.apiMatchId,
      oldStatus: 'SCHEDULED',
      newStatus: newScoringStatus,
      teams: `${match.localTeamName || '?'} vs ${match.visitorTeamName || '?'}`,
    })
  }

  return { checked: scheduledMatches.length, transitioned: changes.length, changes }
}
