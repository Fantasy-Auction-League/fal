# Live Mid-Match Scoring — Implementation Plan

**Goal:** Show fantasy points updating every 5 minutes during live IPL matches, with final scoring after match ends and GW aggregation when all matches complete.

**Architecture:** GitHub Actions triggers the existing `/api/scoring/cron` endpoint every 5 min during match windows. The cron endpoint is extended to detect in-progress matches (via SportMonks status), score them using the existing `scoreMatch()` function (which upserts PlayerPerformance), and leave them in `LIVE_SCORING` state for re-scoring on subsequent runs. When a match finishes, it transitions to `COMPLETED` and the existing pipeline finalizes it.

**Tech Stack:** GitHub Actions, existing SportMonks integration, existing scoring pipeline

**Scope:** 3 phases

**Codebase verified:** 2026-03-29

---

## Phase 1: Schema + Match Sync (Infrastructure + Functionality)

### Acceptance Criteria

- **AC1.1:** `LIVE_SCORING` exists in `ScoringStatus` enum
- **AC1.2:** `syncMatchStatuses()` transitions `SCHEDULED` matches to `LIVE_SCORING` when SportMonks returns live statuses (`1st Innings`, `2nd Innings`, `Innings Break`, etc.)
- **AC1.3:** `syncMatchStatuses()` transitions `LIVE_SCORING` matches to `COMPLETED` when SportMonks returns `Finished`
- **AC1.4:** `syncMatchStatuses()` transitions `LIVE_SCORING` matches to `CANCELLED` when SportMonks returns `Cancl.` or `Aban.`

---

<!-- START_TASK_1 -->
### Task 1: Add LIVE_SCORING to ScoringStatus enum

**Files:**
- Modify: `prisma/schema.prisma` (line 38-45)

**Step 1: Update the enum**

Add `LIVE_SCORING` between `SCHEDULED` and `COMPLETED`:

```prisma
enum ScoringStatus {
  SCHEDULED
  LIVE_SCORING
  COMPLETED
  SCORING
  SCORED
  ERROR
  CANCELLED
}
```

**Step 2: Generate Prisma client and push schema**

```bash
npx prisma generate
npx prisma db push
```

Expected: Both commands succeed without errors.

**Step 3: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: add LIVE_SCORING to ScoringStatus enum"
```

<!-- END_TASK_1 -->

<!-- START_TASK_2 -->
### Task 2: Update syncMatchStatuses() to detect live matches and handle LIVE_SCORING → COMPLETED

**Files:**
- Modify: `lib/sportmonks/match-sync.ts`

**Implementation:**

The current function only queries `SCHEDULED` matches (line 13-16). It needs to:

1. **Also query `LIVE_SCORING` matches** — check if they've finished or been cancelled
2. **Detect live statuses** — when a `SCHEDULED` match has SportMonks status like `1st Innings`, `2nd Innings`, `Innings Break`, transition to `LIVE_SCORING`

**Live statuses to detect** (from SportMonks docs):
- `1st Innings`, `2nd Innings`, `3rd Innings`, `4th Innings`
- `Innings Break`, `Tea Break`, `Lunch`, `Dinner`
- `Delayed`, `Int.` (Interrupted)

**Changes to syncMatchStatuses():**

1. Change the query from `where: { scoringStatus: 'SCHEDULED' }` to `where: { scoringStatus: { in: ['SCHEDULED', 'LIVE_SCORING'] } }`

2. Update the status mapping logic (currently lines 43-47):

```typescript
// Define live statuses
const LIVE_STATUSES = new Set([
  '1st Innings', '2nd Innings', '3rd Innings', '4th Innings',
  'Innings Break', 'Tea Break', 'Lunch', 'Dinner',
  'Delayed', 'Int.',
])

