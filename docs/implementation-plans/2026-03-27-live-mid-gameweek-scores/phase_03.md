# Live Mid-Gameweek Scores — Phase 3: Leaderboard Live Standings

**Goal:** Modify the leaderboard API to show live running totals during an active gameweek, including chip bonuses and rank change indicators, using a single efficient batch query instead of N per-team calls.

**Architecture:** Detect the active gameweek (status ACTIVE, aggregationStatus not DONE). If active, batch-compute live GW scores for all teams in the league using a single aggregation query, then merge with stored season totals. Rank changes computed by comparing sort order with/without live GW points. Locked lineup enforcement is inherent — we always read from the Lineup table which stores the locked lineup.

**Tech Stack:** TypeScript, Next.js API Routes, Prisma, Vitest

**Scope:** 4 phases from original design (phase 3 of 4)

**Codebase verified:** 2026-03-27

---

## Acceptance Criteria Coverage

This phase implements and tests:

### live-mid-gameweek-scores.AC10: Leaderboard live standings
- **live-mid-gameweek-scores.AC10.1 Success:** During an active GW, leaderboard shows live running totals (season total + live GW score) for each team
- **live-mid-gameweek-scores.AC10.2 Success:** Live GW scores include chip bonuses for teams with active chips
- **live-mid-gameweek-scores.AC10.3 Success:** When GW is finalized (GameweekScore exists for all teams), leaderboard shows stored totals as before
- **live-mid-gameweek-scores.AC10.4 Performance:** Batch computation uses aggregated queries, not N+1 per-team calls

### live-mid-gameweek-scores.AC11: Locked lineup enforcement
- **live-mid-gameweek-scores.AC11.1 Success:** Leaderboard scores use each team's locked GW lineup (the one set before deadline), not in-progress edits for future GWs

### live-mid-gameweek-scores.AC12: Rank change indicators
- **live-mid-gameweek-scores.AC12.1 Success:** Each team shows a rank change indicator (positive = moved up, negative = moved down, 0 = unchanged) comparing current live rank to previous rank (by stored season total only)

---

<!-- START_SUBCOMPONENT_A (tasks 1-2) -->

<!-- START_TASK_1 -->
### Task 1: Add batch live score computation to lib/scoring/live.ts

**Verifies:** live-mid-gameweek-scores.AC10.1, AC10.2, AC10.4, AC11.1

**Files:**
- Modify: `lib/scoring/live.ts` (add `computeLeagueLiveScores()` function)

**Implementation:**

Add a new exported function `computeLeagueLiveScores(prisma, gameweekId, leagueId)` to `lib/scoring/live.ts`. This computes live GW scores for ALL teams in a league in batch, avoiding N+1 queries.

**Query strategy (3 queries total):**

1. **Fetch all lineups** for the league's teams in this gameweek:
   ```typescript
   const lineups = await prisma.lineup.findMany({
     where: {
       gameweekId,
       team: { leagueId },
     },
     include: {
       slots: { include: { player: { select: { id: true, role: true } } } },
       team: { select: { id: true } },
     },
   })
   ```

2. **Fetch all player performances** for scored matches in this gameweek:
   ```typescript
   const scoredMatches = await prisma.match.findMany({
     where: { gameweekId, scoringStatus: 'SCORED' },
     select: { id: true },
   })
   const allMatches = await prisma.match.count({ where: { gameweekId } })
   const matchIds = scoredMatches.map(m => m.id)

   const performances = await prisma.playerPerformance.findMany({
     where: { matchId: { in: matchIds } },
     select: { playerId: true, fantasyPoints: true },
   })
   ```

3. **Fetch all chip usages** for these teams:
   ```typescript
   const teamIds = lineups.map(l => l.team.id)
   const chipUsages = await prisma.chipUsage.findMany({
     where: { teamId: { in: teamIds }, gameweekId, status: 'PENDING' },
   })
   const chipByTeam = new Map(chipUsages.map(c => [c.teamId, c.chipType]))
   ```

**Computation (in-memory, no more DB calls):**

1. Build global `basePointsMap` using `aggregateBasePoints()` from Phase 1
2. Build global `matchesPlayedMap` by counting distinct matchIds per player from performances
3. For each lineup (team):
   - Get the team's slots with player role info
   - Get the team's chip type from `chipByTeam`
   - **Delegate to `computeLivePlayerScores()`** from Phase 1 — pass the team's slots, the shared `basePointsMap`, `chipType`, and `matchesPlayedMap`. This ensures scoring logic (captain 2x, chip bonuses) is computed identically for single-team and batch paths, preventing logic drift.
   - Sum `multipliedPoints` for XI players to get the team's live GW total
4. Return `Map<teamId, { liveGwPoints: number, chipType: ChipType | null }>` plus `matchesScored` and `matchesTotal`

This function reuses both `aggregateBasePoints()` and `computeLivePlayerScores()` from Phase 1 — the DB queries are batched but scoring math is shared.

**Verification:**
Run: `npx vitest run tests/unit/scoring-live.test.ts`
Expected: All tests pass (add batch computation tests)

**Commit:** `feat: add batch live score computation for leaderboard`

<!-- END_TASK_1 -->

<!-- START_TASK_2 -->
### Task 2: Tests for batch live score computation

**Verifies:** live-mid-gameweek-scores.AC10.1, AC10.2, AC10.4, AC11.1

**Files:**
- Modify: `tests/integration/scoring-live-api.test.ts` (add tests for `computeLeagueLiveScores`)

**Testing:**

Add a new `describe('computeLeagueLiveScores')` block to the integration test file. These tests need real DB because the function queries Prisma.

