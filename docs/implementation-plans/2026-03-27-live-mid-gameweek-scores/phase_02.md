# Live Mid-Gameweek Scores — Phase 2: Scores API Extension

**Goal:** Modify the existing scores API to return live running totals when no GameweekScore exists, and finalized scores when it does, with a unified response schema.

**Architecture:** Check for `GameweekScore` first. If it exists → return FINAL mode (stored data). If not → call `computeLiveTeamScore()` from `lib/scoring/live.ts` (Phase 1) for LIVE mode. Same response shape either way, differentiated by `status` field. Add cache headers for Vercel edge CDN.

**Tech Stack:** TypeScript, Next.js API Routes, Prisma, Vitest

**Scope:** 4 phases from original design (phase 2 of 4)

**Codebase verified:** 2026-03-27

---

## Acceptance Criteria Coverage

This phase implements and tests:

### live-mid-gameweek-scores.AC5: LIVE status returned when no GameweekScore
- **live-mid-gameweek-scores.AC5.1 Success:** When no GameweekScore record exists for the team+gameweek, API returns `status: 'LIVE'` with computed running total from `computeLiveTeamScore()`
- **live-mid-gameweek-scores.AC5.2 Edge:** When GW has 0 scored matches, API returns `status: 'LIVE'` with `totalPoints: 0`, `matchesScored: 0`
- **live-mid-gameweek-scores.AC5.3 Edge:** When team has no lineup for the GW, API returns appropriate error/empty response

### live-mid-gameweek-scores.AC6: FINAL status with stored data
- **live-mid-gameweek-scores.AC6.1 Success:** When GameweekScore record exists, API returns `status: 'FINAL'` with stored `totalPoints` and PlayerScore breakdown

### live-mid-gameweek-scores.AC7: Per-player breakdown with chip info
- **live-mid-gameweek-scores.AC7.1 Success:** Response includes per-player `basePoints`, `chipBonus`, `multipliedPoints`, `isCaptain`, `isVC`, `slotType`
- **live-mid-gameweek-scores.AC7.2 Success:** Active chip type returned in `chipActive` field, total chip bonus in `chipBonusPoints`

### live-mid-gameweek-scores.AC8: Match progress tracking
- **live-mid-gameweek-scores.AC8.1 Success:** Response includes `matchesScored` (scored matches) and `matchesTotal` (all matches in GW)

### live-mid-gameweek-scores.AC9: Cache headers
- **live-mid-gameweek-scores.AC9.1 Success:** Response includes `Cache-Control: s-maxage=60, stale-while-revalidate=300` for LIVE mode
- **live-mid-gameweek-scores.AC9.2 Success:** FINAL mode responses also include cache headers (longer TTL acceptable since data is static)

---

<!-- START_TASK_1 -->
### Task 1: Modify scores API route for LIVE/FINAL modes

**Verifies:** live-mid-gameweek-scores.AC5.1, AC5.2, AC5.3, AC6.1, AC7.1, AC7.2, AC8.1, AC9.1, AC9.2

**Files:**
- Modify: `app/api/teams/[teamId]/scores/[gameweekId]/route.ts` (currently 83 lines, full rewrite of GET handler body)

**Implementation:**

Replace the current GET handler logic (lines 17-78) with the following flow:

1. **Keep existing auth/authorization checks** (lines 10-37) unchanged.

2. **Check for GameweekScore** (FINAL mode check):
   ```typescript
   const gameweekScore = await prisma.gameweekScore.findUnique({
     where: { teamId_gameweekId: { teamId, gameweekId } },
   })
   ```

3. **If GameweekScore exists → FINAL mode:**
   - Fetch `PlayerScore` records for this team's players in this gameweek
   - Fetch lineup to get slot info (captain/VC/slotType)
   - Fetch match count for the gameweek
   - Build per-player breakdown from stored PlayerScore data, merging with lineup slot info
   - Return with `status: 'FINAL'`, `chipActive: null`, `chipUsed: gameweekScore.chipUsed`
   - Set `Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400` (static data)

