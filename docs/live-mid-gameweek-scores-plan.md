# Live Mid-Gameweek Scores — Implementation Plan

## Problem

PRD Section 8 states: **"Live updates within a gameweek (recalculates after each match is scored)."**

Currently, users see nothing on their dashboard until the entire gameweek is aggregated (all matches scored + bench subs + captain/VC + chips applied). In a gameweek with 7 matches across 4 days, users wait days to see any team score. This violates the PRD requirement.

## Current Flow (broken)

```
Match 1 scored → PlayerPerformance created → user sees nothing on dashboard
Match 2 scored → PlayerPerformance created → user sees nothing on dashboard
...
Match 7 scored → aggregateGameweek() runs → GameweekScore created → user finally sees team score
```

## Proposed Flow (live)

```
Match 1 scored → PlayerPerformance created → running total computed on-the-fly → user sees partial score
Match 2 scored → PlayerPerformance created → running total updated → user sees updated score
...
Match 7 scored → aggregateGameweek() runs → final GameweekScore with bench subs/chips → user sees final score
```

---

## 1. Live Scores API

### `app/api/teams/[teamId]/scores/live/[gameweekId]/route.ts` (CREATE)

Computes a **running total** from already-scored matches without waiting for full aggregation.

**Logic:**
1. Fetch team's lineup for this gameweek (XI + bench + captain/VC)
2. Fetch all `PlayerPerformance` records for this GW's scored matches
3. Sum each lineup player's fantasy points across scored matches
4. Apply captain 2x multiplier (if captain has performances = played)
5. Return per-player breakdown + team running total

**What it applies:**
- Base fantasy points per player (sum across scored matches)
- Captain 2x multiplier (if captain has at least one PlayerPerformance)
- Starting XI / Impact Player bonuses (already baked into PlayerPerformance.fantasyPoints)

