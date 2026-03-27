# Live Mid-Gameweek Scores — Phase 4: Dashboard Integration

**Goal:** Update the dashboard UI to display live GW scores, chip progression, LIVE/FINAL status badges, and rank change indicators. Adapt existing data fetching to consume the updated API response schemas from Phases 2 and 3.

**Architecture:** Modify the existing `app/page.tsx` client component. The dashboard currently fetches from `/api/leaderboard/[leagueId]` and `/api/teams/[teamId]/scores/[gameweekId]`. Both APIs now return new fields (status, chipActive, chipBonusPoints, liveGwPoints, rankChange, etc.). Update the UI to render these fields. No new API calls needed — just consume the richer response shapes.

**Tech Stack:** TypeScript, Next.js (client component), React, inline styles (existing pattern)

**Scope:** 4 phases from original design (phase 4 of 4)

**Codebase verified:** 2026-03-27

**Key context from dashboard investigation:**
- `app/page.tsx` is a single large client component (~1100 lines) with inline styles
- Hero section shows: league name, score trio (Average / Your Points / Highest), deadline
- League Standings card: rank, team name, GW points, total points (from leaderboard API)
- GW detail sheet: bottom sheet opened by tapping "Your Points" (from scores API)
- All data fetched in `useEffect` on mount: `fetchLeague()`, `fetchCurrentGw()`, `fetchStandings()`
- GW detail fetched on-demand in `openGwSheet()` → `fetch(/api/teams/.../scores/...)`

---

## Acceptance Criteria Coverage

This phase implements and tests:

### live-mid-gameweek-scores.AC13: Live GW card shown below season total hero
- **live-mid-gameweek-scores.AC13.1 Success:** During an active GW, a live GW card appears below the hero showing running total, match progress ("4/7 matches"), and active chip badge
- **live-mid-gameweek-scores.AC13.2 Success:** After GW finalization, the card shows "FINAL" with the settled score
- **live-mid-gameweek-scores.AC13.3 Edge:** When no lineup submitted, card shows "No lineup submitted for GW N"

### live-mid-gameweek-scores.AC14: Chip progression display per player
- **live-mid-gameweek-scores.AC14.1 Success:** In the GW detail sheet, qualifying players show base pts → boosted pts (e.g., "45 → 90" for POWER_PLAY_BAT)
- **live-mid-gameweek-scores.AC14.2 Success:** Active chip badge shown at the top of the detail sheet

### live-mid-gameweek-scores.AC15: LIVE/FINAL badge display
- **live-mid-gameweek-scores.AC15.1 Success:** LIVE mode shows a pulsing dot badge with "LIVE" text
- **live-mid-gameweek-scores.AC15.2 Success:** FINAL mode shows a static "FINAL" badge

### live-mid-gameweek-scores.AC16: Leaderboard rank change and live indicators
- **live-mid-gameweek-scores.AC16.1 Success:** Standings header shows "Live Standings" with pulsing dot during active GW, "Standings" when finalized
- **live-mid-gameweek-scores.AC16.2 Success:** Each standing row shows rank change indicator (↑N, ↓N, or —)
- **live-mid-gameweek-scores.AC16.3 Success:** GW column shows live running total (including chip bonus) during active GW
- **live-mid-gameweek-scores.AC16.4 Success:** Footer shows "Provisional — bench subs not yet applied" during live mode

---

<!-- START_TASK_1 -->
### Task 1: Update TypeScript interfaces for new API response shapes

**Verifies:** None (infrastructure for subsequent tasks)

**Files:**
- Modify: `app/page.tsx` (update/add interfaces near top of file, lines ~34-93)

**Implementation:**

Update the existing interfaces and add new ones to match the updated API responses from Phases 2 and 3.

1. **Update `Standing` interface** (currently at line ~71-82) to include new fields from the leaderboard API:
   - `rankChange: number` — positive = moved up, negative = down
   - `liveGwPoints: number | null` — live GW score (null if no active GW)
   - `chipActive: string | null` — active chip for live GW
   - `storedTotalPoints: number` — season total before live GW

2. **Add `LiveScoreResponse` interface** for the scores API response:
   ```typescript
   interface LiveScoreResponse {
     gameweekId: string
     gameweekNumber: number
     status: 'LIVE' | 'FINAL'
     matchesScored: number
     matchesTotal: number
     totalPoints: number
     chipActive: string | null
     chipBonusPoints: number
     players: LivePlayerScore[]
   }

   interface LivePlayerScore {
     id: string
     name: string
     role: string
     iplTeamCode: string | null
     slotType: 'XI' | 'BENCH'
     basePoints: number
     chipBonus: number
     isCaptain: boolean
     isVC: boolean
     multipliedPoints: number
     matchesPlayed: number
   }
   ```

