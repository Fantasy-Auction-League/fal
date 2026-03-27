# Live Mid-Gameweek Scores

## Problem

PRD Section 8 states: **"Live updates within a gameweek (recalculates after each match is scored)."**

Currently, users see nothing on their dashboard until the entire gameweek is aggregated (all matches scored + bench subs + captain/VC + chips applied). In a gameweek with 7 matches across 4 days, users wait days to see any team score.

---

# Part 1: Business Logic

## How Scoring Works Today

```
Match 1 finishes → Admin clicks "Import Scores" → Player points calculated and stored
Match 2 finishes → Admin clicks "Import Scores" → Player points calculated and stored
...
Match 7 finishes (last match of the week) → Admin clicks "Import Scores" → Player points calculated
    → System detects all matches are done → Full gameweek aggregation runs:
        1. Bench players substitute in for absent XI players
        2. Captain gets 2x multiplier (or VC promoted if captain absent)
        3. Chip effects applied (e.g. all BAT players doubled)
        4. Final team score and leaderboard saved
    → User finally sees their score
```

**The problem:** Users see nothing for matches 1-6. They only see results after match 7.

## How Live Scoring Will Work

After each match is scored, users immediately see a **running total** of their team's points so far this week. The GW total is not locked until the gameweek ends — it accumulates with each completed match.

**Why this matters:** Seeing live score updates keeps users engaged and invested — they want to root for outcomes in the next match knowing how they affect their running total.

### What users see during the week (live) — updated after every match

- **Playing XI points** — each player's fantasy points from matches scored so far, added up
- **Captain 2x** — if the captain has played in at least one match, their points are doubled
- **Chip bonus points** — if a chip is active for the GW, its effect is applied live to all qualifying Playing XI players who have played. Examples:
  - **Power Play Bat** — all BAT/WK players in the XI get 2x on their scored points, updating after each match
  - **Power Bowler** — all BOWL players in the XI get 2x on their scored points, updating after each match
  - **Triple Captain** — captain gets 3x instead of 2x, updating after each match
  - **Bench Boost** — bench player points are included in the running total (live exception to bench exclusion)
- **Match progress** — "4 of 7 matches scored" so users know more scores are coming

The running GW total = base XI points + captain multiplier + chip bonus points. This updates after every scored match.

### What users DON'T see until the week ends (deferred to final settlement)

| Feature | Why it can't be shown live |
|---------|---------------------------|
| **Bench substitutions** | A player marked absent after match 3 might appear as Impact Sub in match 5. We can't know who's truly absent until all matches are done. Bench subs are applied in the priority order set by the manager. |
| **Vice-Captain promotion** | VC only gets 2x if the Captain is absent for the ENTIRE week. If the captain plays in any match, VC stays at 1x. Can't determine this mid-week. |

**Note:** Chips ARE applied live (see above). The only settlement-time adjustments are bench subs and VC activation.

### End-of-Gameweek Settlement

Once the GW is fully completed (all matches finished), the system performs final settlement:

1. **Bench substitutions** applied in the priority order set by the manager
2. **Vice-captain chip** evaluated (if captain was absent for entire GW)
3. **Chip effects recalculated** on the final scoring XI (after bench subs may change which players qualify)
4. **Season total points** updated to reflect the finalized GW score

These settlement actions (bench subs, VC activation) only happen once at GW completion, not during live scoring.

### Live vs. Final score — what users should expect

Live scores are **provisional**. The final score may differ because bench subs and VC promotion are applied at settlement. The difference is typically small unless bench subs trigger:

**Example — score goes UP:**
> Live: 540 pts (includes Power Play Bat 2x on BAT players). At final: bench sub replaces absent XI player with a bench BAT player who also gets the chip bonus. Final: 595 pts.

**Example — score stays similar:**
> Live: 480 pts (includes captain 2x, no chip). All XI played, no bench subs needed. Final: 480 pts.

**Example — chip progression during GW:**
> After match 1: Power Play Bat active — 3 BAT players scored 90 pts → 180 pts with chip. GW total: 250.
> After match 3: 2 more BAT players scored 60 pts → 120 pts with chip. GW total: 410.
> After match 5: Captain (BAT) scored 45 pts → 90 pts (chip 2x) → 180 pts (captain 2x on top). GW total: 520.

