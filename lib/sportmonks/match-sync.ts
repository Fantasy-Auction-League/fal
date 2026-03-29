import { prisma } from '@/lib/db'
import { sportmonks } from './client'
import type { SportMonksFixture } from './types'

export interface MatchSyncResult {
  checked: number
  transitioned: number
  changes: { apiMatchId: number; oldStatus: string; newStatus: string; teams: string }[]
}

// SportMonks statuses that indicate a match is in progress
const LIVE_STATUSES = new Set([
  '1st Innings', '2nd Innings', '3rd Innings', '4th Innings',
  'Innings Break', 'Tea Break', 'Lunch', 'Dinner',
  'Delayed', 'Int.',
])

export async function syncMatchStatuses(): Promise<MatchSyncResult> {
  // 1. Get all SCHEDULED and LIVE_SCORING matches from DB
  const matches = await prisma.match.findMany({
    where: { scoringStatus: { in: ['SCHEDULED', 'LIVE_SCORING'] } },
    select: { id: true, apiMatchId: true, localTeamName: true, visitorTeamName: true, scoringStatus: true },
  })

  if (matches.length === 0) {
    return { checked: 0, transitioned: 0, changes: [] }
  }

  // 2. Fetch each match's current status from SportMonks individually.
  // IPL has max ~10 active matches at any time,
  // so this is at most 10 API calls (well within 3,000/hour rate limit).
  const changes: MatchSyncResult['changes'] = []

  for (const match of matches) {
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
    let newScoringStatus: 'LIVE_SCORING' | 'COMPLETED' | 'CANCELLED' | null = null

    if (fixture.status === 'Finished') {
      newScoringStatus = 'COMPLETED'
    } else if (fixture.status === 'Cancl.' || fixture.status === 'Aban.') {
      newScoringStatus = 'CANCELLED'
    } else if (LIVE_STATUSES.has(fixture.status) && match.scoringStatus === 'SCHEDULED') {
      newScoringStatus = 'LIVE_SCORING'
    }
    // If match is already LIVE_SCORING and still live → no transition needed

    if (!newScoringStatus) continue
    // Skip if status hasn't changed (e.g. LIVE_SCORING match still live)
    if (newScoringStatus === match.scoringStatus) continue

    await prisma.match.update({
      where: { id: match.id },
      data: {
        scoringStatus: newScoringStatus,
        apiStatus: fixture.status,
        note: fixture.note ?? undefined,
        winnerTeamId: fixture.winner_team_id ?? undefined,
        superOver: fixture.super_over ?? undefined,
        // Reset scoring attempts when LIVE_SCORING → COMPLETED so final
        // scoring gets full 3 retries in runScoringPipeline
        ...(match.scoringStatus === 'LIVE_SCORING' && newScoringStatus === 'COMPLETED'
          ? { scoringAttempts: 0 }
          : {}),
      },
    })
    changes.push({
      apiMatchId: match.apiMatchId,
      oldStatus: match.scoringStatus,
      newStatus: newScoringStatus,
      teams: `${match.localTeamName || '?'} vs ${match.visitorTeamName || '?'}`,
    })
  }

  return { checked: matches.length, transitioned: changes.length, changes }
}