3. **Add `LeaderboardResponse` interface** for the leaderboard API wrapper:
   ```typescript
   interface LeaderboardResponse {
     standings: Standing[]
     leagueId: string
     gwStatus: 'LIVE' | 'FINAL'
     activeGwNumber: number | null
     matchesScored: number | null
     matchesTotal: number | null
   }
   ```

4. **Update state variables** — replace `gwPlayerScores` state (currently `GwPlayerScore[]`) with the new `LiveScoreResponse` shape. Add `gwStatus` state from leaderboard response.

**Verification:**
Run: `npx next build`
Expected: Build succeeds with no type errors

**Commit:** `refactor: update dashboard interfaces for live scoring API responses`

<!-- END_TASK_1 -->

<!-- START_TASK_2 -->
### Task 2: Update data fetching to consume new API response shapes

**Verifies:** live-mid-gameweek-scores.AC13.1

**Files:**
- Modify: `app/page.tsx` (update `fetchStandings` at ~line 275, `openGwSheet` at ~line 300)

**Implementation:**

1. **Update `fetchStandings()`** (currently at line 275-283):
   - Parse the full `LeaderboardResponse` from the leaderboard API
   - Store `gwStatus`, `activeGwNumber`, `matchesScored`, `matchesTotal` in new state variables
   - Standings array now includes `rankChange`, `liveGwPoints`, `chipActive`

2. **Update `openGwSheet()`** (currently at line 300-322):
   - Parse `LiveScoreResponse` instead of `{ playerScores, performances, matches }`
   - Store the full response including `status`, `chipActive`, `chipBonusPoints`, `players`
   - The live score fetch now automatically returns LIVE or FINAL mode — no client-side logic needed

3. **Eagerly fetch live score on page load** (not just on sheet open):
   - During an active GW, fetch the user's live score alongside standings in the initial `useEffect`
   - This enables showing the live GW card immediately without tapping "Your Points"
   - Only do this if there's a current GW and a team

4. **Update computed values** (line ~400-424):
   - `yourPoints` should use `storedTotalPoints + (liveGwPoints ?? 0)` from standings during live mode, OR keep using `totalPoints` from leaderboard (which now includes live)
   - `gwScoreTotal` should come from the `LiveScoreResponse.totalPoints` instead of summing `playerScores`
   - Average and Highest should be derived from the updated standings

**Verification:**
Run: `npx next build`
Expected: Build succeeds. Manual verify: live data renders on dashboard.

**Commit:** `feat: update dashboard data fetching for live scoring APIs`

<!-- END_TASK_2 -->

<!-- START_TASK_3 -->
### Task 3: Add Live GW card below hero

**Verifies:** live-mid-gameweek-scores.AC13.1, AC13.2, AC13.3, AC15.1, AC15.2

**Files:**
- Modify: `app/page.tsx` (add new card section after the hero div, around line ~552)

**Implementation:**

Add a new card between the hero section (ends ~line 550) and the content area (starts ~line 553). This card shows the live GW running total prominently.

**Card content based on state:**

**LIVE mode** (liveScoreResponse.status === 'LIVE'):
- Pulsing green dot + "LIVE" badge + "GW {N}" label
- Match progress: "{matchesScored}/{matchesTotal} matches"
- Large running total number
- If chip active: chip badge with icon and name (e.g., "⚡ Power Play Bat +{chipBonusPoints} pts")
- Footer: "Bench subs applied after final match"

**FINAL mode** (liveScoreResponse.status === 'FINAL'):
- Static "FINAL" badge + "GW {N}" label
- Final score number
- No chip estimate, no match progress needed

**No lineup:**
- "No lineup submitted for GW {N}" message

**Pulsing dot CSS** — use inline keyframes via a small CSS-in-JS approach (since the project uses inline styles). Create a `<style>` tag or use a CSS animation with `@keyframes` in the component:
```css
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
```
Apply with `animation: 'pulse 2s infinite'` on the dot element.

**Card styling** — follow existing card pattern (white bg, border, borderRadius 16, padding 14, boxShadow). The card is tappable — clicking opens the GW detail sheet (reuse `openGwSheet`).