// For each match:
if (fixture.status === 'Finished') {
  newScoringStatus = 'COMPLETED'
} else if (fixture.status === 'Cancl.' || fixture.status === 'Aban.') {
  newScoringStatus = 'CANCELLED'
} else if (LIVE_STATUSES.has(fixture.status) && match.scoringStatus === 'SCHEDULED') {
  newScoringStatus = 'LIVE_SCORING'
}
// If match is already LIVE_SCORING and still live → no change needed (skip update)
```

3. Update the select to include `scoringStatus` so we know the current state:
```typescript
select: { id: true, apiMatchId: true, localTeamName: true, visitorTeamName: true, scoringStatus: true }
```

**Verification:**

Run existing tests:
```bash
npx vitest run tests/integration/match-sync.test.ts
```

**Commit:** `feat: detect live matches and LIVE_SCORING → COMPLETED transition in syncMatchStatuses`

<!-- END_TASK_2 -->

---

## Phase 2: Live Scoring Function + Cron Update (Functionality)

### Acceptance Criteria

- **AC2.1:** `scoreLiveMatches()` queries all `LIVE_SCORING` matches and calls `scoreMatch()` for each
- **AC2.2:** `scoreLiveMatches()` does NOT change match status (stays `LIVE_SCORING`)
- **AC2.3:** PlayerPerformance records are upserted with latest stats on each run
- **AC2.4:** Cron endpoint calls `scoreLiveMatches()` between sync and pipeline
- **AC2.5:** Errors in one live match don't block scoring of other live matches

---

<!-- START_TASK_3 -->
### Task 3: Create scoreLiveMatches() function

**Files:**
- Modify: `lib/scoring/pipeline.ts`

**Implementation:**

Add a new exported function `scoreLiveMatches()`. It needs to:

1. Query all matches with `scoringStatus = 'LIVE_SCORING'`
2. For each match, call the existing `scoreMatch()` function
3. After `scoreMatch()` runs, it will have marked the match as `SCORED` (line 351-354). We need to **reset it back to `LIVE_SCORING`** so it gets re-scored on the next cron run.
4. Catch errors per-match so one failure doesn't block others.

```typescript
export async function scoreLiveMatches(): Promise<{
  matchesScored: number
  matchesFailed: number
  errors: string[]
}> {
  const result = { matchesScored: 0, matchesFailed: 0, errors: [] as string[] }

  const liveMatches = await prisma.match.findMany({
    where: { scoringStatus: 'LIVE_SCORING' },
    select: { id: true, apiMatchId: true, gameweekId: true, superOver: true },
  })

  if (liveMatches.length === 0) return result

  for (const match of liveMatches) {
    try {
      await scoreMatch(match)
      // scoreMatch() marks it as SCORED — reset back to LIVE_SCORING
      // so it gets re-scored on next cron run with updated stats
      await prisma.match.update({
        where: { id: match.id },
        data: { scoringStatus: 'LIVE_SCORING' },
      })
      result.matchesScored++
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      result.matchesFailed++
      result.errors.push(`Live match ${match.apiMatchId}: ${msg}`)
    }
  }

  return result
}
```

**Key design note:** We reuse `scoreMatch()` as-is, then reset the status. This avoids forking the scoring logic — any changes to point calculation automatically apply to live scoring too.

**Verification:**
```bash
npx tsc --noEmit
```

**Commit:** `feat: add scoreLiveMatches() for mid-match scoring`

<!-- END_TASK_3 -->

<!-- START_TASK_4 -->
### Task 4: Update cron endpoint to call scoreLiveMatches()

**Files:**
- Modify: `app/api/scoring/cron/route.ts`

**Implementation:**

Add `scoreLiveMatches()` call between `syncMatchStatuses()` and `runScoringPipeline()`:

```typescript
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
```

**Verification:**
```bash
npx tsc --noEmit
```

**Commit:** `feat: cron endpoint calls scoreLiveMatches() for mid-match updates`

<!-- END_TASK_4 -->

---

## Phase 3: GitHub Actions Workflow (Infrastructure)

### Acceptance Criteria

- **AC3.1:** GitHub Action triggers every 5 minutes between 10:00 - 18:59 UTC during March-May
- **AC3.2:** Action calls `/api/scoring/cron` with valid `CRON_SECRET` bearer token
- **AC3.3:** Action logs response for debugging
- **AC3.4:** Existing Vercel daily cron unchanged as fallback

---

<!-- START_TASK_5 -->
### Task 5: Add CRON_SECRET and PROD_URL to GitHub repository secrets

**Step 1: Add secrets via GitHub CLI**

```bash
# Add the CRON_SECRET (must match the value in Vercel environment variables)
/opt/homebrew/bin/gh secret set CRON_SECRET
# When prompted, paste the CRON_SECRET value from Vercel dashboard

