# Phase 2: Match Status Sync + Pipeline Fix

**Codebase verified:** 2026-03-27

---

## Acceptance Criteria Coverage

This phase implements:

### app-admin-dashboard.AC2: Match Status Sync
- **app-admin-dashboard.AC2.1 Success:** SCHEDULED matches that have finished on SportMonks are transitioned to COMPLETED before scoring runs
- **app-admin-dashboard.AC2.2 Success:** Cancelled matches on SportMonks are transitioned to CANCELLED in local DB
- **app-admin-dashboard.AC2.3 Success:** Import Scores and cron both sync statuses before running the scoring pipeline

### app-admin-dashboard.AC3: Pipeline Match Limit
- **app-admin-dashboard.AC3.1 Success:** Pipeline processes up to 6 matches per run (increased from 4)

---

<!-- START_SUBCOMPONENT_A (tasks 1-2) -->

<!-- START_TASK_1 -->
### Task 1: Create `lib/sportmonks/match-sync.ts`

**Verifies:** app-admin-dashboard.AC2.1, app-admin-dashboard.AC2.2

**Files:**
- Create: `lib/sportmonks/match-sync.ts`

**Implementation:**

```typescript
import { prisma } from '@/lib/db'
import { sportmonks } from './client'
import type { SportMonksFixture } from './types'

export interface MatchSyncResult {
  checked: number
  transitioned: number
  changes: { apiMatchId: number; oldStatus: string; newStatus: string; teams: string }[]
}

export async function syncMatchStatuses(seasonId: number = 1795): Promise<MatchSyncResult> {
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
```

**Testing:**
Tests must verify:
- app-admin-dashboard.AC2.1: A SCHEDULED match with SportMonks status "Finished" transitions to COMPLETED
- app-admin-dashboard.AC2.2: A SCHEDULED match with SportMonks status "Cancl." transitions to CANCELLED
- A SCHEDULED match still "NS" on SportMonks remains SCHEDULED

Follow project integration test patterns (direct Prisma, namespaced test data, FK-ordered cleanup).

**Verification:**
Run: `npx tsc --noEmit`
Expected: No type errors

**Commit:** `feat: add syncMatchStatuses to transition SCHEDULED matches from SportMonks`
<!-- END_TASK_1 -->

<!-- START_TASK_2 -->
### Task 2: Update import and cron routes to sync statuses first

**Verifies:** app-admin-dashboard.AC2.3

**Files:**
- Modify: `app/api/scoring/import/route.ts`
- Modify: `app/api/scoring/cron/route.ts`

**Implementation:**

In `app/api/scoring/import/route.ts`, after auth check and before `runScoringPipeline()`:

```typescript
import { syncMatchStatuses } from '@/lib/sportmonks/match-sync'

// Inside try block, before runScoringPipeline():
const syncResult = await syncMatchStatuses()
const result = await runScoringPipeline()

return NextResponse.json({
  ...result,
  matchesTransitioned: syncResult.transitioned,
  statusChanges: syncResult.changes,
})
```

In `app/api/scoring/cron/route.ts`:
1. Add import at top of file: `import { syncMatchStatuses } from '@/lib/sportmonks/match-sync'`
2. Inside the `try` block (line 11), before the existing `const result = await runScoringPipeline()`, add `const syncResult = await syncMatchStatuses()`
3. Update the return to include sync results:

```typescript
import { syncMatchStatuses } from '@/lib/sportmonks/match-sync'

// Line 11 (inside try block), BEFORE runScoringPipeline():
const syncResult = await syncMatchStatuses()
const result = await runScoringPipeline()

return NextResponse.json({
  ...result,
  matchesTransitioned: syncResult.transitioned,
})
```

**Verification:**
Run: `npx tsc --noEmit`
Expected: No type errors

**Commit:** `feat: sync match statuses from SportMonks before scoring pipeline`
<!-- END_TASK_2 -->

<!-- END_SUBCOMPONENT_A -->

---

<!-- START_TASK_3 -->
### Task 3: Cap pipeline match limit at 6

**Verifies:** app-admin-dashboard.AC3.1

**Files:**
- Modify: `lib/scoring/pipeline.ts:40`

**Implementation:**

In the raw SQL query at line 40, change `LIMIT 4` to `LIMIT 6`:

```sql
-- Before:
LIMIT 4

-- After:
LIMIT 6
```

This increases the number of matches processed per pipeline run from 4 to 6. Math: 6 matches × ~5s each + 10s aggregation = ~40s, well within Vercel's 60s timeout.

**Verification:**
Run: `npx tsc --noEmit`
Expected: No type errors

Run: `npm run test:unit`
Expected: All existing tests pass

**Commit:** `feat: increase pipeline match limit from 4 to 6`
<!-- END_TASK_3 -->
