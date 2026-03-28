# App Admin Dashboard — Implementation Plan

## Problem

There is no admin UI for platform-level operations. The scoring import API endpoint exists but has no button. Player team sync is a CLI-only script. Admins have no visibility into match scoring status, no way to trigger scoring from the app, and no way to sync player IPL team assignments after trades/replacements.

Additionally, the scoring pipeline has operational gaps:
- Users can't see team scores until an entire gameweek is aggregated
- The daily cron processes max 4 matches per run, causing backlogs
- Admin has no alerts when matches are ready to score

## Who Gets Access

Platform-level "App Admin" access controlled via `APP_ADMIN_EMAILS` environment variable. Initial admins:
- viiveek@gmail.com
- shaheeldholakia@gmail.com

This is separate from league-level admin (`League.adminUserId`), which controls roster uploads, manager removal, and league settings.

---

## Phase 1: App Admin Foundation

### 1.1 App Admin helper — `lib/app-admin.ts` (CREATE)

Simple helper that checks session email against env var:

```typescript
export function isAppAdmin(session): boolean {
  const emails = (process.env.APP_ADMIN_EMAILS || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
  return emails.includes(session?.user?.email?.toLowerCase())
}
```

No schema change. No DB query. No migration.

### 1.2 Update existing scoring routes

Change `role !== 'ADMIN'` checks to `!isAppAdmin(session)` in:

- `app/api/scoring/import/route.ts`
- `app/api/scoring/recalculate/[matchId]/route.ts`
- `app/api/scoring/cancel/[matchId]/route.ts`