4. **If no GameweekScore → LIVE mode:**
   - Import and call `computeLiveTeamScore(prisma, teamId, gameweekId)` from `@/lib/scoring/live`
   - If result is null (no lineup) → return `{ error: 'No lineup submitted' }` with 404
   - Return the live result directly (it already matches the response schema)
   - Set `Cache-Control: public, s-maxage=60, stale-while-revalidate=300`

5. **Response schema** (unified for both modes):
   ```typescript
   {
     gameweekId: string,
     gameweekNumber: number,          // human-readable GW number for UI display
     status: 'LIVE' | 'FINAL',
     matchesScored: number,
     matchesTotal: number,
     totalPoints: number,
     chipActive: 'POWER_PLAY_BAT' | 'BOWLING_BOOST' | null,
     chipBonusPoints: number,
     players: Array<{
       id: string,
       name: string,
       role: string,
       iplTeamCode: string | null,
       slotType: 'XI' | 'BENCH',
       basePoints: number,
       chipBonus: number,
       isCaptain: boolean,
       isVC: boolean,
       multipliedPoints: number,
       matchesPlayed: number,
     }>
   }
   ```

**Note on backward compatibility:** The current route returns `{ playerScores, performances, matches }`. This is a breaking change to the response shape. Check if any client code consumes this endpoint and update accordingly in Phase 4 (dashboard). The endpoint is internal-only (no external consumers).

**Verification:**
Run: `npx vitest run tests/integration/scoring-live-api.test.ts`
Expected: All tests pass

**Commit:** `feat: extend scores API with LIVE/FINAL modes and cache headers`

<!-- END_TASK_1 -->

<!-- START_TASK_2 -->
### Task 2: Integration tests for scores API LIVE/FINAL modes

**Verifies:** live-mid-gameweek-scores.AC5.1, AC5.2, AC5.3, AC6.1, AC7.1, AC7.2, AC8.1, AC9.1, AC9.2

**Files:**
- Create: `tests/integration/scoring-live-api.test.ts`

**Testing:**

Follow the pattern in `tests/integration/scoring-pipeline.test.ts` — use real `PrismaClient`, create test data with `@test.vitest` suffix, cleanup in beforeAll/afterAll.

Tests must set up a gameweek with matches, lineup with captain/chip, and player performances to verify each AC:

- **AC5.1:** Create a gameweek with 3 scored matches, team with lineup + performances, NO GameweekScore → call API → verify `status: 'LIVE'`, `totalPoints` matches computed live total, `matchesScored: 3`
- **AC5.2:** Create gameweek with 0 scored matches (all SCHEDULED) → call API → verify `status: 'LIVE'`, `totalPoints: 0`, `matchesScored: 0`
- **AC5.3:** Create gameweek but no lineup for team → call API → verify 404 or appropriate error
- **AC6.1:** Create a GameweekScore record for the team → call API → verify `status: 'FINAL'`, `totalPoints` matches stored value
- **AC7.1:** Verify LIVE response includes per-player fields: `basePoints`, `chipBonus`, `multipliedPoints`, `isCaptain`, `isVC`, `slotType`
- **AC7.2:** Create ChipUsage (POWER_PLAY_BAT) → call API → verify `chipActive: 'POWER_PLAY_BAT'` and `chipBonusPoints > 0`
- **AC8.1:** Create gameweek with 7 matches (4 scored) → verify `matchesScored: 4`, `matchesTotal: 7`
- **AC9.1:** Verify LIVE mode response includes `Cache-Control: public, s-maxage=60, stale-while-revalidate=300`
- **AC9.2:** Verify FINAL mode response includes longer cache TTL
- **Live-to-Final transition:** (1) Call API with no GameweekScore → verify `status: 'LIVE'`, (2) Create GameweekScore for the team, (3) Call API again → verify `status: 'FINAL'` with stored data

**Note:** These tests require the API route to be importable or call it via HTTP. Follow the existing integration test approach in this project — if tests directly call Prisma + the scoring functions rather than HTTP endpoints, test `computeLiveTeamScore()` directly here and trust the route handler for wiring.

**Verification:**
Run: `npx vitest run tests/integration/scoring-live-api.test.ts`
Expected: All tests pass

**Commit:** `test: add integration tests for live/final scores API`

<!-- END_TASK_2 -->