# Add the production URL
/opt/homebrew/bin/gh secret set PROD_URL <<< "https://fal-roan.vercel.app"
```

**Step 2: Verify**

```bash
/opt/homebrew/bin/gh secret list
```

Expected: `CRON_SECRET` and `PROD_URL` listed.

<!-- END_TASK_5 -->

<!-- START_TASK_6 -->
### Task 6: Create GitHub Actions workflow file

**Files:**
- Create: `.github/workflows/scoring-cron.yml`

**Content:**

```yaml
name: Scoring Cron (IPL Match Window)

on:
  schedule:
    # Every 5 min, hours 10-18 UTC (3:30 PM - 12:00 AM IST), March-May
    - cron: '*/5 10-18 * 3-5 *'
  workflow_dispatch: # Manual trigger for testing

jobs:
  score:
    runs-on: ubuntu-latest
    timeout-minutes: 2
    steps:
      - name: Call scoring endpoint
        env:
          CRON_SECRET: ${{ secrets.CRON_SECRET }}
          PROD_URL: ${{ secrets.PROD_URL }}
        run: |
          response=$(curl -s -w "\n%{http_code}" \
            -H "Authorization: Bearer $CRON_SECRET" \
            "$PROD_URL/api/scoring/cron")

          http_code=$(echo "$response" | tail -1)
          body=$(echo "$response" | head -n -1)

          echo "Status: $http_code"
          echo "Response: $body"

          if [ "$http_code" != "200" ]; then
            echo "::error::Scoring cron failed with status $http_code"
            exit 1
          fi
```

**Step 2: Verify YAML**

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/scoring-cron.yml')); print('Valid')"
```

**Step 3: Commit**

```bash
git add .github/workflows/scoring-cron.yml
git commit -m "feat: add GitHub Actions scoring cron for IPL match windows"
```

<!-- END_TASK_6 -->

<!-- START_TASK_7 -->
### Task 7: Push and test

**Step 1: Push to main**

```bash
git push origin main
```

**Step 2: Trigger manual run**

```bash
/opt/homebrew/bin/gh workflow run "Scoring Cron (IPL Match Window)"
/opt/homebrew/bin/gh run watch
```

Expected: Job succeeds with status 200.

**Step 3: Verify scheduled runs next day**

```bash
/opt/homebrew/bin/gh run list --workflow="Scoring Cron (IPL Match Window)" --limit=5
```

Expected: Multiple runs during 10:00-18:59 UTC.

<!-- END_TASK_7 -->

---

## Budget

| Metric | Value |
|--------|-------|
| GitHub Actions runs/day | ~108 (18/hr × 6 hrs) |
| Runtime per run | ~10 seconds |
| Monthly usage | ~540 min (within 2,000 free) |
| SportMonks calls per run | 1-2 (one per live match) |
| SportMonks monthly calls | ~6,500 (well within 3,000/hr limit) |

## End-to-end flow summary

```
Every 5 min during match window:
  GitHub Action → /api/scoring/cron
    1. syncMatchStatuses()
       SCHEDULED + "1st Innings" → LIVE_SCORING
       LIVE_SCORING + "Finished" → COMPLETED
    2. scoreLiveMatches()
       LIVE_SCORING → scoreMatch() → upsert PlayerPerformance → reset to LIVE_SCORING
    3. runScoringPipeline()
       COMPLETED → SCORING → scoreMatch() → SCORED
       All GW matches SCORED? → aggregateGameweek()

Frontend (no changes):
  computeLiveTeamScore() reads PlayerPerformance → shows live points
  Leaderboard reads live scores → shows live standings
```
