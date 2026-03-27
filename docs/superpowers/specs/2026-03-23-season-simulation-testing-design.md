# IPL Season Simulation & Validation Suite

**Date:** 2026-03-23
**Goal:** Validate the entire FAL platform — data integrity, scoring accuracy, user experience, and PRD compliance — by replaying a full IPL 2025 season in ~55 minutes (worst case) before the IPL 2026 launch on Friday March 28.

---

## Approach: Layered Confidence Pyramid

Six test layers at increasing scope, each catching different classes of bugs independently. If Layer 3 fails, Layers 0-2 results are still valid. A full teardown removes all simulation data afterward.

**Data source:** Real IPL 2025 match data from SportMonks API (season ID `1689`, 70 league fixtures only (playoffs excluded), 67 finished + 3 abandoned, March 22 – May 2025).

**Isolation:** All simulation data lives in a dedicated "IPL 2025 Simulation" league — completely separate from production 2026 data. Full cleanup after the run.

---

## Test Users

All users created via credentials provider. You can log in as any of them during the test run to watch data populate in real time.

| User | Email | Role | Strategy |
|---|---|---|---|
| Admin | `sim-admin@fal-test.com` | ADMIN | League management, roster upload |
| User 1 | `sim-user-1@fal-test.com` | USER | Smart (top performers) |
| User 2 | `sim-user-2@fal-test.com` | USER | Smart |
| User 3 | `sim-user-3@fal-test.com` | USER | Smart |
| User 4 | `sim-user-4@fal-test.com` | USER | Random |
| User 5 | `sim-user-5@fal-test.com` | USER | Random |
| User 6 | `sim-user-6@fal-test.com` | USER | Random |
| User 7 | `sim-user-7@fal-test.com` | USER | Random |
| User 8 | `sim-user-8@fal-test.com` | USER | Chip strategist (Power Play Bat on double-header week) |
| User 9 | `sim-user-9@fal-test.com` | USER | Chip strategist (Bowling Boost on wicket-friendly week) |
| User 10 | `sim-user-10@fal-test.com` | USER | Chip strategist (both chips, different weeks) |

**Password:** `sim-test-2025` (all accounts, min 6 chars enforced by login API)

---

## Setup Phase

1. **Seed 2025 players** — Call SportMonks `/teams/{id}/squad/1689` for all 10 IPL teams, upsert into Player table
2. **Create simulation league** — Dedicated league with `sim-admin@fal-test.com` as admin
3. **Generate 10 test user accounts** — `sim-user-1` through `sim-user-10` with password `sim-test-2025` (bcryptjs hashed)
4. **Build roster CSV** — Each user gets 15 players drafted from different IPL 2025 squads (realistic auction-style distribution)
5. **Upload roster** — Via `POST /api/leagues/[id]/roster`
6. **Import fixtures** — All 70 league matches + gameweeks from season 1689 via `importFixturesAndGameweeks()` (league stage only, playoffs excluded)
7. **Print login credentials** — Display all 11 accounts for manual QA during the run

---

## Layer 0 — Playwright UX + PRD Validation (~5 min)

Browser-based E2E tests running at 393px viewport (mobile-first per PRD). Tests validate both functionality and PRD compliance.

### Scenarios

