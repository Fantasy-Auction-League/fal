# Server-Side Lineup Carry-Forward

## Problem

The scoring pipeline (`aggregateGameweek`) skips any team without a lineup for the current gameweek:

```typescript
const lineup = team.lineups[0]
if (!lineup || lineup.slots.length === 0) continue  // ← team scores 0
```

Lineup carry-forward currently only runs when a user visits the lineup page (GET `/api/teams/[teamId]/lineups/[gameweekId]`). If a user doesn't log in before a gameweek is aggregated, they have no lineup and score **zero points** — even though they have a valid lineup from the previous gameweek.

### Who is affected

1. **Users with a previous GW lineup who didn't log in** — their GW1 lineup should carry forward to GW2, GW3, etc. This is the majority case. Currently: 15/15 real teams only have a GW1 lineup; nobody has submitted for GW2 or GW3.

2. **Users who never set any lineup** (e.g., Vikram/Naughty Nuts) — they have a 15-player squad from the auction but never opened the lineup page. Currently: 2 teams in prod with 0 lineups.

### Why this matters

- Users expect their lineup to persist week-to-week unless they change it (PRD Section 4 confirms lineups carry forward)
- A user who set their lineup in GW1 and goes on vacation for 2 weeks should still score points
- The current behavior punishes casual users who don't check the app every week

---

## Design

### Overview

Add a `ensureLineups()` function that runs inside `aggregateGameweek()`, **before** the scoring loop. It handles two cases:

1. **Carry-forward:** Clone the most recent previous lineup for teams missing one this GW
2. **Auto-generate:** Create a default lineup from squad for teams that have never set one

Both create real `Lineup` + `LineupSlot` records so:
- The user sees the lineup on their lineup page
- Future gameweeks can carry forward from it
- The scoring loop picks it up naturally (no special cases needed)

### Case 1: Carry-Forward from Previous Gameweek

**Trigger:** Team has no lineup for the current gameweek, but has a lineup in a previous gameweek.

**Logic:**
1. Find the most recent gameweek (by `Gameweek.number`) where this team has a lineup
2. Clone all `LineupSlot` records exactly: same `playerId`, `slotType`, `benchPriority`, `role` (CAPTAIN/VC)
3. Create a new `Lineup` record for the current gameweek with the cloned slots

**What carries forward:**
- Playing XI (11 players) — same players, same positions
- Bench (4 players) — same players, same bench priority order
- Captain — same player
- Vice Captain — same player

**What does NOT carry forward:**
- Chip activations — chips are per-gameweek decisions, never auto-applied
- Any pending lineup edits the user started but didn't save

**Edge case — player no longer on squad:** If a player in the previous lineup was removed from the squad (e.g., via admin action), skip that slot. The bench substitution logic in the scoring pipeline already handles missing players — a non-playing XI member gets auto-subbed from bench.

### Case 2: Auto-Generate from Squad (Never Set Lineup)

**Trigger:** Team has no lineup in ANY gameweek, but has players in `TeamPlayer`.

**Logic:**

1. Fetch all `TeamPlayer` records for the team, joined with `Player` to get roles
2. Sort players into role buckets: BAT, BOWL, ALL, WK
3. Select the Playing XI (11 players) with role balance:
   - All WK players (typically 1-2)
   - All ALL-rounders (typically 2-4)
   - Fill remaining slots: BAT first, then BOWL
   - If more than 11 after this: trim BOWL, then BAT from the end
4. Remaining players (up to 4) become bench with priority 1, 2, 3, 4
5. Select Captain and Vice Captain:
   - **Primary:** Use cumulative `PlayerPerformance.fantasyPoints` across all scored matches. Highest = Captain, second highest = VC. This picks the objectively best-performing player.
   - **Fallback (no performance data, e.g., GW1 before any matches scored):** Pick by role priority: ALL > BAT > WK > BOWL. Within same role, pick alphabetically by name for determinism.

**Why this ordering:**
- ALL-rounders earn points from batting, bowling, AND fielding — highest expected value
- WK players earn batting + keeping bonus
- BAT players earn batting points only
- BOWL players earn bowling points only
- This matches standard fantasy cricket strategy

