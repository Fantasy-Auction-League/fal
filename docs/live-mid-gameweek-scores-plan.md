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

After each match is scored, users immediately see a **running total** of their team's points so far this week.

### What users see during the week (live)

- **Playing XI points** — each player's fantasy points from matches scored so far, added up
- **Captain 2x** — if the captain has played in at least one match, their points are doubled
- **Match progress** — "4 of 7 matches scored" so users know more scores are coming
- **Active chip preview** — if a chip is active, show what it will do: "Your 5 BAT players have 180 pts — this becomes 360 in final score"

### What users DON'T see until the week ends (deferred to final)

| Feature | Why it can't be shown live |
|---------|---------------------------|
| **Bench substitutions** | A player marked absent after match 3 might appear as Impact Sub in match 5. We can't know who's truly absent until all matches are done. |
| **Vice-Captain promotion** | VC only gets 2x if the Captain is absent for the ENTIRE week. If the captain plays in any match, VC stays at 1x. Can't determine this mid-week. |
| **Chip effects** | Chips double points for a role (e.g. all batters). But the final "scoring XI" depends on bench subs, which we don't know yet. Applying chip to the wrong XI would be inaccurate. |

### Live vs. Final score — what users should expect

Live scores are **provisional**. The final score will differ because bench subs, VC promotion, and chips are applied at the end. The difference can be significant:

**Example — score goes UP:**
> Live: 342 pts. At final: bench sub adds 55 pts for two absent XI players. Power Play Bat chip doubles BAT players. Final: 540 pts.

**Example — score stays similar:**
> Live: 342 pts. Captain played, no chip active, all XI played. Final: 348 pts (small bench adjustment).

The UI clearly labels scores as "LIVE" (provisional) or "FINAL" (complete) so users understand the difference.

## Where Users See Live Scores

### 1. Dashboard — Season Total stays, live GW card added below

The dashboard hero continues showing the **season total** (cumulative across all gameweeks). A new card below shows the **live gameweek score**:

```
Season Total: 1,245          ← always visible, unchanged

GW 3 • LIVE • 4/7 matches
342 pts                       ← live running total
Bench subs + chips after final match
```

After the gameweek is finalized:

```
Season Total: 1,657          ← updated with final GW score

GW 3 • Final
412 pts                       ← final score (with subs + chips)
```

### 2. Score Detail Sheet — per-player breakdown

Tapping the live GW card opens a detail sheet:

- Each player in the XI shows their points from scored matches
- Players who haven't played yet show "—"
- Captain marked with (C) and doubled points
- Bench players shown separately (their points visible but not counted in the total yet)
- Active chip shown with estimated impact: "Power Play Bat — your 5 BAT players have 180 pts, will become 360"

### 3. Leaderboard — provisional rankings

During an active gameweek, the leaderboard shows live standings:

- Header: **"Live Standings"** with a pulsing dot
- GW column: each team's live running total
- Total column: previous season total + live GW total
- Footer: "Provisional — bench subs and chips not yet applied"

After aggregation: header changes to "Standings", final numbers, no disclaimer.

### 4. Average and Highest

During live mode, Average and Highest are computed from all teams' live running totals. These are also provisional since chips haven't been applied. The UI shows "(before chips)" next to these numbers.

## Edge Cases

| Scenario | What the user sees |
|----------|--------------------|
| Week just started, 0 matches scored | "LIVE • 0/7 matches" with 0 pts and "Scores update after each match" |
| Captain hasn't played yet | Captain row shows "—", no 2x applied yet |
| Captain played match 1, match 5 not scored yet | Captain shows match 1 points × 2 — accurate so far |
| Bench player played but XI player also played | Both shown, bench player points not in total (bench subs happen at end) |
| Chip active | Chip badge with estimated impact shown, not applied to running total |
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
4. Call `resolveMultipliers()` from `lib/scoring/multipliers.ts` for captain 2x
5. Return per-player breakdown + team running total + `status: 'LIVE'`

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
  totalPoints: 342,                // running total (LIVE) or final (FINAL)
  chipActive: 'POWER_PLAY_BAT' | null,
  chipUsed: null | 'POWER_PLAY_BAT',
  chipEstimate: '5 BAT players have 180 pts — becomes 360 in final',
  players: [
    {
      id: string,
      name: string,
      role: 'BAT' | 'BOWL' | 'ALL' | 'WK',
      iplTeamCode: string,
      slotType: 'XI' | 'BENCH',
      points: number,              // base points from scored matches
      isCaptain: boolean,
      isVC: boolean,
      multipliedPoints: number,    // points * 2 for captain, else same as points
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
- **`computeLiveTeamScore(teamId: string, gameweekId: string)`** — fetches lineup, calls `sumPlayerPerformances()`, applies captain 2x via `resolveMultipliers()`. Returns per-player breakdown + total.

Both the scores API and the leaderboard call `computeLiveTeamScore()`.

Reuses `resolveMultipliers()` from `lib/scoring/multipliers.ts` (already cleanly factored).

## 3. Leaderboard Live Standings

### Modify `app/api/leaderboard/[leagueId]/route.ts`

**Current:** Reads pre-computed `team.totalPoints` and latest `GameweekScore`.

**Change:** For the active GW (no `GameweekScore` exists yet), compute live running totals for all teams using a **single aggregation SQL query** (not N+1 per-team queries):

```sql
SELECT l."teamId",
  SUM(CASE WHEN ls.role = 'CAPTAIN' THEN pp."fantasyPoints" * 2
           ELSE pp."fantasyPoints" END) as running_total
FROM "LineupSlot" ls
JOIN "Lineup" l ON ls."lineupId" = l.id
LEFT JOIN "PlayerPerformance" pp ON pp."playerId" = ls."playerId"
  AND pp."matchId" IN (
    SELECT id FROM "Match"
    WHERE "gameweekId" = $1 AND "scoringStatus" = 'SCORED'
  )
WHERE l."gameweekId" = $1 AND ls."slotType" = 'XI'
GROUP BY l."teamId"
```

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
4. **Live — chip estimate**: Active chip shows estimated impact with specific numbers
5. **Live → Final transition**: After full GW aggregation → LIVE badge disappears, final score shown, season total updated
6. **Live leaderboard**: During active GW → "Live Standings" with provisional rankings
7. **Live — bench player**: Bench player points visible but clearly marked as bench (not in total)
8. **Season total unchanged**: Hero always shows cumulative season total, not GW total
9. **Cache**: Second request within 60s served from Vercel edge, no Neon query