| # | Scenario | Flow | PRD Assertions |
|---|----------|------|----------------|
| 1 | Admin uploads roster | Login as sim-admin (email + password) -> admin page -> upload CSV -> verify 10 teams | Teams populated with correct player counts |
| 2 | User views squad | Login as sim-user-1 -> squad page -> verify 15 players | Player names, roles, images, IPL team badges visible |
| 3 | User sets lineup — pitch view | Pick XI (11) + bench (4) -> assign captain & VC -> set bench priorities -> submit | Pitch view default; 4-3-3 formation; team-coloured player figures with head/body; C/VC badges on figures; team-coloured name plates; bench section below pitch |
| 4 | User sets lineup — list view | On lineup screen -> tap List View toggle -> assign captain via row action sheet -> move player to bench -> save | List view shows all 15 players; XI rows show C / VC / → Bench buttons; bench rows show priority number + → XI button; tapping a row opens action sheet with Make Captain, Make VC, Move to Bench options |
| 5 | User edits lineup | Load existing lineup -> swap player -> change captain -> save -> refresh | Changes persisted correctly after reload; pitch and list views both reflect saved state |
| 6 | User activates chip | Navigate to lineup -> tap Play on BOWLING_BOOST chip -> confirm in modal -> verify button shows Active -> tap Active to deactivate -> reactivate | Chip bar is compact single row (icon + name + Play button, no description); Play tapped → confirmation modal with description and warning; confirmed → button changes to Active (green); tap Active before GW lock → deactivates; once GW starts chip is locked |
| 7 | User views dashboard | Navigate to home (`/`) after GW1 scored | GW score, standings snapshot, deadline, match schedule visible; team name in hero top-right; league switcher pill visible top-left |
| 8 | User views GW score detail — list view | Tap GW score on dashboard -> sheet opens in list view (default) | Player breakdown with role icon, name, team, stats, points; captain shows 2× multiplier; bench section faded; summary bar shows base pts, C/VC bonus, chip bonus, total |
| 9 | User views GW score detail — pitch view | GW sheet open -> tap Pitch View toggle | Full 4-3-3 formation with team-coloured figures; GW points on name plates; captain plate highlighted; bench row below pitch |
| 10 | User views leaderboard | Navigate to leaderboard (after GW1 scored) | Rank movement indicators, GW/Total columns, tappable rows |
| 11 | User views standings | Navigate to standings page -> use GW selector | Full season table with GW selector tabs working |
| 12 | User views player stats | Players page -> click a player | Batting/bowling/fielding stat breakdown, role-specific tables |
| 13 | User views another manager's lineup — pitch view | Tap a manager on leaderboard -> view their lineup | Pitch view default; same design as own lineup screen (team-coloured figures, name plates showing GW points); Read Only badge in header; C/VC badges visible; no edit controls |
| 14 | User views another manager's lineup — list view | On view-lineup screen -> tap List View toggle | Read-only list: role icon, name, team, GW points per row; captain row shows 2× label; bench rows show priority numbers and are faded; summary bar shows total, captain, VC |
| 15 | League switcher — switch active league | Dashboard -> tap league pill (top left) -> sheet opens showing all leagues with active checkmark -> tap a different league | Sheet lists all user leagues; active league has checkmark; tapping another league updates pill label and dashboard data; sheet dismisses |
| 16 | League switcher — join a new league | Dashboard -> tap league pill -> tap Join a League -> enter invite code -> submit | Invite code input expands inline; on submit user joins league and it becomes active; league appears in switcher list |
| 17 | New user signs up | Go to login -> enter email + invite code + password -> submit | Account created, league visible on dashboard |
| 18 | Returning user logs in | Go to login -> enter email + password (no invite code) -> submit | Logged in, sees last active league |
| 19 | League switch persists | After switching league, navigate to lineup/leaderboard/standings -> verify all pages show data from the switched league | All pages respect activeLeagueId from DB |
| 20 | Invalid password rejected | Enter correct email + wrong password -> submit | Error message "Invalid password" shown |
| 21 | Password too short rejected | Enter email + invite code + 3-char password -> submit | Error message "Password must be at least 6 characters" |
| 22 | Dashboard shows active gameweek with matches | Login -> dashboard -> verify GW label and match cards | Active GW number visible, match cards show team codes and times |
| 23 | Lineup shows gameweek deadline | Navigate to lineup screen -> verify deadline info | Deadline label and countdown visible in header area |
| 24 | Move player from XI to bench — list view | Lineup list view -> tap XI player -> "Move to Bench" -> select bench player to swap | XI player moves to bench, bench player moves to XI |
| 25 | Move player from bench to XI — list view | Lineup list view -> tap bench player -> "Move to Playing XI" -> select XI player to swap | Bench player moves to XI, XI player moves to bench |
| 26 | Choose captain — list view | Lineup list view -> tap player -> "Make Captain" | Captain badge (C) appears on selected player, removed from previous captain |
| 27 | Choose vice captain — list view | Lineup list view -> tap player -> "Make Vice Captain" | VC badge appears on selected player |
| 28 | Save lineup and verify persistence | Make changes -> save -> reload page | Saved lineup restored correctly after reload |
| 29 | Player detail sheet — compact panel | Pitch view -> tap player -> sheet opens with fixtures and stats | Sheet shows player name, role, team, auction price, pts/match, fixtures row |
| 30 | Player detail sheet — fixtures row | Open player detail sheet -> verify fixture team codes | Fixtures show correct IPL team codes for opponents |
| 31 | Full Profile — batting/bowling tables | Player detail sheet -> tap "Full Profile" | Batting and/or bowling career stats tables visible |
| 32 | Full Profile — back button | Full Profile view -> tap "Back" | Returns to compact panel view |
| 33 | Players page — full profile | Players page -> tap player -> view batting table | Player modal shows batting stats, no GW tabs |
| 34 | Players page — playerId query param | Navigate to /players?playerId=X | Player modal auto-opens for specified player |
| 35 | Players page — bowling table | Players page -> tap a bowler | Bowling stats table visible for bowling players |
| 36 | Admin creates second league | Login as admin -> admin page -> create league | Second league created successfully |
| 37 | View-lineup shows saved lineup | Navigate to /view-lineup/[teamId] | Read-only lineup displays saved XI, bench, C/VC correctly |
| 38 | XI substitute shows bench section only | Lineup -> tap XI player -> "Move to Bench" | Swap sheet shows only bench players as candidates |
| 39 | Bench substitute shows full squad | Lineup -> tap bench player -> "Move to Playing XI" | Swap sheet shows XI players as candidates |
| 40 | Substitute from pitch view detail sheet | Pitch view -> tap player -> detail sheet -> "Substitute" | Swap selection sheet opens with correct candidates |
| 41 | Complete swap from substitute sheet | Select a swap candidate -> confirm -> save | Swap completes, lineup updated and saved |
| 42 | ISSUE-011: League switching updates UI immediately | Switch league via pill -> verify dashboard updates without reload | League pill label, standings, and GW data all update |
| 43 | ISSUE-011: League switch persists after hard reload | Switch league -> hard reload -> navigate to other pages | All pages show data from the switched league |
| 44 | Action sheet uses X button instead of Cancel | Lineup -> tap player -> action sheet opens | X close button (44px) at top-right, no Cancel button at bottom, no drag handle |
| 45 | Swap selection sheet uses X button | Lineup -> move player -> swap sheet opens | X close button at top-right, no Cancel button, no drag handle |
| 46 | Dashboard "Your Points" navigates to read-only lineup | Dashboard -> tap "Your Points" | Navigates to /view-lineup/[teamId] with pitch view default |
| 47 | Dashboard "Highest" navigates to top GW scorer's lineup | Dashboard -> tap "Highest" score | Navigates to /view-lineup/[teamId] of the manager with highest current GW score |
| 48 | Bottom nav Lineup links to read-only lineup | Dashboard -> tap "Lineup" in bottom nav | Navigates to /view-lineup/[teamId] (read-only), not /lineup (edit) |
| 49 | Standings "You" row is clickable | Standings -> tap own row | Navigates to /view-lineup/[teamId] (same as rival managers) |
| 50 | Read-only lineup — players clickable (pitch view) | View-lineup pitch view -> tap any player | Player stats popup opens with auction price, pts/match, fixtures |
| 51 | Read-only lineup — players clickable (list view) | View-lineup list view -> tap any player | Player stats popup opens |
| 52 | Read-only popup — no edit actions | View-lineup -> tap player -> popup opens | No Captain/VC checkboxes, no Substitute button; only Full Profile button (full width) |
| 53 | Read-only popup — Full Profile | View-lineup -> tap player -> "Full Profile" | Batting/bowling career stats tables visible; Back button returns to compact view |