**What it does NOT apply** (these only apply at final aggregation):
- Bench auto-substitutions (can't know who's absent until GW is fully over — a player might play in a later match)
- Chip effects (chip doubles are final-score calculations)
- VC promotion (can't know if captain is absent until all GW matches are done)

**Response:**
```typescript
{
  gameweekNumber: 3,
  status: 'IN_PROGRESS',           // vs 'FINAL' when aggregated
  matchesScored: 4,
  matchesTotal: 7,
  runningTotal: 342,               // sum of XI player points + captain 2x
  finalTotal: null,                // null until aggregated, then from GameweekScore
  players: [
    {
      id: 'cuid...',
      name: 'Virat Kohli',
      role: 'BAT',
      iplTeamCode: 'RCB',
      points: 67,                  // base points from scored matches
      isCaptain: true,
      isVC: false,
      multipliedPoints: 134,       // points * 2 for captain
      matchesPlayed: 2,            // how many GW matches this player appeared in
    },
    {
      id: 'cuid...',
      name: 'Jasprit Bumrah',
      role: 'BOWL',
      iplTeamCode: 'MI',
      points: 45,
      isCaptain: false,
      isVC: false,
      multipliedPoints: 45,        // no multiplier
      matchesPlayed: 1,
    },
    // ... remaining XI + bench players
  ],
  chipActive: 'POWER_PLAY_BAT',   // or null — shows what chip is pending
  chipNote: 'Power Play Bat chip active — BAT player points will be doubled in final score',
  notes: [
    'Bench substitutions and chip effects are applied after the final match.'
  ]
}
```

**When `GameweekScore` already exists** (GW fully aggregated):
```typescript
{
  gameweekNumber: 3,
  status: 'FINAL',
  matchesScored: 7,
  matchesTotal: 7,
  runningTotal: null,
  finalTotal: 412,                 // from GameweekScore.totalPoints
  chipUsed: 'POWER_PLAY_BAT',
  // ... player breakdown from PlayerScore table
}
```

---

## 2. Dashboard Integration

### Modify `app/page.tsx`

**Current**: Dashboard "Your Points" section shows `GameweekScore.totalPoints` — empty/zero until aggregation.

**Change**: If no `GameweekScore` exists for the active GW, call the live scores API and show the running total.

### Visual Design

**Live score (GW in progress):**
```
┌─────────────────────────────────────────┐
│                                         │
│   Your Points                           │
│                                         │
│   🔴 LIVE • 4/7 matches scored          │
│                                         │
│          342                            │
│                                         │
│   Bench subs and chip effects           │
│   applied after final match             │
│                                         │
│   Average: 298    Highest: 412          │
│                                         │
└─────────────────────────────────────────┘
```

- "LIVE" badge with pulsing red dot
- Score slightly faded or with a different background to indicate provisional
- Subtext explaining what's not yet applied
- Average and Highest computed from all teams' live running totals

**Final score (GW aggregated):**
```
┌─────────────────────────────────────────┐
│                                         │
│   Your Points                           │
│                                         │
│   Final • GW 3                          │
│                                         │
│          412                            │
│                                         │
│   Average: 315    Highest: 412          │
│                                         │
└─────────────────────────────────────────┘
```

- No LIVE badge
- Score shown normally
- No provisional disclaimer

**No matches scored yet:**
```
┌─────────────────────────────────────────┐
│                                         │
│   Your Points                           │
│                                         │
│   🔴 LIVE • 0/7 matches scored          │
│                                         │
│            0                            │
│                                         │
│   Scores update after each match        │
│                                         │
└─────────────────────────────────────────┘
```

---

## 3. GW Score Sheet Integration

When user taps their GW score on the dashboard, a bottom sheet opens.

### If GW in progress (live):

```
┌─────────────────────────────────────────┐
│  GW 3 Score Detail                      │
│  🔴 LIVE • 4/7 matches scored           │
│                                         │
│  ┌─────────────────┬──────┬───────────┐ │
│  │ Player          │ Pts  │ Role      │ │
│  ├─────────────────┼──────┼───────────┤ │
│  │ V Kohli (C)     │ 134  │ BAT • RCB │ │
│  │ J Bumrah        │  45  │ BOWL • MI │ │
│  │ R Jadeja        │  38  │ ALL • RR  │ │
│  │ S Gill          │   —  │ BAT • GT  │ │
│  │ ...             │      │           │ │
│  └─────────────────┴──────┴───────────┘ │
│                                         │
│  Running Total: 342                     │
│                                         │
│  ⚡ Power Play Bat chip active          │
│  BAT player points will be doubled      │
│  in final score                         │
│                                         │
│  ℹ Bench subs and chip effects          │
│    applied after final match            │
└─────────────────────────────────────────┘
```

- Players with no performances yet show "—" (haven't played yet this GW)
- Captain shows "(C)" with doubled points
- Active chip shown at bottom with explanation
- Bench players shown in a separate section below XI

### If GW aggregated (final):

Current behavior — no changes needed. Shows final breakdown with bench subs, captain/VC, and chip effects already applied.

---

## 4. Leaderboard During Live GW

### Modify `app/api/leaderboard/[leagueId]/route.ts`

**Current**: Returns team standings based on `GameweekScore.totalPoints` for the latest aggregated GW. During an active GW with no aggregation yet, shows stale data from the previous GW.

**Change**: For the active GW, compute live running totals for all teams and include them in the response.

### Visual Design

**During active GW:**
```
┌─────────────────────────────────────────┐
│  Live Standings                         │
│  🔴 4/7 matches scored                  │
│                                         │
│  #  Team              GW    Total       │
│  1  BashXI           412    1,245       │
│  2  Pocket Rockets   398    1,190       │
│  3  Buttler Call Saul 385   1,150       │
│  ...                                    │
│                                         │
│  Provisional — bench subs and chips     │
│  not yet applied                        │
└─────────────────────────────────────────┘
```

- Header: **"Live Standings"** with pulsing dot
- GW column shows live running total
- Total column shows previous cumulative + live GW running total
- Disclaimer at bottom

**After aggregation:**
- Header changes to **"Standings"** (no "Live" prefix)
- GW column shows final GameweekScore
- Total column shows actual team.totalPoints
- No disclaimer

---

## 5. Edge Cases

| Scenario | Behavior |
|----------|----------|
| GW with 0 scored matches | Show "0" with "LIVE • 0/7 matches scored" |
| Captain hasn't played yet (match not scored) | Show captain with "—" points, no 2x applied yet |
| Captain played in match 1 but not match 3 (match 3 not yet scored) | Show captain with match 1 points * 2x — correct so far |
| Player on XI has no PlayerPerformance | Show "—" — they might play in a later match |
| Player on bench has PlayerPerformance | Show their points but mark as bench (won't count toward total until final aggregation decides subs) |
| Chip active but not yet applied | Show chip badge with note: "will be doubled in final score" |
| User has no lineup for this GW | Show "No lineup submitted" — no live score |
| All matches scored but aggregation hasn't run yet | Still show as "LIVE" — aggregation needed for final score |
| GameweekScore exists (aggregated) | Show "FINAL" — use GameweekScore, ignore live calculation |

---

## 6. What Live Scores Deliberately Exclude

These are deferred to final aggregation because they can't be accurately computed mid-gameweek:

| Feature | Why deferred |
|---------|-------------|
| **Bench auto-subs** | Can't know if an XI player is truly absent until ALL GW matches are played — they might appear as Impact Sub in a later match |
| **VC promotion** | Can't promote VC until captain is confirmed absent for the entire GW |
| **Chip effects** | Chip doubles depend on the final scoring XI (after bench subs), not the pre-sub XI |

This means live scores will differ from final scores. The UI makes this clear with the "LIVE" badge and disclaimer.

---

## Files

| File | Action | Purpose |
|------|--------|---------|
| `app/api/teams/[teamId]/scores/live/[gameweekId]/route.ts` | CREATE | Live running total API |
| `app/page.tsx` | MODIFY | Fall back to live scores when no GameweekScore, LIVE badge |
| `app/api/leaderboard/[leagueId]/route.ts` | MODIFY | Include live running totals for active GW |

**No schema changes.**

---

## Verification

1. **Live — in progress**: During active GW with 3/7 matches scored → dashboard shows "LIVE • 3/7 matches scored" with running total
2. **Live — captain 2x**: Captain's points doubled in live running total
3. **Live — no data**: GW with 0 scored matches → shows "0" with "LIVE • 0/7 matches scored"
4. **Live → Final transition**: After full GW aggregation → "LIVE" badge disappears, final score with bench subs + chips shown
5. **Live leaderboard**: During active GW → shows "Live Standings" label with provisional rankings
6. **Live — chip pending**: Active chip shown with explanation text, not applied to running total
7. **Live — bench player scored**: Bench player points shown but clearly marked as bench (not in running total)

---

## Review Findings (Staff Engineer + Product Owner)

### Architecture Changes

**1. No separate `/live/` route — extend existing scores API instead**

Instead of creating `app/api/teams/[teamId]/scores/live/[gameweekId]/route.ts`, extend the existing `app/api/teams/[teamId]/scores/[gameweekId]/route.ts`. When no `GameweekScore` exists, compute live running total from `PlayerPerformance`. Add `status: 'LIVE' | 'FINAL'` to the response. The client renders the same data either way, with only a badge difference.

This avoids duplicate auth checks, team lookups, and match queries across two parallel routes.

**2. Extract shared scoring functions into `lib/scoring/live.ts`**

The live computation is a subset of `aggregateGameweek()` in `pipeline.ts`. Extract:
- `sumPlayerPerformances(gameweekId)` — aggregates fantasy points per player across scored matches
- `computeLiveTeamScore(teamId, gameweekId)` — fetches lineup, sums performances, applies captain 2x

Reuse `resolveMultipliers()` from `lib/scoring/multipliers.ts` for captain 2x. Both the scores API and the leaderboard call `computeLiveTeamScore()`.

**3. Leaderboard — single SQL query, not N+1**

Computing live totals for 10 teams naively = 20+ queries. Use a single aggregation query and add `Cache-Control: s-maxage=60, stale-while-revalidate=300` header. Live data only changes when admin scores a match (~once per 3 hours).

### Dashboard Changes

**4. Keep season total in hero — add separate live GW card**

The dashboard hero currently shows `myStanding.totalPoints` (cumulative season total). Replacing it with a GW running total would confuse users (1,245 → 342 looks like lost points).

**Fix:** Keep season total in the hero. Add a new card below:

```
┌─────────────────────────────────────────┐
│   Season Total: 1,245                   │  ← hero (unchanged)
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│   GW 3                                  │
│   🔴 LIVE • 4/7 matches scored          │  ← new card
│          342                            │
│   Bench subs + chips after final match  │
└─────────────────────────────────────────┘
```

**5. Show estimated chip impact, not just a label**

Live-to-final score swing can be 50%+ (bench subs add points, chip doubles an entire role). The one-line disclaimer is insufficient.

**Fix:** Show estimated chip effect explicitly:

> "Power Play Bat active — your 5 BAT players have 180 pts. This will become 360 in final score."

### Performance

**6. Add `Cache-Control` headers**

Live scores don't change between scoring events. Add `Cache-Control: s-maxage=60, stale-while-revalidate=300` to the scores and leaderboard API responses. Vercel's edge CDN will cache this, eliminating repeated Neon queries.

### Updated Files

| File | Action | Purpose |
|------|--------|---------|
| `lib/scoring/live.ts` | CREATE | `computeLiveTeamScore()`, `sumPlayerPerformances()` |
| `app/api/teams/[teamId]/scores/[gameweekId]/route.ts` | MODIFY | Add live fallback when no GameweekScore |
| `app/api/leaderboard/[leagueId]/route.ts` | MODIFY | Single SQL query for live standings + cache headers |
| `app/page.tsx` | MODIFY | Keep season hero, add live GW card below |

**Removed:** `app/api/teams/[teamId]/scores/live/[gameweekId]/route.ts` (merged into existing route)