This restricts scoring operations to app admins only (currently any `ADMIN` role user can trigger scoring, including league admins who shouldn't have platform access).

### 1.3 Env var setup

Add to Vercel project settings (Settings > Environment Variables):

- Key: `APP_ADMIN_EMAILS`
- Value: `viiveek@gmail.com,shaheeldholakia@gmail.com`
- Environment: Production, Preview, Development

---

## Phase 2: Sync Player Teams API

### 2.1 Extract shared logic — `lib/sync-players.ts` (CREATE)

Move the core sync logic from `scripts/reseed-player-teams.ts` into a reusable module:

```typescript
export async function syncPlayerTeams(options: { apply: boolean }): Promise<SyncResult>
```

Returns:
```typescript
interface SyncResult {
  teamChanges: { playerName: string; apiPlayerId: number; oldTeam: string; newTeam: string; fantasyTeams: string[] }[]
  newPlayers: { playerName: string; iplTeamCode: string }[]
  roleChanges: { playerName: string; oldRole: string; newRole: string }[]
  applied: boolean
  updatedCount: number
  createdCount: number
}
```

The CLI script (`scripts/reseed-player-teams.ts`) is refactored to call this shared function.

### 2.2 Sync Player Teams API — `app/api/admin/sync-players/route.ts` (CREATE)

**GET** — Dry run
- Calls `syncPlayerTeams({ apply: false })`
- Returns changes without writing to DB
- Gated by `isAppAdmin()`

**POST** — Apply
- Calls `syncPlayerTeams({ apply: true })`
- Writes changes to DB
- Gated by `isAppAdmin()`

---

## Phase 3: App Admin Dashboard UI

### 3.1 Page — `app/app-admin/page.tsx` (CREATE)

Server-side auth check: if not app admin, redirect to `/`.

Two card sections on the page:

### 3.2 Section 1: Import Scores

**Layout:**

```
┌─────────────────────────────────────────────┐
│  Import Scores                              │
│                                             │
│  Match Status                               │
│  ┌────────────────────────┬───────────────┐ │
│  │ KKR vs RCB  •  Mar 26  │  ● Scored     │ │
│  │ MI vs CSK   •  Mar 26  │  ● Completed  │ │
│  │ DC vs SRH   •  Mar 27  │  ● Scheduled  │ │
│  │ RR vs PBKS  •  Mar 27  │  ● Error      │ │
│  └────────────────────────┴───────────────┘ │
│                                             │
│  2 matches ready to score                   │
│                                             │
│  [       Import Scores       ]              │
│                                             │
└─────────────────────────────────────────────┘
```

**Status pill colors:**
- `Scheduled` — grey
- `Completed` — blue (ready to score)
- `Scoring` — yellow (in progress)
- `Scored` — green
- `Error` — red (with "Recalculate" link)
- `Cancelled` — dark grey

**UI Flow — Click "Import Scores":**

1. **Button state**: Text changes to "Importing..." with spinner, button disabled
2. **API call**: `POST /api/scoring/import`
3. **Wait**: 10-30 seconds (fetches scorecards, computes points)
4. **Response handling**:

| Outcome | Toast | Color | Detail |
|---------|-------|-------|--------|
| Matches scored | "Scored 3 matches" | Green | If GW aggregated: "+ Gameweek 2 leaderboard updated" |
| Partial | "Scored 2 of 5 matches. Run again for remaining." | Yellow | Some matches still Completed |
| Nothing to do | "No matches ready to score" | Grey | All already Scored or Scheduled |
| Error | "Scoring failed: [message]" | Red | Pipeline error |

5. **After response**: Match status table auto-refreshes, button re-enabled

**Error match row**: Shows "Recalculate" link that calls `POST /api/scoring/recalculate/[matchId]` to reset the match and retry.

### 3.3 Section 2: Sync Player Teams

**Layout:**

```
┌─────────────────────────────────────────────┐
│  Sync Player Teams                          │
│                                             │
│  Check if any IPL players changed teams     │
│  since last sync.                           │
│                                             │
│  [     Check for Updates     ]              │
│                                             │
└─────────────────────────────────────────────┘
```

**UI Flow — Click "Check for Updates":**

1. **Button state**: Text changes to "Checking..." with spinner, disabled
2. **API call**: `GET /api/admin/sync-players` (dry run)
3. **Wait**: 5-10 seconds (10 SportMonks API calls, one per IPL team)
4. **Response — changes found**:

```
┌─────────────────────────────────────────────┐
│  Sync Player Teams                          │
│                                             │
│  31 team changes found                      │
│                                             │
│  ┌──────────────┬──────┬──────┬───────────┐ │
│  │ Player       │ From │ To   │ Fantasy   │ │
│  ├──────────────┼──────┼──────┼───────────┤ │
│  │ Sanju Samson │ RR   │ CSK  │ BashXI,   │ │
│  │              │      │      │ Spartans  │ │
│  │ R. Jadeja    │ CSK  │ RR   │ BashXI,   │ │
│  │              │      │      │ Pocket R. │ │
│  │ L.Livingstone│ RCB  │ SRH  │ Buttler   │ │
│  │              │      │      │ Call Saul │ │
│  │ ...27 more   │      │      │           │ │
│  └──────────────┴──────┴──────┴───────────┘ │
│                                             │
│  + 3 new players                            │
│                                             │
│  ℹ Only updates IPL team badges.            │
│    Rosters, lineups, and scores are         │
│    not affected.                            │
│                                             │
│  [       Apply Changes       ]   (orange)   │
│                                             │
└─────────────────────────────────────────────┘
```

5. **Click "Apply Changes"** — Confirmation modal:

```
┌─────────────────────────────────────────┐
│  Apply player team updates?             │
│                                         │
│  • 31 team badge changes                │
│  • 3 new players added                  │
│                                         │
│  This only updates which IPL team       │
│  badge shows next to each player.       │
│  Fantasy rosters, lineups, and          │
│  scores are NOT affected.               │
│                                         │
│         [Cancel]    [Apply]             │
└─────────────────────────────────────────┘
```

6. **After apply**:
   - Green toast: "Updated 31 players, added 3 new players"
   - Table clears, replaced with: ✓ "All player teams are up to date"

**Response — no changes found**:
- Green check: "All player teams are up to date"
- No Apply button shown

**Response — error**:
- Red toast: "Sync failed: [message]"
- Check button re-enabled for retry

---

## Phase 4: Navigation & Auth Guard

### 4.1 App Admin nav check — `app/api/user/is-app-admin/route.ts` (CREATE)

Returns `{ isAppAdmin: boolean }` for the current session user. Called by client-side nav component to conditionally show the App Admin link.

### 4.2 AppFrame nav update — `app/components/AppFrame.tsx` (MODIFY)

Add "App Admin" link to bottom navigation:
- Icon: shield or gear
- Only visible when `isAppAdmin` is true
- Positioned after existing nav items

### 4.3 Page-level auth guard

`app/app-admin/page.tsx` checks `isAppAdmin(session)` on server render. Non-admins redirected to `/`.

---

## Phase 5: Pipeline Operational Fixes

### 5.1 Remove 4-match processing limit

**File**: `lib/scoring/pipeline.ts`

**Current**: Pipeline claims max 4 COMPLETED matches per run.

**Change**: Remove the limit. One "Import Scores" click or one cron run scores ALL pending matches.

**Why**: With the 4-match limit, if admin forgets for 2 days (8 matches pile up), one click only scores 4. The daily cron needs 2 days to clear the backlog. Removing the limit means one click (or one cron run) clears everything.

**Risk**: Longer execution time per run. A full backlog of 8 matches could take 60s+ which may hit Vercel's serverless timeout (60s on Hobby). Mitigation: if timeout is a concern, increase to 8 instead of unlimited.

### 5.2 "Ready to score" badge

On the App Admin page, show a count of matches in `COMPLETED` status above the Import Scores button:

- "3 matches ready to score" (blue)
- "No matches ready to score" (grey)

Loaded from `GET /api/scoring/status` on page load.

---

## Files Summary

| File | Action | Purpose |
|------|--------|---------|
| `lib/app-admin.ts` | CREATE | `isAppAdmin()` helper |
| `lib/sync-players.ts` | CREATE | Shared sync logic extracted from CLI script |
| `app/api/admin/sync-players/route.ts` | CREATE | GET (dry run) + POST (apply) |
| `app/api/user/is-app-admin/route.ts` | CREATE | Client-side nav check |
| `app/app-admin/page.tsx` | CREATE | App admin dashboard UI |
| `app/api/scoring/import/route.ts` | MODIFY | Use `isAppAdmin()` |
| `app/api/scoring/recalculate/[matchId]/route.ts` | MODIFY | Use `isAppAdmin()` |
| `app/api/scoring/cancel/[matchId]/route.ts` | MODIFY | Use `isAppAdmin()` |
| `app/components/AppFrame.tsx` | MODIFY | Conditional App Admin nav link |
| `lib/scoring/pipeline.ts` | MODIFY | Remove 4-match limit |
| `scripts/reseed-player-teams.ts` | MODIFY | Refactor to use `lib/sync-players.ts` |

**No schema changes. No migration. No build command changes.**

---

## Phase 6: Live Mid-Gameweek Scores

See **[live-mid-gameweek-scores-plan.md](live-mid-gameweek-scores-plan.md)** for full details including API design, dashboard UI mockups, score sheet integration, live leaderboard, and edge cases.

**Summary**: PRD requires live updates within a gameweek after each match is scored. Currently users see nothing until full GW aggregation. The plan adds a live scores API that computes running totals on-the-fly (captain 2x applied, bench subs + chips deferred to final aggregation), with a "LIVE" badge on the dashboard and provisional leaderboard rankings.

### Files for Phase 6

| File | Action | Purpose |
|------|--------|---------|
| `app/api/teams/[teamId]/scores/live/[gameweekId]/route.ts` | CREATE | Live running total API |
| `app/page.tsx` | MODIFY | Live score fallback + LIVE badge |
| `app/api/leaderboard/[leagueId]/route.ts` | MODIFY | Live standings for active GW |

---

## Updated Files Summary

| File | Action | Purpose |
|------|--------|---------|
| `lib/app-admin.ts` | CREATE | `isAppAdmin()` helper |
| `lib/sync-players.ts` | CREATE | Shared sync logic extracted from CLI script |
| `app/api/admin/sync-players/route.ts` | CREATE | GET (dry run) + POST (apply) |
| `app/api/user/is-app-admin/route.ts` | CREATE | Client-side nav check |
| `app/app-admin/page.tsx` | CREATE | App admin dashboard UI |
| `app/api/teams/[teamId]/scores/live/[gameweekId]/route.ts` | CREATE | Live mid-GW running totals |
| `app/api/scoring/import/route.ts` | MODIFY | Use `isAppAdmin()` |
| `app/api/scoring/recalculate/[matchId]/route.ts` | MODIFY | Use `isAppAdmin()` |
| `app/api/scoring/cancel/[matchId]/route.ts` | MODIFY | Use `isAppAdmin()` |
| `app/components/AppFrame.tsx` | MODIFY | Conditional App Admin nav link |
| `lib/scoring/pipeline.ts` | MODIFY | Remove 4-match limit |
| `scripts/reseed-player-teams.ts` | MODIFY | Refactor to use `lib/sync-players.ts` |
| `app/page.tsx` | MODIFY | Live score fallback + LIVE badge |
| `app/api/leaderboard/[leagueId]/route.ts` | MODIFY | Live standings for active GW |

**No schema changes. No migration. No build command changes.**

---

## Verification Plan

### Manual Testing

1. **Auth guard**: Navigate to `/app-admin` as a regular user → redirected to `/`
2. **Auth guard**: Navigate to `/app-admin` as viiveek@gmail.com → page loads
3. **Nav visibility**: Regular user sees no "App Admin" link. App admin sees it.
4. **Import Scores — nothing to do**: Click when all matches are Scored → grey toast
5. **Import Scores — success**: Mark a match as COMPLETED in DB, click → green toast, pill updates
6. **Import Scores — error**: Simulate API failure → red toast, Error pill shown
7. **Recalculate**: Click "Recalculate" on Error match → match resets and re-scores
8. **Sync — no changes**: Click Check for Updates when all teams are current → green check
9. **Sync — changes found**: After a player trade in API → changes table shown
10. **Sync — apply**: Click Apply Changes → confirmation modal → green toast → table clears
11. **Sync — error**: Disconnect network, click Apply → red toast, table stays for retry

12. **Live scores — in progress**: During an active GW with 3/7 matches scored → dashboard shows "Live • 3/7 matches scored" with running total
13. **Live scores — captain 2x**: Captain's points doubled in live running total
14. **Live scores — no data**: GW with 0 scored matches → shows "0" with "Live • 0/7 matches scored"
15. **Live → Final transition**: After full GW aggregation → "LIVE" badge disappears, final score with bench subs + chips shown
16. **Live leaderboard**: During active GW → shows "Live Standings" label with provisional rankings

### Automated Testing

Covered by the TDD test suite (layers 6-9) in `docs/test-coverage-matrix.md`.

---

## Open Questions

1. **Should the cron frequency increase?** Currently once daily at midnight UTC. More frequent would catch missed matches faster, but Vercel Hobby only allows 1 daily cron. **Recommendation**: keep as-is since admin button is the primary trigger, cron is just a safety net.

2. **Should admin get push notifications when matches finish?** Would eliminate the need to manually check. **Recommendation**: defer — out of scope for this PR.

---

## Review Findings (Staff Engineer + Product Owner)

The following issues were identified during review and must be addressed before or during implementation:

### P0 — Blockers

**1. No SCHEDULED → COMPLETED transition**
The scoring pipeline only claims matches in `COMPLETED` status. But after initial fixture import, nothing transitions matches from `SCHEDULED` to `COMPLETED` when they finish on SportMonks. The Import Scores button would always say "No matches ready to score."

**Fix:** The Import Scores flow must first refresh match statuses from SportMonks before running the scoring pipeline. Add a `syncMatchStatuses()` step that fetches fixture statuses and transitions `SCHEDULED` → `COMPLETED` (or `CANCELLED`) for finished matches.

**2. "Your Points" semantic change**
Dashboard hero currently shows `myStanding.totalPoints` (cumulative season total). The live plan replaces this with a GW running total mid-week. Users will see their score drop from 1,245 (season) to 342 (GW live) and think they lost points.

**Fix:** Keep season total in the hero. Add a separate card below for live GW score: "GW 3 Live: 342 • 4/7 matches scored."

### P1 — Must Fix

**3. Delete `app/api/user/is-app-admin/route.ts`**
Session already carries `user.email`. Add `isAppAdmin: boolean` to the JWT token in `lib/auth.ts` instead of creating a separate API route called on every page navigation.

**4. Extend existing scores API instead of creating `/live/` route**
The existing `app/api/teams/[teamId]/scores/[gameweekId]/route.ts` already queries the same data. Add `status: 'LIVE' | 'FINAL'` to the response. When no `GameweekScore` exists, compute live running total from `PlayerPerformance`. This avoids a parallel route with duplicate auth/query logic.

**5. Extract shared scoring functions**
The live scores logic duplicates a subset of `aggregateGameweek()`. Extract:
- `sumPlayerPerformances(gameweekId)` from pipeline lines 385-396
- Reuse `resolveMultipliers()` from `lib/scoring/multipliers.ts` for captain 2x
- Create `computeLiveTeamScore(teamId, gameweekId)` that both the scores API and leaderboard call

**6. Leaderboard N+1 query**
Computing live totals for 10 teams naively = 20+ queries per request. Use a single aggregation SQL query + `Cache-Control: s-maxage=60, stale-while-revalidate=300` header.

**7. Pipeline timeout risk**
8 matches × ~5s each + 10s aggregation = 50-58s, dangerously close to Vercel's 60s limit. **Fix:** Cap at 6 matches per run. Better: have the UI auto-retry in batches of 4 until all matches are scored.

**8. AppFrame has no navigation**
`app/components/AppFrame.tsx` is a 7-line div wrapper with no nav bar. The bottom navigation is rendered inline in page components. Find the actual nav component and update the plan.

### P2 — Should Fix

**9. Add `Cache-Control` headers to live scores and leaderboard APIs** — data only changes when admin scores a match, so a 60s cache eliminates repeated Neon queries during peak traffic.

**10. Live-to-final score swing can be 50%+** — Show estimated chip impact: "Your 5 BAT players = 180 pts, will become 360 with Power Play Bat." Make the math visible.

**11. Lineup carry-forward contradicts edge case** — PRD Section 4 says lineups carry forward. Live plan says "No lineup submitted" for missing lineups. Align these.

**12. Admin dashboard must be mobile-responsive** — PRD says mobile-first (393px). Admin might score from phone while watching the match.

**13. `UserRole.ADMIN` becomes dead code** — After switching scoring routes to `isAppAdmin()` (env var), the `ADMIN` enum value is unused. Explicitly document its deprecation.

**14. Add operational guidance for admin** — "Wait 15-30 minutes after match completion for full data from SportMonks."

**15. Sync player teams needs concurrency guard** — Unlike the scoring pipeline (atomic `UPDATE...RETURNING`), sync has no claim pattern. Two concurrent applies could create duplicate players. Add a simple DB-based lock.

### Updated Files Summary (Post-Review)

| File | Action | Purpose |
|------|--------|---------|
| `lib/app-admin.ts` | CREATE | `isAppAdmin()` helper |
| `lib/sync-players.ts` | CREATE | Shared sync logic |
| `lib/scoring/live.ts` | CREATE | `computeLiveTeamScore()`, `sumPlayerPerformances()` |
| `lib/sportmonks/match-sync.ts` | CREATE | `syncMatchStatuses()` — refresh match statuses from API |
| `app/api/admin/sync-players/route.ts` | CREATE | GET (dry run) + POST (apply) |
| `app/app-admin/page.tsx` | CREATE | App admin dashboard UI |
| `lib/auth.ts` | MODIFY | Add `isAppAdmin` to JWT token |
| `app/api/scoring/import/route.ts` | MODIFY | Add match status sync step + use `isAppAdmin()` |
| `app/api/scoring/recalculate/[matchId]/route.ts` | MODIFY | Use `isAppAdmin()` |
| `app/api/scoring/cancel/[matchId]/route.ts` | MODIFY | Use `isAppAdmin()` |
| `app/api/teams/[teamId]/scores/[gameweekId]/route.ts` | MODIFY | Add live score fallback when no GameweekScore |
| `app/api/leaderboard/[leagueId]/route.ts` | MODIFY | Live standings via single SQL query + cache headers |
| `app/page.tsx` | MODIFY | Keep season total in hero, add live GW card below |
| `lib/scoring/pipeline.ts` | MODIFY | Cap match limit at 6 (not unlimited) |
| Bottom nav component (TBD) | MODIFY | Conditional App Admin nav link |
| `scripts/reseed-player-teams.ts` | MODIFY | Refactor to use `lib/sync-players.ts` |

**Removed from plan:** `app/api/user/is-app-admin/route.ts` (unnecessary), `app/api/teams/[teamId]/scores/live/[gameweekId]/route.ts` (merged into existing scores route)

**Added to plan:** `lib/scoring/live.ts` (shared live scoring functions), `lib/sportmonks/match-sync.ts` (match status refresh)