The UI clearly labels scores as "LIVE" (provisional) or "FINAL" (complete) so users understand the difference.

## Where Users See Live Scores

### 1. Dashboard — Season Total stays, live GW card added below

The dashboard hero continues showing the **season total** (cumulative across all gameweeks). A new card below shows the **live gameweek score**:

```
Season Total: 1,245          ← always visible, unchanged

GW 3 • LIVE • 4/7 matches
520 pts                       ← live running total (includes chip bonuses)
⚡ Power Play Bat active — +180 bonus pts
Bench subs applied after final match
```

After the gameweek is finalized:

```
Season Total: 1,840          ← updated with final GW score

GW 3 • Final
595 pts                       ← final score (with bench subs applied)
```

### 2. Score Detail Sheet — per-player breakdown

Tapping the live GW card opens a detail sheet:

- Each player in the XI shows their points from scored matches
- Players who haven't played yet show "—"
- Captain marked with (C) and doubled points shown
- **Chip bonus shown per player** — qualifying players show base pts → boosted pts (e.g. "45 → 90" for Power Play Bat). The chip bonus updates after each match as players score.
- Bench players shown separately (their points visible but not counted in the total — except with Bench Boost chip active)
- Active chip badge at the top: "Power Play Bat ACTIVE — 5 BAT players boosted"

### 3. Leaderboard — live standings & locked lineups

As soon as a match ends and scores are updated, the full leaderboard refreshes with updated scores for all team managers.

- Header: **"Live Standings"** with a pulsing dot
- GW column: each team's live running total (includes chip bonuses)
- Total column: previous season total + live GW total
- Footer: "Provisional — bench subs not yet applied"
- **Locked lineup rule:** The lineup visible for another manager is always their **locked GW lineup** — the one set before the GW deadline. A manager should never see another manager's in-progress lineup edits for the next GW — only the locked current-GW team and its updated scores.

After aggregation: header changes to "Standings", final numbers, no disclaimer.

### 4. Rankings Movement

After each GW, managers see their leaderboard ranking shift up or down based on updated scores. This creates an additional layer of engagement and competition.

- Show **rank change indicator** (↑3, ↓1, —) next to each team
- Rank changes are based on season total (previous total + current GW progress)
- During live GW: ranks shift in real-time as matches are scored
- After GW settlement: ranks reflect final scores

### 5. Average and Highest

During live mode, Average and Highest are computed from all teams' live running totals (including chip bonuses). These are provisional since bench subs haven't been applied. The UI shows "(before bench subs)" next to these numbers.

## Edge Cases

| Scenario | What the user sees |
|----------|--------------------|
| Week just started, 0 matches scored | "LIVE • 0/7 matches" with 0 pts and "Scores update after each match" |
| Captain hasn't played yet | Captain row shows "—", no 2x applied yet |
| Captain played match 1, match 5 not scored yet | Captain shows match 1 points × 2 — accurate so far |
| Bench player played but XI player also played | Both shown, bench player points not in total (bench subs happen at end) |
| Chip active | Chip bonus applied live to qualifying XI players — running total includes chip points |
| Bench Boost chip active | Bench player points included in running total (unique chip behavior) |
| No lineup submitted for this GW | "No lineup submitted" — no live score. (Note: if lineup carry-forward is implemented per PRD Section 4, previous GW lineup is used instead) |
| All 7 matches scored, aggregation hasn't run yet | Still "LIVE" with note "Final score pending — calculating bench subs and chips" |
| Gameweek fully aggregated | "FINAL" — shows definitive score from GameweekScore table |
| New user joins mid-season | Sees live score for current GW (if they have a lineup), 0 for previous GWs |

---

# Part 2: Technical Implementation

## 1. Extend Existing Scores API (not a new route)

### Modify `app/api/teams/[teamId]/scores/[gameweekId]/route.ts`