**Squad size assumption:** Teams have exactly 15 players (enforced by auction). XI = 11, Bench = 4.

### Where This Runs

Inside `aggregateGameweek()` in `lib/scoring/pipeline.ts`, immediately after fetching teams (line 380) and before the scoring loop (line 398):

```
aggregateGameweek(gameweekId)
  ├── Fetch all teams with lineups          (existing, line 369-380)
  ├── *** ensureLineups() ***               (NEW — carry-forward + auto-generate)
  ├── Build played set                      (existing, line 382)
  ├── Fetch performances                    (existing, line 385)
  ├── Scoring loop for each team            (existing, line 399-476)
  └── Mark GW as done                       (existing, line 479-482)
```

### Function Signature

```typescript
async function ensureLineups(
  teams: TeamWithLineups[],
  gameweekId: string
): Promise<{ carriedForward: number; autoGenerated: number }>
```

- Mutates the `teams` array in place (populates `team.lineups[0]` for teams that were missing one)
- Returns counts for logging/diagnostics
- Runs inside the same `$transaction` as the scoring loop for atomicity

### What This Does NOT Change

- **User-submitted lineups are never overwritten.** If a user has a lineup for this GW, `ensureLineups` skips their team.
- **The GET endpoint carry-forward still works.** When a user visits the lineup page, the existing carry-forward logic fires as before. `ensureLineups` is a safety net, not a replacement.
- **No schema changes.** Uses existing `Lineup` and `LineupSlot` models.
- **No new API routes.** This is internal pipeline logic only.

---

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| User submitted lineup for this GW | Skipped — their lineup is used as-is |
| User has GW1 lineup, no GW2 | GW1 lineup carried forward to GW2 (exact clone) |
| User has GW1+GW2 lineup, no GW3 | GW2 lineup carried forward to GW3 (most recent) |
| User has no lineup in any GW, has squad | Auto-generate from squad with role-based captain |
| User has no lineup AND no squad | Skipped — nothing to generate from (team scores 0) |
| Previous lineup has a player removed from squad | Slot skipped; bench sub logic handles the gap |
| GW1 aggregation (no previous GW exists) | Only auto-generate applies; no carry-forward source |
| User visits lineup page before aggregation | GET endpoint carry-forward fires first; `ensureLineups` finds lineup already exists, skips |
| Two aggregations run concurrently | `Lineup` has `@@unique([teamId, gameweekId])` — second insert fails gracefully |

---

## Testing

### Unit Tests

1. **Carry-forward creates correct lineup** — mock team with GW1 lineup, call `ensureLineups` for GW2, verify slots match GW1 exactly (same players, roles, bench priorities)
2. **Carry-forward picks most recent GW** — team has GW1 and GW2 lineups, GW3 missing → carries GW2 forward
3. **Auto-generate picks correct XI** — mock squad of 15 players with known roles, verify 11 XI + 4 bench with role balance
4. **Auto-generate captain selection** — mock performance data, verify highest-scoring player is captain
5. **Auto-generate captain fallback** — no performance data, verify ALL-rounder selected as captain
6. **Skips teams with existing lineup** — team already has lineup for this GW → no changes
7. **Skips teams with no squad** — team has 0 TeamPlayers → no lineup created
8. **Handles removed players** — previous lineup has player not in current squad → slot skipped

### Integration Tests

9. **Full pipeline with carry-forward** — seed team with GW1 lineup, run `aggregateGameweek` for GW2, verify `GameweekScore` created with correct points
10. **Full pipeline with auto-generate** — seed team with squad only (no lineups), run pipeline, verify team scores points

---

## Verification Plan

1. Deploy to staging
2. Check Vikram's team (Naughty Nuts, no lineup) — after GW aggregation, should have auto-generated lineup and non-zero score
3. Check any team with only GW1 lineup — after GW2 aggregation, should have carried-forward lineup identical to GW1
4. Verify users who DID set lineups are unaffected — their scores shouldn't change