**Verification:**
Run: `npx next build`
Expected: Build succeeds. Manual verify: live GW card visible with correct status.

**Commit:** `feat: add live GW score card to dashboard`

<!-- END_TASK_3 -->

<!-- START_TASK_4 -->
### Task 4: Update GW detail sheet for live scoring with chip progression

**Verifies:** live-mid-gameweek-scores.AC14.1, AC14.2, AC15.1, AC15.2

**Files:**
- Modify: `app/page.tsx` (update GW sheet section, around lines ~878-1050+)

**Implementation:**

Update the existing GW detail bottom sheet to render the new `LiveScoreResponse` data:

1. **Sheet header** (currently shows gwScoreTotal):
   - Show LIVE/FINAL badge (reuse pulsing dot from Task 3)
   - Show match progress during LIVE mode: "4/7 matches scored"
   - Total points from `liveScoreResponse.totalPoints`

2. **Active chip badge** at top of player list (AC14.2):
   - If `chipActive` is set, show a colored badge: "⚡ {chipName} ACTIVE — +{chipBonusPoints} bonus pts"
   - Chip name mapping: `POWER_PLAY_BAT` → "Power Play Bat", `BOWLING_BOOST` → "Bowling Boost"

3. **Player list** (currently renders `gwPlayerScores` with `GwPlayerScore` shape):
   - Update to render `liveScoreResponse.players` with the `LivePlayerScore` shape
   - Show player name, role badge, IPL team code
   - Show `multipliedPoints` as the main number
   - **Chip progression per player (AC14.1):** If player has `chipBonus > 0`, show "basePoints → multipliedPoints" (e.g., "45 → 90") in a secondary line
   - Captain badge: "(C)" next to name if `isCaptain`
   - VC badge: "(VC)" next to name if `isVC`
   - Bench players: grey background, "BENCH" label, points shown but visually de-emphasized
   - Players who haven't played: show "—" instead of 0

4. **Separate XI and BENCH sections:**
   - "Playing XI" header with XI player list
   - "Bench" header with bench player list
   - During LIVE mode, bench footer: "Bench subs applied at GW end"

5. **Summary row at bottom of player list:**
   - Total base points
   - Captain bonus: +{amount}
   - Chip bonus: +{chipBonusPoints} (if chip active)
   - = Total: {totalPoints}

**Verification:**
Run: `npx next build`
Expected: Build succeeds. Manual verify: sheet shows per-player chip progression.

**Commit:** `feat: update GW detail sheet with live scoring and chip progression`

<!-- END_TASK_4 -->

<!-- START_TASK_5 -->
### Task 5: Update League Standings card for live mode

**Verifies:** live-mid-gameweek-scores.AC16.1, AC16.2, AC16.3, AC16.4

**Files:**
- Modify: `app/page.tsx` (update standings card section, around lines ~555-634)

**Implementation:**

Update the League Standings card to reflect live mode:

1. **Section header** (currently "League Standings" at line ~563):
   - During LIVE mode (`gwStatus === 'LIVE'`): Show pulsing green dot + "Live Standings" + match progress badge ("4/7")
   - During FINAL mode: Show "League Standings" (existing)

2. **Column headers** (currently at line ~576-584):
   - Add a narrow column for rank change indicator between # and Team
   - Keep existing: #, Team, GW, Total

3. **Standing rows** (currently at lines ~587-613):
   - **Rank change indicator (AC16.2):** Between rank number and team name, show:
     - `rankChange > 0`: green "↑{N}"
     - `rankChange < 0`: red "↓{Math.abs(N)}"
     - `rankChange === 0`: grey "—"
   - **GW column (AC16.3):** Show `liveGwPoints` during active GW (was `lastGwPoints`). If chip active for this team, show a small chip indicator (dot or icon)
   - **Total column:** Already shows `totalPoints` which now includes live GW from the API

4. **Footer (AC16.4):**
   - During LIVE mode: "Provisional — bench subs not yet applied" in small grey text
   - During FINAL mode: hint text (existing behavior, currently empty string at line ~633)

5. **Average and Highest in hero:**
   - During LIVE mode, add "(before bench subs)" label below Average and Highest numbers
   - These are computed from standings which now include live scores

**Verification:**
Run: `npx next build`
Expected: Build succeeds. Manual verify: standings show live indicators and rank changes.

**Commit:** `feat: update standings card with live mode, rank changes, and chip indicators`

<!-- END_TASK_5 -->