Instead of creating a separate `/live/` route, extend the existing scores endpoint. When no `GameweekScore` exists, compute live running total from `PlayerPerformance`. Add `status: 'LIVE' | 'FINAL'` to the response. The client renders the same data either way, with only a badge difference.

**Logic when `GameweekScore` does not exist (LIVE mode):**
1. Fetch team's lineup for this gameweek (Lineup + LineupSlots with player details)
2. Fetch all `PlayerPerformance` records for this GW's scored matches
3. Sum each lineup player's fantasy points across scored matches
4. Call `resolveMultipliers()` from `lib/scoring/multipliers.ts` for captain 2x (or 3x if Triple Captain chip)
5. Apply chip bonuses to qualifying XI players:
   - **Power Play Bat**: 2x all BAT/WK players' points
   - **Power Bowler**: 2x all BOWL players' points
   - **Triple Captain**: 3x captain's points (instead of 2x)
   - **Bench Boost**: include bench players' points in total
6. Return per-player breakdown (base + chip bonus) + team running total + `status: 'LIVE'`

**Logic when `GameweekScore` exists (FINAL mode):**
- Return existing `GameweekScore.totalPoints` + `PlayerScore` breakdown + `status: 'FINAL'`
- No computation needed — data already stored

**Response schema:**
```typescript
{
  gameweekNumber: 3,
  status: 'LIVE' | 'FINAL',
  matchesScored: 4,
  matchesTotal: 7,
  totalPoints: 520,                // running total with chip bonuses (LIVE) or final (FINAL)
  chipActive: 'POWER_PLAY_BAT' | 'POWER_BOWLER' | 'TRIPLE_CAPTAIN' | 'BENCH_BOOST' | null,
  chipBonusPoints: 180,            // total additional points from chip this GW
  players: [
    {
      id: string,
      name: string,
      role: 'BAT' | 'BOWL' | 'ALL' | 'WK',
      iplTeamCode: string,
      slotType: 'XI' | 'BENCH',
      basePoints: number,          // base points from scored matches
      chipBonus: number,           // additional points from active chip (0 if no chip or not qualifying)
      isCaptain: boolean,
      isVC: boolean,
      multipliedPoints: number,    // after captain multiplier + chip bonus
      matchesPlayed: number,
    }
  ],
}
```

**Cache header:** `Cache-Control: s-maxage=60, stale-while-revalidate=300` — live data only changes when admin scores a match (~once per 3 hours), so a 60-second cache eliminates repeated DB queries during peak traffic.

## 2. Extract Shared Scoring Functions

### Create `lib/scoring/live.ts`

Extract reusable logic from `aggregateGameweek()` in `pipeline.ts`:

- **`sumPlayerPerformances(gameweekId: string)`** — aggregates fantasy points per player across all scored matches in a GW. Currently inline at `pipeline.ts` lines 385-396.
- **`applyChipBonuses(players, chipType)`** — applies chip multipliers to qualifying players in the current XI. Returns per-player chip bonus and total chip bonus points.
- **`computeLiveTeamScore(teamId: string, gameweekId: string)`** — fetches lineup, calls `sumPlayerPerformances()`, applies captain multiplier via `resolveMultipliers()`, applies chip bonuses via `applyChipBonuses()`. Returns per-player breakdown (base + chip) + running total.

Both the scores API and the leaderboard call `computeLiveTeamScore()`.

Reuses `resolveMultipliers()` from `lib/scoring/multipliers.ts` (already cleanly factored).

## 3. Leaderboard Live Standings

### Modify `app/api/leaderboard/[leagueId]/route.ts`

**Current:** Reads pre-computed `team.totalPoints` and latest `GameweekScore`.

**Change:** For the active GW (no `GameweekScore` exists yet), compute live running totals for all teams using a **single aggregation SQL query** (not N+1 per-team queries). Chip bonuses are applied in application code after the query (since chip logic varies per chip type and team):

