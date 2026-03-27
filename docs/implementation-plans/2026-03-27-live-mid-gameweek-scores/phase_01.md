# Live Mid-Gameweek Scores — Phase 1: Shared Scoring Functions

**Goal:** Create `lib/scoring/live.ts` with pure scoring functions for live mid-gameweek score computation, reusing existing multiplier infrastructure.

**Architecture:** Extract performance aggregation from pipeline.ts into reusable functions. Keep DB-dependent orchestration separate from pure scoring logic so unit tests cover the core math. Live scoring differs from final aggregation: no bench subs, no VC promotion, but captain 2x and chip bonuses ARE applied.

**Tech Stack:** TypeScript, Prisma, Vitest

**Scope:** 4 phases from original design (phase 1 of 4)

**Codebase verified:** 2026-03-27

**Design discrepancies noted:**
1. The design plan mentions Triple Captain and Bench Boost chips, but the `ChipType` enum in the Prisma schema only contains `POWER_PLAY_BAT` and `BOWLING_BOOST`. Implementation covers only the two existing chips. Triple Captain / Bench Boost would require schema migration first.
2. The design plan states "Power Play Bat — all BAT/WK players in the XI get 2x." However, the existing `applyChipEffects()` in `lib/scoring/multipliers.ts:110` only qualifies `role === 'BAT'`, not WK. **The live implementation follows the existing codebase behavior (BAT only) to ensure consistency between live and final scoring.** If WK should also qualify, that change should be made in both `applyChipEffects()` and `computeLivePlayerScores()` together in a separate task.

---

## Acceptance Criteria Coverage

This phase implements and tests:

### live-mid-gameweek-scores.AC1: Live running total computation
- **live-mid-gameweek-scores.AC1.1 Success:** Base fantasy points are correctly summed per player across all scored matches in a gameweek
- **live-mid-gameweek-scores.AC1.2 Success:** Players with performances in multiple scored matches have their points accumulated
- **live-mid-gameweek-scores.AC1.3 Edge:** Players with zero points (0 fantasy points) are included with 0, not excluded

### live-mid-gameweek-scores.AC2: Captain 2x applied in live mode
- **live-mid-gameweek-scores.AC2.1 Success:** Captain's points are doubled when captain has played in at least one scored match
- **live-mid-gameweek-scores.AC2.2 Edge:** Captain who hasn't played yet shows 0 points (not doubled)
- **live-mid-gameweek-scores.AC2.3 Constraint:** Vice-captain does NOT get 2x in live mode (VC promotion is settlement-only)

### live-mid-gameweek-scores.AC3: Chip bonuses applied live to qualifying XI players
- **live-mid-gameweek-scores.AC3.1 Success:** POWER_PLAY_BAT doubles BAT players' points (after captain multiplier) in the running total
- **live-mid-gameweek-scores.AC3.2 Success:** BOWLING_BOOST doubles BOWL players' points (after captain multiplier) in the running total
- **live-mid-gameweek-scores.AC3.3 Success:** Captain who is a BAT player with POWER_PLAY_BAT gets both captain 2x and chip 2x (4x total of base)
- **live-mid-gameweek-scores.AC3.4 Edge:** No chip active = no chip bonus, just base + captain multiplier

### live-mid-gameweek-scores.AC4: Bench players excluded from live total
- **live-mid-gameweek-scores.AC4.1 Success:** Only XI players contribute to the live running total
- **live-mid-gameweek-scores.AC4.2 Success:** Bench players appear in the response but their points are not counted in totalPoints

---

<!-- START_SUBCOMPONENT_A (tasks 1-2) -->

<!-- START_TASK_1 -->
### Task 1: Create lib/scoring/live.ts with pure scoring functions

**Verifies:** live-mid-gameweek-scores.AC1.1, AC1.2, AC1.3, AC2.1, AC2.2, AC2.3, AC3.1, AC3.2, AC3.3, AC3.4, AC4.1, AC4.2

**Files:**
- Create: `lib/scoring/live.ts`

**Implementation:**

Create `lib/scoring/live.ts` with the following exports:

1. **`aggregateBasePoints(performances)`** — Pure function. Takes an array of `{ playerId: string, fantasyPoints: number }` records and returns a `Map<string, number>` (playerId → total base points). This is the logic currently inline at `lib/scoring/pipeline.ts:390-396`.