### PRD Design Assertions

| PRD Requirement | Assertion |
|---|---|
| Pitch-style layout (4-3-3 formation) | XI slots rendered in correct formation, bench section separate |
| Team-coloured player figures | Each player card shows head circle + body/torso in IPL team gradient colours |
| Captain badge shows 2x | `[data-role="CAPTAIN"]` badge visible on figure; name plate highlighted |
| Vice Captain badge shows VC | `[data-role="VC"]` badge visible on VC player figure |
| Team-coloured name plates | Each name plate background matches player's IPL team colour |
| Lineup pitch/list toggle | Toggle pill (Pitch View / List View) visible on lineup screen; both views render correctly |
| List view — XI edit actions | Each XI row shows C / VC / → Bench inline buttons; tapping row opens action sheet |
| List view — bench rows | Priority number badge (1–4) visible; → XI button present; bench section labelled "Bench — Auto-sub order" |
| List view — action sheet | Make Captain / Make VC / Move to Bench (or Move to XI / Change Priority for bench) options present; X close button (44px) at top-right, no Cancel button, no drag handle |
| Chip bar compact design | Chips bar is single horizontal row per chip: icon + name + Play button; no description text visible in bar |
| Chip Play button flow | Play tapped → confirmation modal; confirmed → button shows "Active" in green; tap Active before lock → deactivates |
| Chip confirmation modal — chip can be reverted until GW starts | Modal text contains description and warning; chip reverts on tap until GW lock |
| Used chip shows "Used GW N" badge | Badge text present, chip row greyed out |
| GW score sheet — list/pitch toggle | Toggle pill (List View / Pitch View) visible inside GW score sheet; list view is default |
| GW score sheet — pitch view | Full 4-3-3 formation with team-coloured figures; GW points on name plates; bench row below |
| View-lineup matches lineup design | Read-only view uses identical player figure design (team-coloured head/body, name plates with GW points) |
| View-lineup pitch/list toggle | Toggle pill visible on view-lineup screen; list view shows GW points, read-only |
| View-lineup players are clickable | Tapping any player (pitch or list view) opens stats popup with auction price, pts/match, fixtures, and Full Profile |
| View-lineup popup is read-only | Stats popup shows no Captain/VC checkboxes, no Substitute button; only full-width Full Profile button |
| Dashboard "Your Points" navigates to read-only lineup | Tapping "Your Points" navigates to /view-lineup/[teamId] defaulting to pitch view |
| Dashboard "Highest" navigates to top GW scorer | Tapping "Highest" links to the manager with the highest current GW score (not total) |
| Bottom nav Lineup links to read-only view | Lineup button in bottom nav navigates to /view-lineup/[teamId], not /lineup (edit mode) |
| Standings "You" row is clickable | Own row in standings navigates to /view-lineup/[teamId] same as rival manager rows |
| Action sheets use X close button | All bottom sheets (action sheet, swap sheet, stats sheet) use 44px X button at top-right instead of Cancel button and drag handle |
| Dashboard league switcher pill | Pill button (top-left of hero) shows active league name; tapping opens bottom sheet |
| League sheet — multi-league list | Sheet lists all user leagues with active checkmark; tapping a league switches active league |
| League sheet — join a league | "Join a League" row expands inline invite code input + Join button |
| Lock time prevents edits | Submit button disabled / 423 after lock |
| Role badge colors (BAT=#F9CD05, BOWL=#a0c4ff, ALL=#0EB1A2, WK=#EA1A85) | CSS color values on role badges |
| Leaderboard rank movement indicators | Movement arrows present after GW2 |
| Bottom nav: Home, Lineup, Players, League | 4 nav tabs with correct labels |
| Light theme (#f2f3f8 base) per PRD | Background color assertion |
| Mobile-first (393px) | All tests run at 393px viewport |
| Active league persists across pages | All pages (dashboard, lineup, leaderboard, standings) show data from `activeLeagueId` stored in DB |
| Default league fallback | Single-league users see their league without needing to select (null activeLeagueId = first league) |
| Login requires password | Password field visible, required on all login modes |
| Join league from admin page | "Join a League" card with invite code input visible on admin page |

### Screenshot Baselines

Playwright's `toHaveScreenshot()` captures baseline screenshots on first run, flags pixel-level regressions on subsequent runs. Covers:

| Screen | State captured |
|---|---|
| Login page | Password field visible |
| Dashboard | League switcher pill (top-left), team name (top-right), GW score, standings |
| Dashboard — GW sheet (list view) | Player breakdown open, list view active (default) |
| Dashboard — GW sheet (pitch view) | Pitch toggle active, formation with GW points on plates |
| Dashboard — league switcher sheet | Sheet open with 2 leagues, active checkmark, Join a League row |
| Lineup — pitch view | Formation with team-coloured figures, compact chips bar |
| Lineup — list view | Player rows with C/VC/bench buttons visible |
| Lineup — chip active | Play button shows "Active" in green |
| View lineup — pitch view | Read-only pitch with GW points on name plates |
| View lineup — list view | Read-only player list with GW points and priority numbers |
| Leaderboard | Rank movement arrows, GW/Total columns |
| Standings | Full season table with GW selector |
| Player detail | Stat breakdown modal |
| Admin page | Join a League card with invite code input |
| Action sheet — X close button | Player action sheet with 44px X button, no Cancel, no drag handle |
| View lineup — player stats popup | Read-only stats popup with auction price, pts/match, fixtures, full-width Full Profile button |
| View lineup — Full Profile | Career batting/bowling stats tables in read-only popup |

### Additional PRD Flow Tests

| Test | Assertion |
|---|---|
| Season start gate | Admin cannot start season until all squads have min 12 players — attempt with incomplete roster, expect rejection |
| Invite code join (login) | New user signs up with email + invite code + password, account created and league joined |
| Invite code join (admin page) | Logged-in user joins second league via `POST /api/leagues/join` with invite code |
| Returning user login | Existing user logs in with email + password only (no invite code), sees last active league |
| Invalid password rejected | Wrong password returns 401 "Invalid password" |
| Password too short rejected | Password < 6 chars returns 400 |
| Multi-league switching | User with 2 leagues can switch active league via dashboard or admin page, all pages reflect the switch |
| Default league fallback | User with no `activeLeagueId` set sees their first league (backwards compatible) |
| Auto-set on first join | New user joining via invite code gets `activeLeagueId` auto-set to that league |
| Join switches active league | Using invite code for League B while in League A switches activeLeagueId to League B |
| All teams have exactly 15 players | Each of the 10 test teams has exactly 15 players after roster upload |

---

## Layer 1 — Seed & Roster Validation (~2 min)

- Seed all IPL 2025 players from SportMonks
- Create simulation league + 10 test users
- Generate and upload roster CSV
- **Assertions:**
  - 10 teams created
  - 15 players per team
  - No duplicate players across teams
  - Purchase prices set correctly
  - Squad sizes within min/max bounds (12-15)

---

## Layer 2 — Lineup Lifecycle (~3 min)

For gameweeks 1, mid-season, and last gameweek (dynamically determined from fixture import — IPL 2025 may not be exactly 10 GWs):

### User Strategy Distribution

- **Users 1-3 (Smart):** Pick top performers for XI, best batter as captain, rotate VC
- **Users 4-7 (Random):** Valid random XI/bench/captain/VC combinations — catches edge cases like bench auto-sub when random pick didn't play
- **Users 8-10 (Chip Strategists):** Follow the chip strategy guide:
  - User 8: Power Play Bat + batting captain on a double-header week (4x ceiling)
  - User 9: Bowling Boost + bowling captain when best bowler has two matches
  - User 10: Both chips on different weeks for maximum coverage

### Specific Tests

- All 10 users submit lineups with their strategy for each GW
- **GW1 no-lineup:** User 7 skips GW1 entirely (no previous lineup to carry forward), verify they score 0 for GW1
- **Carry-forward:** Skip lineup submission for users 4-5 in mid-season GW, verify previous GW lineup carries
- **Lock enforcement:** Attempt submission after lock time, expect HTTP 423
- **One chip per GW enforcement:** User 10 attempts to activate both chips in the same GW, expect rejection
- **Assertions:**
  - Exactly 11 XI + 0-4 bench per lineup
  - Exactly 1 captain, 1 VC, different players
  - Bench priorities sequential (1, 2, 3, 4)
  - All players from user's own squad
  - Chip usage recorded as PENDING
  - Second chip activation in same GW rejected

---

## Layer 3 — Score All 70 League Matches (~15 min)

- Fetch scorecards from SportMonks for all 70 league fixtures (season 1689, playoffs excluded)
- Process in batches of 8 (respect API rate limits)
- Run through scoring pipeline: `scoreMatch()` for each fixture
- Handle 3 abandoned matches (expect CANCELLED status, no scoring)

### Assertions Per Match

- PlayerPerformance records created for all lineup players
- Fantasy points non-null
- Batting stats: runs, balls, fours, sixes, strike rate populated
- Bowling stats: overs, wickets, economy, maidens, dot balls populated
- Fielding stats: catches, stumpings, runouts (direct + assisted) populated where applicable

### Complete Scoring Rule Verification (per PRD Section 6)

**Batting (PRD 6.1):**
- +1 per run, +4 four bonus, +6 six bonus
- Milestones stack below 100: 25->+4, 50->+8, 75->+12 (75 runs = +4+8+12 = +24)
- Century replaces all lower milestones: 100->+16 only (not cumulative)
- Duck: -2 (BAT/WK/ALL only, bowlers exempt, requires >= 1 ball faced)
- Strike Rate (min 10 balls faced, bowlers exempt): >170->+6, 150-170->+4, 130-150->+2, 70-130->0, 60-70->-2, 50-60->-4, <50->-6

**Bowling (PRD 6.2):**
- Wicket: +30, LBW/Bowled bonus: +8 additional per wicket
- Wicket bonuses: 3-wicket->+4, 4-wicket->+8, 5-wicket->+12
- Maiden over: +12
- Dot ball: +1
- Economy Rate (min 2 overs bowled): <5->+6, 5-6->+4, 6-7->+2, 7-10->0, 10-11->-2, 11-12->-4, >12->-6

**Fielding (PRD 6.3):**
- Catch: +8, 3-catch bonus: +4 (one-time)
- Stumping: +12
- Run out direct: +12
- Run out assisted: +6 each to last 2 fielders

**Other:**
- Starting XI bonus: +4
- Impact player sub: +4

### Golden Player Verification

Pick 5-10 players from IPL 2025 with diverse stat lines and hand-compute expected fantasy points to verify scoring engine accuracy:

| Player Type | What It Validates |
|---|---|
| Century scorer (100+ runs) | Milestone replacement rule (100->+16 only, not cumulative) |
| 75-run scorer | Milestone stacking (25+50+75 = +24) |
| 5-wicket haul with LBW/Bowled | Wicket bonus (+12) + LBW/Bowled bonus stacking |
| Duck by a batter vs duck by a bowler | Batter gets -2, bowler exempt |
| SR < 50 with 10+ balls | Strike rate penalty (-6) |
| Economy > 12 with 2+ overs | Economy rate penalty (-6) |
| 3+ catches in a match | Catch points + 3-catch bonus (+4) |
| Player with 2 matches in one GW | Multi-match point accumulation before multipliers |
| Player in starting XI + impact player | Both bonuses: +4 + +4 |

Hand-computed expected values stored in `tests/simulation/golden-players.json` and compared against actual PlayerPerformance records.

### Admin Scoring Trigger

Score at least one match via `POST /api/scoring/import` (the production admin trigger) rather than calling `scoreMatch()` directly, to validate the full API-triggered scoring path.

---

## Layer 4 — Gameweek Aggregation & Season Replay (~10 min)

Aggregate all gameweeks sequentially (must be in order for carry-forward + cumulative points).

### Per Gameweek

Pipeline order follows PRD Section 9 exactly:

1. Build "played set" (players in starting XI or impact)
2. **Bench auto-subs** (by benchPriority order) — absent XI members replaced by bench in priority order
3. **Compute base points** — sum of all PlayerPerformance fantasy points per player across all GW matches (multi-match accumulation)
4. **Apply captain (2x) / VC multipliers** to base points:
   - Captain played: captain gets 2x; VC stays 1x
   - Captain absent: VC promoted to 2x
5. **Apply chip effects** (if active) — multiplicative with captain:
   - POWER_PLAY_BAT: Doubles all BAT-role players' points (captain who is BAT = 2x captain * 2x chip = **4x**)
   - BOWLING_BOOST: Doubles all BOWL-role players' points (captain who is BOWL = 2x captain * 2x chip = **4x**)
6. Create PlayerScore + GameweekScore records
7. Update Team.totalPoints and bestGwScore
8. Mark ChipUsage as USED

### Assertions

- Leaderboard rankings correct (total points desc, tiebreaker by best GW score)
- Chips marked USED after activation gameweek
- Cumulative totalPoints monotonically increasing per team
- No team has more than 1 of each chip used across the season
- GameweekScore records exist for every team x every gameweek
- bestGwScore equals the maximum GameweekScore for each team

---

## Layer 5 — Edge Cases (~5 min)

| Edge Case | Test |
|---|---|
| Abandoned match | No points awarded, match status CANCELLED |
| Super over match (if any in 2025) | Super over scoring excluded per pipeline |
| Captain absent entire GW | VC promoted to 2x, bench sub fills captain slot |
| Both captain and VC absent | No multipliers applied, both get bench subs |
| Multiple XI gaps in one GW | Each gets separate bench sub, no double-dipping |
| Chip + captain stacking (BAT captain + PPB) | 4x points (2x captain * 2x chip) verified |
| Chip + captain stacking (BOWL captain + BB) | 4x points (2x captain * 2x chip) verified |
| Bench sub when all bench players also absent | No sub applied, player gets 0 points |
| Player appears as impact sub but not in starting XI | Gets +4 impact bonus, points counted |
| GW1 with no lineup submitted | User scores 0 (no previous lineup to carry forward) |
| Player plays 2 matches in one GW | Points accumulate across both matches before multipliers |
| Milestone stacking: 75 runs | 25+50+75 milestone bonuses all applied (+24 total) |
| Milestone replacement: 100 runs | Only century bonus applied (+16, not cumulative) |

---

## Execution & Orchestration

### Entry Point

```bash
npm run simulate
```

Runs `scripts/simulate-season.ts` which orchestrates all layers.

### Execution Flow

```
SETUP  ->  LAYER 0  ->  LAYER 1  ->  LAYER 2  ->  LAYER 3  ->  LAYER 4  ->  LAYER 5  ->  TEARDOWN
```

### Behaviors

- **Fail-fast per layer, continue option:** If a layer fails, log failure and prompt whether to continue or abort
- **Resumable:** Each layer checks if precondition data exists — can re-run from any layer without re-seeding
- **Dual mode:** `TEST_BASE_URL` env var controls target:
  - `http://localhost:3000` (default) — local dev server
  - `https://your-app.vercel.app` — full stack against Vercel deployment
- **Live QA:** Login credentials printed at setup for manual browsing during the run

### Result Logging

Each run produces two files in `tests/simulation/results/`:

**`run-YYYY-MM-DDTHH-mm-ss.json`** — Machine-readable:
```json
{
  "runId": "2026-03-23T14:30:00",
  "duration": "38m 42s",
  "targetUrl": "http://localhost:3000",
  "layers": {
    "layer0_ux": { "status": "passed", "tests": 21, "passed": 21, "failed": 0, "screenshots": 28 },
    "layer1_roster": { "status": "passed", "tests": 6, "passed": 6, "failed": 0 },
    "layer2_lineups": { "status": "passed", "tests": 22, "passed": 22, "failed": 0 },
    "layer3_scoring": { "status": "passed", "matches": 70, "scored": 67, "abandoned": 3, "golden_players_verified": 9 },
    "layer4_aggregation": { "status": "passed", "gameweeks_dynamic": true, "assertions": 180 },
    "layer5_edge_cases": { "status": "passed", "tests": 13, "passed": 13, "failed": 0 }
  },
  "leaderboard_final": [
    { "rank": 1, "team": "sim-user-8", "points": 4821, "bestGw": 623 }
  ],
  "failures": [],
  "prd_coverage": { "total_requirements": 24, "covered": 24, "uncovered": 0 }
}
```

**`run-YYYY-MM-DDTHH-mm-ss.log`** — Human-readable with timestamps:
```
[14:30:00] === SETUP ===
[14:30:01] Seeding 2025 players from SportMonks (season 1689)...
[14:30:15] Created simulation league: IPL 2025 Simulation (id: clxyz...)
[14:30:16] Login credentials:
           sim-admin@fal-test.com / sim-test-2025 (ADMIN)
           sim-user-1@fal-test.com / sim-test-2025 (Smart)
           ...
[14:30:18] === LAYER 0: Playwright UX ===
[14:30:18] [1/7] Admin uploads roster... PASSED
...
```

Failed assertions include full context: expected vs actual, match ID, gameweek number, user email.

---

## Teardown

Deletes all simulation data in FK order:

1. ChipUsage
2. GameweekScore
3. PlayerScore
4. LineupSlot
5. Lineup
6. PlayerPerformance
7. TeamPlayer
8. Team
9. Match
10. Gameweek
11. League
12. Test user accounts (`sim-*@fal-test.com`)
13. 2025-only players — identified by cross-referencing with 2026 squad data. If 2026 squad not yet seeded, skip player deletion (leaving 2025 players in the table is harmless since they won't appear in any active league)

---

## Dependencies

- **SportMonks API** — Required for Layer 3 (scoring). All other layers can run with pre-cached data.
- **Playwright** — Required for Layer 0 only. Install via `npx playwright install`.
- **Local PostgreSQL or Neon** — Database must be accessible.
- **Next.js dev server** — Required for Layer 0 (Playwright) and HTTP mode.

---

## Timeline

| Layer | Estimated Time | What It Validates |
|---|---|---|
| Setup | ~2 min | Data seeding, fixture import |
| Layer 0 | ~12 min | UX flows (21 scenarios), PRD compliance, visual regression, auth, league switching, pitch/list toggles, chip flow |
| Layer 1 | ~2 min | Roster upload, squad integrity, season start gate |
| Layer 2 | ~4 min | Lineup rules, carry-forward, lock enforcement, chip constraints |
| Layer 3 | ~15 min | Scoring accuracy for all 70 league matches + golden player verification |
| Layer 4 | ~10 min | Aggregation, bench subs, multipliers, chip stacking, leaderboard |
| Layer 5 | ~7 min | Edge cases (13 scenarios) |
| Teardown | ~1 min | Cleanup |
| **Total** | **~52 min** (plan for ~60 min worst case with API latency) | |