```sql
SELECT l."teamId",
  ls."slotType",
  ls.role as "slotRole",
  p.role as "playerRole",
  ls."playerId",
  COALESCE(SUM(pp."fantasyPoints"), 0) as base_points,
  CASE WHEN ls.role = 'CAPTAIN' THEN true ELSE false END as is_captain,
  c."chipType" as active_chip
FROM "LineupSlot" ls
JOIN "Lineup" l ON ls."lineupId" = l.id
JOIN "Player" p ON p.id = ls."playerId"
LEFT JOIN "ChipUsage" c ON c."teamId" = l."teamId" AND c."gameweekId" = $1
LEFT JOIN "PlayerPerformance" pp ON pp."playerId" = ls."playerId"
  AND pp."matchId" IN (
    SELECT id FROM "Match"
    WHERE "gameweekId" = $1 AND "scoringStatus" = 'SCORED'
  )
WHERE l."gameweekId" = $1
GROUP BY l."teamId", ls."slotType", ls.role, p.role, ls."playerId", c."chipType"
```

Application code then:
1. Applies captain 2x (or 3x for Triple Captain)
2. Applies chip bonuses per team (Power Play Bat → 2x BAT/WK, Power Bowler → 2x BOWL, Bench Boost → include bench)
3. Sums to running total per team

**Locked lineup enforcement:** The query always reads from the locked `Lineup` for the current GW. A manager's in-progress edits for the next GW are on a different gameweekId and never surface here.

Add `Cache-Control: s-maxage=60, stale-while-revalidate=300`.

## 4. Dashboard Integration

### Modify `app/page.tsx`

- **Season total hero:** Unchanged — always shows `team.totalPoints`
- **New live GW card:** Below the hero, add a card that:
  - Calls the scores API for the active GW
  - If `status === 'LIVE'`: show running total with pulsing dot badge, match progress, chip estimate, disclaimer
  - If `status === 'FINAL'`: show final score, no badge, no disclaimer
  - If no lineup: show "No lineup submitted for GW N"

## 5. Performance

- **Cache headers** on scores + leaderboard APIs (`s-maxage=60`) — Vercel edge CDN handles caching, Neon only queried once per 60s regardless of user count
- **Single SQL query** for leaderboard live standings — avoids N+1 per-team computation
- **No Neon cold start concern** — during matches, 10 users keep the connection warm; between matches, 1-3s cold start is acceptable

## Files

| File | Action | Purpose |
|------|--------|---------|
| `lib/scoring/live.ts` | CREATE | `computeLiveTeamScore()`, `sumPlayerPerformances()` |
| `app/api/teams/[teamId]/scores/[gameweekId]/route.ts` | MODIFY | Add live fallback when no GameweekScore |
| `app/api/leaderboard/[leagueId]/route.ts` | MODIFY | Single SQL query for live standings + cache headers |
| `app/page.tsx` | MODIFY | Keep season hero, add live GW card below |

**No schema changes. No new routes (extends existing ones).**

---

## Verification

1. **Live — in progress**: During active GW with 3/7 matches scored → dashboard shows live GW card with running total
2. **Live — captain 2x**: Captain's points doubled in live running total
3. **Live — no data**: GW with 0 scored matches → shows "0" with "LIVE • 0/7 matches scored"
4. **Live — chip progression**: Active chip bonuses applied to qualifying players' scores, updating after each match. Per-player breakdown shows base → boosted points.
5. **Live — chip accumulation**: GW total includes chip bonus points (e.g. Power Play Bat: BAT players at 2x). Chip bonus total shown separately on dashboard card.
6. **Live → Final transition**: After full GW settlement → LIVE badge disappears, bench subs applied, chip recalculated on final XI, season total updated
7. **Live leaderboard**: During active GW → "Live Standings" with provisional rankings, refreshes after each scored match
8. **Live — locked lineups**: Other managers' teams show their locked GW lineup only — never in-progress edits for next GW
9. **Rankings movement**: After each GW, rank change indicators (↑↓—) shown next to each team. During live GW, ranks shift as matches are scored.
10. **Live — bench player**: Bench player points visible but clearly marked as bench (not in total — except with Bench Boost chip)
11. **Season total unchanged**: Hero always shows cumulative season total, not GW total
12. **Cache**: Second request within 60s served from Vercel edge, no Neon query
