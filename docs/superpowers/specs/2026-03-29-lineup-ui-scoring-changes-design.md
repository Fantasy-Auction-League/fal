# Lineup UI & Scoring Changes — Design Spec

**Date:** 2026-03-29
**Branch:** `readonly-lineup-gw-points` (or new feature branch)

## Overview

Seven changes across lineup screens, player popup, player profile, and the scoring engine. Grouped screen-by-screen for implementation and testing.

---

## 1. Lineup Screens — C/VC Badge Sizing (Both Read-Only + Edit)

**Problem:** The captain/vice-captain badge is larger on the read-only lineup than on the edit lineup.

**Change:** Unify both screens to use the larger badge size from read-only lineup.

- Increase edit lineup C/VC badge to match read-only (~22px diameter)
- Gold (#F9CD05) for captain, grey (#C0C7D0) for vice-captain
- 2px white border, subtle drop shadow (`0 1px 4px rgba(0,0,0,0.15)`)
- Apply to both pitch view and any list view where badges appear

**Files:** `app/lineup/page.tsx`, `app/view-lineup/[teamId]/page.tsx`

---

## 2. Lineup Screens — Remove Role Background Labels + Add "Playing XI" Header (Both)

**Problem:** Background section labels (Batsmen, Middle Order, Lower Order, Bowlers) add visual noise without much value. Each player already has their own role badge.

**Change:**
- Remove the role-grouped background sections from the pitch view
- Add a "PLAYING XI" header label at the top of the XI section (uppercase, 11px, bold, #1a1a2e, with subtle bottom border)
- Keep the "BENCH" section label (already exists)
- Individual player role badges (BAT/BOWL/ALL/WK) remain unchanged

**Files:** `app/lineup/page.tsx`, `app/view-lineup/[teamId]/page.tsx`

---

## 3. Read-Only Lineup — Dashboard-Style Header

**Problem:** The read-only lineup header is a flat grey bar. It should match the dashboard's premium gradient style.

**Change:** Replace the header with the dashboard gradient hero:
- Background: `linear-gradient(160deg, #1a0a3e 0%, #2d1b69 25%, #004BA0 50%, #0EB1A2 80%, #00AEEF 100%)`
- Decorative radial glow overlay (same as dashboard)
- Top row: back arrow + "{Manager}'s Lineup" + "🔒 Read Only" pill (translucent white, glassmorphic)
- "GAMEWEEK {N}" uppercase label with status badge (LIVE green pulse / FINAL grey)
- **Score trio** (same layout as dashboard):
  - **Average** (left) — GW average across all teams, right-aligned with left/right divider
  - **Points** (center, large 36px) — this team's GW score
  - **Highest** (right, clickable) — highest GW score, tapping navigates to that team's read-only lineup via `router.push(/view-lineup/{teamId}?gw={gwNumber})`
  - Dividers: 1px solid `rgba(255,255,255,0.12)`
- GW navigation: previous/next buttons in glassmorphic style (`background: rgba(255,255,255,0.1)`)

**Data requirements:** API must return league average and highest-scoring team ID + score for each GW. Add a new API endpoint or extend the existing leaderboard API (`GET /api/leaderboard/[leagueId]`) to return per-GW stats (average, highest team ID, highest score). The leaderboard already computes per-GW totals so this is an extension, not a new calculation.

**Files:** `app/view-lineup/[teamId]/page.tsx`, potentially API route for league stats

---

## 4. Edit Lineup — GW Opponent Display

**Problem:** The edit lineup shows each player's own IPL team code (MI, CSK) which is redundant — managers already know their players' teams. More useful is knowing which opponents they face in the upcoming GW.

**Change:** Replace the IPL team code under each player's name with their GW opponents:
- Show "vs {opponent}" for each match in the GW
- Each opponent on its own line (e.g., "vs GT" then "vs RR" for a 2-match GW)
- Teal color (#0d9488, from existing app palette) with font-weight 600
- Players with 2 matches naturally stand out (two "vs" lines vs one)
- No points shown on edit lineup (pre-match screen)
- Data source: match the player's IPL team against the GW fixtures table

**Example:**
```
Rohit Sharma          Bumrah
vs GT                 vs CSK
vs RR
```

**Files:** `app/lineup/page.tsx`, may need to fetch GW fixtures in the lineup data loader

---

## 5. Player Popup — GW Points Breakdown (Read-Only Lineup)

**Problem:** Clicking a player on the read-only lineup shows total points but no per-match breakdown.

**Change:** Add a "GW{N} Points Breakdown" section below the existing Fixtures row in the compact view of the player popup. No changes to the edit lineup popup.

**Layout (top to bottom, existing elements first):**
1. Player header — name, role badge, C/VC badge, total season points (existing)
2. Auction Price / Pts per Match cards (existing)
3. Fixtures row — past scores + upcoming dates (existing)
4. **NEW: GW Points Breakdown**
5. Full Profile button (existing, no Substitute button — read-only)

**Breakdown section:**
- Header: "GW{N} POINTS BREAKDOWN" (8px, uppercase, #999) + GW total in brand blue (#004BA0)
- One white card per match (`background: #fff`, `border: 1.5px solid #e8eaf0`, `border-radius: 12px`, subtle shadow)
- Match card header: "vs {opponent} · {date}" left-aligned + match total right-aligned (color-coded: green >30, amber ≥15, red <15)
- Scoring rows — 3-column layout per row:
  - **Category** (left, #555) — Runs, Fours, Sixes, 50 Bonus, Strike Rate, Starting XI, Catches, Wickets, etc.
  - **Formula** (center, bold #1a1a2e) — raw stat + scoring rule (e.g., "52 × 1pt", "6 × 4pts", "✓ 50+ runs", "144.4 >140")
  - **Points** (right, bold #004BA0) — fantasy points earned
- Only show categories where the player scored points (no zero rows)
- Breakdown updates when user navigates to a different GW via the header navigation

**Data requirements:** Need per-match scoring breakdown. The `performances` array in the player detail API already has raw stats (runs, balls, fours, sixes, wickets, overs, maidens, catches, stumpings, fantasyPoints) and the total fantasy points per match. To show the formula breakdown (e.g., "52 × 1pt = 16 pts"), apply the scoring rules from `lib/scoring/batting.ts`, `lib/scoring/bowling.ts`, etc. client-side to the raw stats. This avoids a new API endpoint — the raw stats + known scoring rules are sufficient to reconstruct the breakdown.

**Files:** `app/view-lineup/[teamId]/page.tsx`, possibly a shared scoring utility for client-side point calculation

---

## 6. Player Full Profile — IPL Stats Header

**Problem:** The full profile stats table shows T20 career row followed by season rows (2025, 2024, 2023) but nothing indicates those season rows are IPL stats.

**Change:** Insert an "IPL" divider row between the T20 career row and the season rows:
- Full-width row spanning all columns
- "IPL" text in blue (#004BA0), 9px, font-weight 800, uppercase, letter-spacing 1px
- Thin divider line (`1px solid rgba(0,75,160,0.15)`) extending to the right
- Apply to both batting and bowling tables
- Purely visual — no data or logic changes

**Files:** `app/view-lineup/[teamId]/page.tsx`, `app/lineup/page.tsx`, `app/players/page.tsx` (same full profile view is shared)

---

## 7. Scoring Engine — WK Powerplay Batting Chip Fix

**Problem:** The POWER_PLAY_BAT chip only gives bonus points to players with role `BAT`. Wicketkeepers are fundamentally batsmen in T20 cricket and should also receive the bonus.

**Change:** In the chip application logic, treat `WK` the same as `BAT` for the powerplay batting chip:

```typescript
// Before
if (playerRoles.get(pid) === 'BAT') {

// After
const role = playerRoles.get(pid)
if (role === 'BAT' || role === 'WK') {
```

**Role enum values:** `BAT`, `BOWL`, `ALL`, `WK` — only `WK` is the single wicketkeeper role (no variants).

**Chip usage:** Zero teams have used POWER_PLAY_BAT so far — no retroactive recalculation needed. But build the logic correctly so it works from the first usage.

**Testing:** Update existing unit tests in `tests/` to cover WK players receiving the powerplay batting bonus.

**Files:** `lib/scoring/multipliers.ts`, relevant test files

---

## Implementation Order

1. **Lineup screens** — C/VC badge + remove role backgrounds + Playing XI header (changes 1 & 2)
2. **Read-only lineup header** — dashboard-style gradient with score trio (change 3)
3. **Edit lineup opponents** — GW fixture display (change 4)
4. **Player popup breakdown** — per-match scoring with formulas (change 5)
5. **IPL stats header** — divider in full profile (change 6)
6. **WK chip fix** — scoring engine (change 7)

---

## Out of Scope

- Deadline timezone display (already implemented)
- Edit lineup player popup changes (no points to show pre-match)
- Retroactive chip recalculation (no usage exists)