Tests must verify:
- **AC10.1:** Create 3 teams in a league, each with lineup + player performances → call function → verify each team gets correct live GW total
- **AC10.2:** One team has POWER_PLAY_BAT chip → that team's total includes chip bonus, others don't
- **AC10.4:** Verify only 3 DB queries are made (can verify by checking the function returns correct data from a single call, rather than needing to call per-team)
- **AC11.1:** Lineups are read from the Lineup table for the current gameweekId — verify that a lineup for a different gameweekId is NOT used

**Verification:**
Run: `npx vitest run tests/integration/scoring-live-api.test.ts`
Expected: All tests pass

**Commit:** `test: add integration tests for batch live score computation`

<!-- END_TASK_2 -->

<!-- END_SUBCOMPONENT_A -->

<!-- START_SUBCOMPONENT_B (tasks 3-5) -->

<!-- START_TASK_3 -->
### Task 3: Modify leaderboard API for live standings

**Verifies:** live-mid-gameweek-scores.AC10.1, AC10.2, AC10.3, AC12.1

**Files:**
- Modify: `app/api/leaderboard/[leagueId]/route.ts` (currently 68 lines, significant modification to GET handler)

**Implementation:**

Modify the GET handler to detect an active gameweek and merge live scores:

1. **Keep existing auth/authorization checks** (lines 10-31) unchanged.

2. **After fetching teams** (existing query at lines 34-45), detect the active gameweek:
   ```typescript
   const activeGw = await prisma.gameweek.findFirst({
     where: { status: 'ACTIVE', aggregationStatus: { not: 'DONE' } },
   })
   ```

3. **If active GW exists → compute live standings:**
   - Call `computeLeagueLiveScores(prisma, activeGw.id, leagueId)` from `@/lib/scoring/live`
   - Merge live GW scores with stored `team.totalPoints` to get current total
   - Compute previous rank (sort teams by `team.totalPoints` only — stored season total)
   - Compute current rank (sort teams by `team.totalPoints + liveGwPoints`)
   - Rank change = previousRank - currentRank (positive = moved up)
   - Add to response: `gwStatus: 'LIVE'`, `activeGwNumber`, `matchesScored`, `matchesTotal`

4. **If no active GW → return existing behavior:**
   - Keep existing logic unchanged
   - Add `gwStatus: 'FINAL'` to response
   - `rankChange: 0` for all teams

5. **Updated standing object:**
   ```typescript
   {
     rank: number,              // current rank (with live GW)
     rankChange: number,        // positive = moved up, negative = down, 0 = unchanged
     teamId: string,
     teamName: string,
     manager: string,
     managerId: string,
     totalPoints: number,       // season total + live GW points
     storedTotalPoints: number, // season total without live GW (for reference)
     bestGwScore: number,
     liveGwPoints: number | null, // null if no active GW
     lastGwNumber: number | null,
     chipUsed: string | null,
     chipActive: string | null, // active chip for current live GW
   }
   ```

6. **Add cache headers:**
   - Live mode: `Cache-Control: public, s-maxage=60, stale-while-revalidate=300`
   - Final mode: `Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400`

**Verification:**
Run: `npx vitest run tests/integration/leaderboard-live.test.ts`
Expected: All tests pass

**Commit:** `feat: add live standings and rank change to leaderboard API`

<!-- END_TASK_3 -->

<!-- START_TASK_4 -->
### Task 4: Add leaderboard metadata to response

**Verifies:** live-mid-gameweek-scores.AC10.1

**Files:**
- Modify: `app/api/leaderboard/[leagueId]/route.ts` (add metadata alongside standings)

**Implementation:**

Add top-level metadata to the leaderboard response for the client to render status indicators:

```typescript
return Response.json({
  standings,
  leagueId,
  gwStatus: activeGw ? 'LIVE' : 'FINAL',
  activeGwNumber: activeGw?.number ?? null,
  matchesScored: liveResult?.matchesScored ?? null,
  matchesTotal: liveResult?.matchesTotal ?? null,
}, { headers })
```

This gives the dashboard client everything it needs to show "Live Standings" badge, match progress, and rank change arrows.

**Verification:**
Run: `npx vitest run tests/integration/leaderboard-live.test.ts`
Expected: All tests pass

**Commit:** `feat: add GW status metadata to leaderboard response`

<!-- END_TASK_4 -->

<!-- START_TASK_5 -->
### Task 5: Integration tests for live leaderboard

**Verifies:** live-mid-gameweek-scores.AC10.1, AC10.2, AC10.3, AC12.1

**Files:**
- Create: `tests/integration/leaderboard-live.test.ts`

**Testing:**

Follow the pattern in `tests/integration/scoring-pipeline.test.ts` — real PrismaClient, test data with `@test.vitest` suffix, cleanup.

Tests must verify:
- **AC10.1:** Create league with 3 teams, active GW with scored matches → verify standings include `liveGwPoints` and `totalPoints` = storedTotal + liveGw
- **AC10.2:** One team has chip → that team's `liveGwPoints` includes chip bonus
- **AC10.3:** Create league where active GW has been aggregated (aggregationStatus: 'DONE') → verify response uses stored totals, `gwStatus: 'FINAL'`
- **AC12.1:** Team A has higher stored total but lower live GW → Team B overtakes → verify `rankChange` is positive for B, negative for A

**Verification:**
Run: `npx vitest run tests/integration/leaderboard-live.test.ts`
Expected: All tests pass

**Commit:** `test: add integration tests for live leaderboard standings`

<!-- END_TASK_5 -->

<!-- END_SUBCOMPONENT_B -->
