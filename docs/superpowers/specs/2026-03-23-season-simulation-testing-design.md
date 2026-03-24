# IPL Season Simulation & Validation Suite

**Date:** 2026-03-23
**Goal:** Validate the entire FAL platform — data integrity, scoring accuracy, user experience, and PRD compliance — by replaying a full IPL 2025 season in ~55 minutes (worst case) before the IPL 2026 launch on Friday March 28.

---

## Approach: Layered Confidence Pyramid

Six test layers at increasing scope, each catching different classes of bugs independently. If Layer 3 fails, Layers 0-2 results are still valid. A full teardown removes all simulation data afterward.

**Data source:** Real IPL 2025 match data from SportMonks API (season ID `1689`, 74 fixtures, 71 finished + 3 abandoned, March 22 – June 3 2025).

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
6. **Import fixtures** — All 74 matches + gameweeks from season 1689 via `importFixturesAndGameweeks()`
7. **Print login credentials** — Display all 11 accounts for manual QA during the run

---

## Layer 0 — Playwright UX + PRD Validation (~5 min)

Browser-based E2E tests running at 393px viewport (mobile-first per PRD). Tests validate both functionality and PRD compliance.

### Scenarios

| # | Scenario | Flow | PRD Assertions |
|---|----------|------|----------------|
| 1 | Admin uploads roster | Login as sim-admin (email + password) -> admin page -> upload CSV -> verify 10 teams | Teams populated with correct player counts |
| 2 | User views squad | Login as sim-user-1 -> squad page -> verify 15 players | Player names, roles, images, IPL team badges visible |
| 3 | User sets lineup | Pick XI (11) + bench (4) -> assign captain & VC -> set bench priorities -> submit | Pitch-style layout, captain badge shows 2x, bench priorities sequential |
| 4 | User edits lineup | Load existing lineup -> swap player -> change captain -> save -> refresh | Changes persisted correctly after reload |
| 5 | User activates chip | Navigate to lineup -> activate POWER_PLAY_BAT -> confirm | Confirmation modal with "cannot be undone" warning, chip shown as active |
| 6 | User views dashboard | Navigate to home (`/`) after GW1 scored | GW score, standings snapshot, deadline, match schedule visible |
| 7 | User views leaderboard | Navigate to leaderboard (after GW1 scored) | Rank movement indicators, GW/Total columns, tappable rows |
| 8 | User views standings | Navigate to standings page -> use GW selector | Full season table with GW selector tabs working |
| 9 | User views player stats | Players page -> click a player | Batting/bowling/fielding stat breakdown, role-specific tables |
| 10 | User views another manager's lineup | Tap a manager on leaderboard -> view their lineup | Read-only pitch view, correct XI/bench/captain shown |
| 11 | New user signs up | Go to login -> enter email + invite code + password -> submit | Account created, league visible on dashboard |
| 12 | Returning user logs in | Go to login -> enter email + password (no invite code) -> submit | Logged in, sees last active league |
| 13 | User joins second league from admin page | Login -> admin page -> "Join a League" card -> enter invite code -> join | Joined league, auto-switched to new league, league switcher shows both |
| 14 | Admin switches league | Login as sim-admin -> admin page -> league switcher -> tap different league -> verify dashboard updates | League switcher shows both leagues, active league highlighted, dashboard data updates |
| 15 | League switch persists | After switching league, navigate to lineup/leaderboard/standings -> verify all pages show data from the switched league | All pages respect activeLeagueId from DB |
| 16 | Invalid password rejected | Enter correct email + wrong password -> submit | Error message "Invalid password" shown |
| 17 | Password too short rejected | Enter email + invite code + 3-char password -> submit | Error message "Password must be at least 6 characters" |

### PRD Design Assertions

| PRD Requirement | Assertion |
|---|---|
| Pitch-style layout (2-4-5 formation) | XI slots rendered in correct formation, bench section separate |
| Captain badge shows 2x | `[data-role="CAPTAIN"]` badge visible |
| Chip confirmation modal with "cannot be undone" | Modal text contains warning |
| Used chip shows "Used GW N" badge | Badge text present, chip button disabled |
| Lock time prevents edits | Submit button disabled / 423 after lock |
| Role badge colors (BAT=#F9CD05, BOWL=#a0c4ff, ALL=#0EB1A2, WK=#EA1A85) | CSS color values on role badges |
| Leaderboard rank movement indicators | Movement arrows present after GW2 |
| Bottom nav: Home, Lineup, Players, League | 4 nav tabs with correct labels |
| Light theme (#f2f3f8 base) per PRD | Background color assertion |
| Mobile-first (393px) | All tests run at 393px viewport |
| League selector in admin/settings | Switcher visible when user has multiple leagues, active league highlighted |
| Active league persists across pages | All pages (dashboard, lineup, leaderboard, standings) show data from `activeLeagueId` stored in DB |
| Default league fallback | Single-league users see their league without needing to select (null activeLeagueId = first league) |
| Login requires password | Password field visible, required on all login modes |
| Join league from admin page | "Join a League" card with invite code input visible on admin page |
| Dashboard league switcher | "Your Leagues" card visible on dashboard when user has 2+ leagues |

### Screenshot Baselines

Playwright's `toHaveScreenshot()` captures baseline screenshots on first run, flags pixel-level regressions on subsequent runs. Covers: login page (with password field), dashboard (with league switcher), admin page (with join league card), lineup builder, leaderboard, standings, player detail, view lineup.

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

## Layer 3 — Score All 74 Matches (~15 min)

- Fetch scorecards from SportMonks for all 74 fixtures (season 1689)
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
    "layer0_ux": { "status": "passed", "tests": 17, "passed": 17, "failed": 0, "screenshots": 24 },
    "layer1_roster": { "status": "passed", "tests": 6, "passed": 6, "failed": 0 },
    "layer2_lineups": { "status": "passed", "tests": 22, "passed": 22, "failed": 0 },
    "layer3_scoring": { "status": "passed", "matches": 74, "scored": 71, "abandoned": 3, "golden_players_verified": 9 },
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
| Layer 0 | ~10 min | UX flows (17 scenarios), PRD compliance, visual regression, auth, league switching |
| Layer 1 | ~2 min | Roster upload, squad integrity, season start gate |
| Layer 2 | ~4 min | Lineup rules, carry-forward, lock enforcement, chip constraints |
| Layer 3 | ~15 min | Scoring accuracy for all 74 matches + golden player verification |
| Layer 4 | ~10 min | Aggregation, bench subs, multipliers, chip stacking, leaderboard |
| Layer 5 | ~7 min | Edge cases (13 scenarios) |
| Teardown | ~1 min | Cleanup |
| **Total** | **~52 min** (plan for ~60 min worst case with API latency) | |