2. **`computeLivePlayerScores(params)`** — Pure function. The core live scoring engine. Takes:
   - `slots`: Array of lineup slot data (playerId, slotType, role, player role info)
   - `basePointsMap`: Map from `aggregateBasePoints()`
   - `chipType`: `'POWER_PLAY_BAT' | 'BOWLING_BOOST' | null`
   - `matchesPlayedMap`: Map<string, number> (playerId → count of matches played)

   Returns an array of per-player score objects with:
   - `basePoints`: raw sum from performances
   - `chipBonus`: additional points from chip (0 if no chip or player doesn't qualify)
   - `multipliedPoints`: `basePoints * captainMultiplier + chipBonus`
   - `isCaptain`, `isVC`, `slotType`, etc.

   **Live-specific scoring rules (different from final aggregation):**
   - Captain gets 2x if they have any points > 0 (has played)
   - VC does NOT get promoted (settlement-only) — stays at 1x
   - Chip bonus = qualifying player's `multipliedPoints` (after captain) added again
     - POWER_PLAY_BAT: players with role `'BAT'` in XI
     - BOWLING_BOOST: players with role `'BOWL'` in XI
   - Bench players: included in response but NOT in totalPoints

3. **`computeLiveTeamScore(prisma, teamId, gameweekId)`** — Async DB wrapper. Orchestrates:
   - Fetch `Lineup` with `slots` (include `player` for role/name/iplTeamCode) for `{teamId, gameweekId}`
   - Fetch `Match` records for gameweek (count total, count scored where `scoringStatus === 'SCORED'`)
   - Fetch `PlayerPerformance` for scored match IDs
   - Fetch `ChipUsage` for `{teamId, gameweekId, status: 'PENDING'}`
   - Call `aggregateBasePoints()` with performances
   - Build `matchesPlayedMap` from performances (count distinct matchIds per player)
   - Call `computeLivePlayerScores()` with assembled data
   - Fetch the `Gameweek` record to get the `number` field for display
   - Return `{ gameweekId, gameweekNumber, status: 'LIVE', matchesScored, matchesTotal, totalPoints, chipActive, chipBonusPoints, players }`

**Key implementation details:**

The `totalPoints` in the response is the sum of `multipliedPoints` for XI players only. `chipBonusPoints` is the sum of `chipBonus` across all players.

Chip bonus calculation MUST produce identical results to the existing `applyChipEffects()` in `lib/scoring/multipliers.ts:95-125`. In the aggregation pipeline (`pipeline.ts:420-424`), captain multipliers are applied to `gwPoints` BEFORE `applyChipEffects()` runs. So `applyChipEffects()` sees already-multiplied points. The chip then adds `gwPoints.get(pid)` (the multiplied value) again for qualifying players.

**Worked example (BAT captain with POWER_PLAY_BAT, base 100):**
1. Captain multiplier: `gwPoints[captain] = 100 * 2 = 200`
2. `applyChipEffects()` adds `gwPoints[captain] = 200` again for BAT: `teamTotal += 200`
3. Total contribution: 200 (captain multiplied) + 200 (chip) = 400 = base * 4

The live implementation must match: `multipliedPoints = 200` (captain), `chipBonus = 200` (equals multipliedPoints for qualifying), `total = 400`.

**Test AC3.3 verifies this exact scenario** — BAT captain with base 100, POWER_PLAY_BAT → expected total 400.

**Verification:**
Run: `npx vitest run tests/unit/scoring-live.test.ts`
Expected: All tests pass

**Commit:** `feat: add lib/scoring/live.ts with live score computation functions`

<!-- END_TASK_1 -->

<!-- START_TASK_2 -->
### Task 2: Unit tests for live scoring functions

**Verifies:** live-mid-gameweek-scores.AC1.1, AC1.2, AC1.3, AC2.1, AC2.2, AC2.3, AC3.1, AC3.2, AC3.3, AC3.4, AC4.1, AC4.2

**Files:**
- Create: `tests/unit/scoring-live.test.ts`

**Testing:**

Follow the pattern in `tests/unit/scoring-multipliers.test.ts` (import from `@/lib/scoring/live`, use `describe`/`it`/`expect` globals, create helper `mkSlot()` function).

Tests must verify each AC listed above:

**aggregateBasePoints tests:**
- AC1.1: Single player, single match → correct points
- AC1.2: Single player, multiple matches → points accumulated
- AC1.1: Multiple players → each gets correct total
- AC1.3: Player with 0 fantasy points → included with 0 in map

**computeLivePlayerScores tests:**
- AC2.1: Captain has played (points > 0) → `multipliedPoints` = basePoints * 2
- AC2.2: Captain hasn't played (points = 0) → `multipliedPoints` = 0
- AC2.3: VC has played, captain hasn't → VC stays at 1x (no promotion)
- AC3.1: POWER_PLAY_BAT chip → BAT player's `chipBonus` = their `multipliedPoints`, non-BAT chipBonus = 0
- AC3.2: BOWLING_BOOST chip → BOWL player's `chipBonus` = their `multipliedPoints`, non-BOWL chipBonus = 0
- AC3.3: BAT captain with POWER_PLAY_BAT → base 100, multiplied 200 (captain), chipBonus 200, total 400
- AC3.4: No chip → all chipBonus = 0
- AC4.1: Only XI players counted in computed totalPoints
- AC4.2: Bench player present in results array with slotType 'BENCH', points not in total

**Verification:**
Run: `npx vitest run tests/unit/scoring-live.test.ts`
Expected: All tests pass

**Commit:** `test: add unit tests for live scoring functions`

<!-- END_TASK_2 -->

<!-- END_SUBCOMPONENT_A -->
