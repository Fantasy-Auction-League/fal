# FAL — Fantasy Auction League Design Specification

## 1. Product Overview

FAL is a fantasy cricket platform for IPL where teams are built via auction (manual in Phase 1) and compete based on real-world player performance across a season of gameweeks.

**Target Platform:** Mobile-first responsive web app
**Tech Stack:** Next.js + TypeScript, PostgreSQL + Prisma, Auth.js, deployed on Vercel
**Architecture:** Monolithic Next.js (Phase 1) — single app handling frontend, API routes, and scoring logic

## 2. Phase 1 Scope

**In Scope:**
- League creation & invite system (private leagues only)
- Admin uploads team rosters (manual auction)
- Weekly lineup management (Playing XI, Captain, VC, bench order)
- Post-match scoring automation via cricket data APIs
- Bench auto-substitution
- 4 strategy chips (Triple Captain, Bench Boost, Powerplay, Bowling Boost)
- Leaderboard tracking
- API-sourced IPL player registry (SportMonks Cricket API, €29/mo)

**Out of Scope (Phase 2+):**
- Real-time auction engine with WebSockets
- Live bidding ($100M budget, $1M starting price, 10s timer)
- Dynamic player market pricing
- Mid-season auction (after 30 IPL matches)
- Player trading between managers
- Public leagues
- AI lineup suggestions, advanced analytics

## 3. Core Game Loop

### Season Lifecycle:
1. **Pre-Season:** Admin creates league → Managers join via invite code → Admin uploads rosters
2. **Lineup Submission:** Managers set Playing XI, Captain, VC, bench order, optional chip
3. **Lineup Lock:** Locks at the start of the first IPL match of the gameweek (Mon–Sun)
4. **Matches Played:** IPL matches happen during the gameweek
5. **Scoring:** Stats imported → Base points calculated → Bench subs applied → Captain/VC multipliers → Chip effects → Gameweek total aggregated
6. **Leaderboard Update:** Team scores ranked → Season totals updated → Cycle repeats

## 4. League Structure

### Configuration:
| Parameter | Value |
|---|---|
| Managers per league | 2–15 |
| Squad size per team | 12–15 players |
| Season | IPL only |
| Gameweek window | Monday – Sunday |
| League visibility | Private only (invite code) |
| Player uniqueness | Unique within a league, can appear across leagues |

### League Lifecycle:
Admin creates league → Invite code generated → Managers join → Admin uploads rosters → Season begins

### User Roles:

**League Admin:**
- Create league, invite managers (share code)
- Upload/edit team rosters
- Manage league settings, remove managers
- Also acts as a team manager

**Team Manager:**
- Join league via invite code
- Submit weekly lineup (Playing XI, Captain, VC, bench order)
- Activate strategy chips
- View leaderboard & scores

### Validation Rules:
- Cannot join a league that has reached max managers (15)
- Cannot assign a player to multiple teams within the same league
- Roster must meet min squad size (12) before season can start
- Admin cannot start season until all teams have valid rosters

## 5. Team Composition & Lineup Rules

### Squad Structure:
- Squad: 12–15 players
- Playing XI: 11 players selected from squad
- Bench: 1–4 remaining players

### Weekly Lineup Submission:
Each gameweek, managers submit:
- **Playing XI** — 11 players from squad
- **Captain** — 2x point multiplier
- **Vice Captain** — 1.5x point multiplier
- **Bench Priority** — ordered 1→4 for auto-substitution
- **Strategy Chip** (optional) — one of 4 chips, once per season each

### Lineup Lock:
- **Trigger:** Start time of the first IPL match of the gameweek
- **After lock:** No edits to lineup, captain, bench order, or chip
- **No submission:** Carry forward previous gameweek's lineup (if first week, empty = 0 points)

## 6. Scoring System

### Base Scoring Rules (aligned with Dream11 T20):

**Batting:**
| Event | Points | Conditions |
|---|---|---|
| Run | +1 | |
| Boundary Bonus (four) | +4 | |
| Six Bonus | +6 | |
| 25 Run Bonus | +4 | |
| Half-Century (50) Bonus | +8 | |
| 75 Run Bonus | +12 | |
| Century Bonus | +16 | Only century points awarded — no 25/50/75 bonus stacking |
| Duck | -2 | Batter, WK, All-Rounder only (bowlers exempt) |

**Bowling:**
| Event | Points | Conditions |
|---|---|---|
| Dot Ball | +1 | |
| Wicket (excl. run out) | +30 | |
| LBW / Bowled Bonus | +8 | On top of wicket points |
| 3 Wicket Bonus | +4 | |
| 4 Wicket Bonus | +8 | |
| 5 Wicket Bonus | +12 | |
| Maiden Over | +12 | |

**Fielding:**
| Event | Points | Notes |
|---|---|---|
| Catch | +8 | Awarded to the catching fielder |
| 3 Catch Bonus | +4 | One-time bonus (6 catches still = +4, not +8) |
| Stumping | +12 | Awarded to the wicketkeeper |
| Run Out (direct hit) | +12 | Only 1 fielder touched the ball after delivery |
| Run Out (not direct hit — each) | +6 | Last 2 fielders who touched ball get 6 pts each |

**Run Out Attribution Rule:** A direct hit is inflicted by the fielder who is the only one to touch the ball after the batter faces the delivery. In all other cases, points are awarded to the **last 2 fielders** who touch the ball (6 pts each).

**Economy Rate (min 2 overs bowled):**
| Economy Rate | Points |
|---|---|
| Below 5 | +6 |
| 5 – 5.99 | +4 |
| 6 – 7 | +2 |
| 7.01 – 9.99 | 0 (neutral) |
| 10 – 11 | -2 |
| 11.01 – 12 | -4 |
| Above 12 | -6 |

**Strike Rate (min 10 balls faced, bowlers exempt):**
| Strike Rate | Points |
|---|---|
| Above 170 | +6 |
| 150.01 – 170 | +4 |
| 130 – 150 | +2 |
| 70.01 – 129.99 | 0 (neutral) |
| 60 – 70 | -2 |
| 50 – 59.99 | -4 |
| Below 50 | -6 |

**Other:**
| Event | Points |
|---|---|
| In announced lineup (Starting XI) | +4 |
| Concussion / Impact Player sub | +4 |

### Multipliers:
- Captain: 2x
- Vice Captain: 1.5x

### Milestone Bonus Rules:
- Century bonus **replaces** all lower milestones (a player scoring 100 gets +16 for century only, NOT +4 for 25 + +8 for 50 + +12 for 75 + +16 for 100)
- Below century, milestones stack normally: a player scoring 75 gets +4 (25 bonus) + +8 (50 bonus) + +12 (75 bonus) = +24 in milestone bonuses
- Overthrow runs credit to batter on strike, but no boundary bonus on overthrow boundaries
- Super Over does not count for fantasy points

## 7. Strategy Chips

4 chips, each usable once per season. One chip per gameweek. Selected before lineup lock.

| Chip | Effect |
|---|---|
| **Triple Captain** | Designate a 3rd player (not Captain or VC) as Triple Captain — earns 3× points for that gameweek |
| **Bench Boost** | Bench player points also count |
| **Bat Boost** | All players with BAT role get their total points doubled (2x) for the gameweek |
| **Bowl Boost** | All players with BOWL role get their total points doubled (2x) for the gameweek |

### Chip + Multiplier Stacking:
Multipliers stack **multiplicatively** with category chips. Examples:
- Captain (2x) who is a BAT + Bat Boost active = 2x × 2x = **4x total points**
- Captain (2x) who is a BOWL + Bowl Boost active = 2x × 2x = **4x total points**
- Triple Captain (3x) who is a BAT + Bat Boost active = 3x × 2x = **6x total points**
- Only one chip per gameweek, so Triple Captain cannot combine with Bat Boost or Bowl Boost

### Triple Captain Rules:
- The Triple Captain must be a **different player** from both Captain and Vice Captain
- Triple Captain earns **3x points** for that gameweek only
- In a TC gameweek, three players have multipliers: Captain (2x) + VC (1.5x) + Triple Captain (3x)
- The Triple Captain selection is part of the lineup submission and locked at gameweek lock

## 8. Bench Substitution

### Rules:
- **Trigger:** A Playing XI player does not appear in any match during the gameweek
- **Resolution:** System checks bench in priority order (Bench 1 → 2 → 3 → 4)
- **Replacement:** First bench player who played in at least one match
- **Fallback:** If no bench player played → position scores 0

### Edge Cases:
- Multiple XI players absent → each gets a separate bench sub (in bench priority order, no double-dipping)
- Captain didn't play → bench sub replaces them but does NOT inherit captain multiplier. Vice captain gets promoted to captain (2x). No new VC assigned.
- Vice captain didn't play → bench sub replaces them, no multiplier inheritance
- Both captain and VC didn't play → no multipliers applied to anyone (except Triple Captain if active and that player played)
- Triple Captain didn't play (chip active) → bench sub replaces them but does NOT inherit 3x multiplier. Chip is still consumed.
- Bench Boost chip active → bench players score regardless, but auto-sub still fills XI gaps

## 9. Gameweek Logic

### Timeline (Monday → Sunday):
1. **Mon – Lock Time:** Managers can edit lineups and select chips
2. **Lineup Lock:** First IPL match starts → all lineups freeze
3. **Match Days:** IPL matches played throughout the week
4. **Post-Match:** Stats imported → scoring runs after each match completes
5. **Sunday End:** Gameweek closes → bench subs finalized → chips applied → leaderboard updated

### Multi-Match Accumulation:
If a player plays multiple IPL matches in one gameweek, points accumulate across all matches. Example: Match 1: 45 pts + Match 2: 60 pts = 105 pts gameweek total (before multipliers).

### Scoring Pipeline Order:
1. Import match stats from cricket API
2. Calculate base fantasy points per player per match
3. Aggregate player points across all matches in the gameweek
4. Apply bench auto-substitutions (end of gameweek)
5. Apply captain/VC multipliers
6. Apply chip effects (multiplicative with captain)
7. Sum team total for the gameweek
8. Update leaderboard

## 10. Leaderboard

### Ranking Rules:
1. **Primary sort:** Total season points (descending)
2. **Tiebreaker:** Highest single gameweek score (descending)

Leaderboard recalculates after each match completes (live updates within a gameweek) and finalizes at gameweek end.

## 11. Data Ingestion

### Pipeline:
Cricket Data API → Match Import Service → Raw Match Data Storage → Stat Parser → Fantasy Points Engine → Gameweek Aggregator → Leaderboard Service

### API Strategy:
- **Primary:** SportMonks Cricket API — €29/mo Major plan (14-day free trial), composable includes, production-ready ball-by-ball, confirmed IPL 2026 coverage
- **Fallback:** Admin can manually input match stats via CSV upload if API is unavailable
- See [Technical Architecture](2026-03-15-fal-technical-architecture.md) Section 4 for full API evaluation (4 providers compared) and field mapping

### Required Stats from API (validated against SportMonks, Mar 2026):

**From `?include=batting` (batting scorecard):**
- `score` — Runs scored (for run points, milestone bonuses, SR calc, duck detection)
- `ball` — Balls faced (for SR calc, min 10 balls check)
- `four_x` — Fours hit (for boundary bonus)
- `six_x` — Sixes hit (for six bonus)
- `rate` — Strike rate (pre-computed, or derive from score/ball)
- `wicket_id` — Dismissal type: 79 = Bowled, 83 = LBW (for +8 bonus), 84 = Not Out
- `catch_stump_player_id` — Fielder who caught (wicket_id=54/55), stumped (56), or collected at stumps on runout (63/64)
- `runout_by_id` — Fielder who threw for runout (wicket_id=63/64). When both IDs differ = assisted (6 pts each); same = direct hit (12 pts)

**From `?include=bowling` (bowling scorecard):**
- `wickets` — Wickets taken (for wicket points + 3/4/5 wicket bonuses)
- `overs` — Overs bowled (for ER calc, min 2 overs check, maiden detection)
- `medians` — Maiden overs
- `runs` — Runs conceded (for ER calc)
- `rate` — Economy rate (pre-computed, or derive from runs/overs)
- `wide`, `noball` — Extras bowled (available but not scored in FAL)

**From `?include=lineup` (match squad):**
- `position.name` — Player role (Batsman/Bowler/Allrounder/Wicketkeeper) for bowler SR exemption + duck exemption
- `lineup.substitution` — `false` = Starting XI (+4 pts), `true` = substitute
- Impact Player detection: sub who appears in batting or bowling data = Impact Player (+4 pts)
- "Did player play?" = player_id appears in match lineup include → played (for bench sub trigger)

**From `?include=balls` (ball-by-ball — only needed if dot ball scoring is kept):**
- `score.runs`, `score.ball`, `score.noball`, `score.bye`, `score.leg_bye` — for dot ball computation

**From fixture (no include needed):**
- `note` — Match result text (e.g., "RCB won by 7 wickets")
- `winner_team_id`, `starting_at`, `status`, `super_over`

**Not available from API (app-internal):**
- Player auction price — stored in FAL database from admin CSV upload
- Season/GW aggregated stats — computed from PlayerPerformance table
- Player form trends — computed from historical PlayerScore data

**Accepted limitations:**
- Overthrow boundary vs regular boundary cannot be distinguished from API (rare, ~2-3 per season)
- Super Over ball-by-ball scoreboard values need runtime validation (check for scoreboard beyond `S2`)

### Ingestion Trigger:
Phase 1: Hybrid approach — admin triggers scoring on-demand after each match via an "Import Scores" button, with a daily midnight cron as safety net. Runs on Vercel Hobby (free). See [Technical Architecture](2026-03-15-fal-technical-architecture.md) Section 5 for pipeline details.

## 12. Edge Cases

| Scenario | Handling |
|---|---|
| Player did not play | Bench substitution triggered |
| No bench player played either | Position scores 0 |
| Duck rule | -2 only if faced at least 1 ball, scored 0 runs, and player role is BAT/WK/ALL (bowlers exempt) |
| Match abandoned | Players get 0 points unless partial stats exist in API |
| Multiple matches in a week | Points accumulate across all matches |
| API stat corrections | System supports re-importing a match and recalculating all affected scores & leaderboards |
| Player transferred mid-season (IPL trade) | Player stays on fantasy team regardless of IPL team change |
| Lineup not submitted | Carry forward previous gameweek's lineup |

## 13. UI Design

### Design System:
- **Platform:** Mobile-first responsive web app (393px primary viewport)
- **Theme:** Dark OLED-friendly (#0c0c10 background)
- **Style:** Glassmorphism cards with subtle borders, modern typography
- **Color System:** IPL team colors as primary palette

### IPL Team Colors:
| Team | Color | Hex |
|---|---|---|
| MI (Mumbai Indians) | Blue | #004BA0 |
| CSK (Chennai Super Kings) | Yellow | #F9CD05 |
| RCB (Royal Challengers Bengaluru) | Red | #EC1C24 |
| KKR (Kolkata Knight Riders) | Purple | #3A225D |
| DC (Delhi Capitals) | Blue | #004C93 |
| RR (Rajasthan Royals) | Pink | #EA1A85 |
| SRH (Sunrisers Hyderabad) | Orange | #FF822A |
| GT (Gujarat Titans) | Teal | #0EB1A2 |
| LSG (Lucknow Super Giants) | Cyan | #00AEEF |
| PBKS (Punjab Kings) | Red | #ED1B24 |

### Accent Colors:
- Mint (#a8e6cf) — success, available chips, positive deltas
- Rose (#ffc6d9) — lock timer, negative deltas, warnings
- Sky (#a0c4ff) — secondary highlights
- Butter (#ffe5a0) — gold/rank highlights

### Persistent Header:
Every screen has a subtle app bar: FAL logo (IPL gradient, 70% opacity) left, page title centered, league name right, with a faint IPL-colored gradient divider line.

### Bottom Navigation:
4 tabs: Home, Lineup, Players, League — active tab with MI blue indicator.

### Screen Designs:

Interactive mockups are in `docs/superpowers/specs/mockups/` (HTML files). All screens are mobile-first (393px viewport) with Plus Jakarta Sans typography.

---

#### 1. Dashboard
Compact hero (~10% height) with league selector, GW score trio (tap points for detail), and deadline + Edit Lineup button. League standings promoted to top card with rank movement indicators (green ▲ / red ▼). Tap a manager to view their lineup. This Week's matches and chip tracker below. GW recap removed — replaced by tappable score → GW detail bottom sheet showing per-player breakdown with C/VC multipliers, chip effects, and bench subs.

![Dashboard](https://raw.githubusercontent.com/viiveek83/fal/main/docs/superpowers/specs/mockups/screenshots/01-dashboard.png)

---

#### 2. Lineup Management
Cricket pitch-style layout with 2-4-5 batting order formation (openers, middle order, lower order/bowlers). Header reduced to ~10% (logo + title + deadline chip). Full Playing XI + bench visible without scrolling. Color-coded role icon circles (BAT gold, BOWL blue, ALL teal, WK pink) with player names in dark frosted glass pills. Captain (gold C badge) and Vice-Captain (silver VC badge) shown inline. Bench section below pitch with swap functionality — tap a bench player to substitute into XI. Save Lineup button with hero gradient.

![Lineup Management](https://raw.githubusercontent.com/viiveek83/fal/main/docs/superpowers/specs/mockups/screenshots/02-lineup.png)

---

#### 3. Full Standings
Dedicated standings table accessed via "Full Table →" from dashboard. GW selector tabs (scrollable), 10 manager rows with rank badges (gold/silver/bronze for top 3), GW points, total points, and rank movement indicators. User's row highlighted. Tap any manager → view their read-only lineup.

![Full Standings](https://raw.githubusercontent.com/viiveek83/fal/main/docs/superpowers/specs/mockups/screenshots/07-full-standings.png)

---

#### 4. View Lineup (Read-Only)
Same pitch layout as Edit Lineup but read-only — no swap, no save button. Shows another manager's locked-in lineup with "Read Only" lock badge. Back arrow returns to standings. Accessed by tapping a manager in standings or dashboard.

![View Lineup](https://raw.githubusercontent.com/viiveek83/fal/main/docs/superpowers/specs/mockups/screenshots/08-view-lineup.png)

---

#### 5. League Admin
Reworked for Phase 1 simplicity. Compact hero with league name, manager count (6/15), active status badge, and invite code with copy button. Manager list with avatar initials, team names, roster status (15/15 ✓ complete, 12/15 ⚠ incomplete, 0/15 ✗ not uploaded), Edit and Remove actions. Admin badge on own row. Tap Edit → squad detail modal showing all 15 players. CSV upload button with validation summary (complete/incomplete/duplicate checks).

![League Admin](https://raw.githubusercontent.com/viiveek83/fal/main/docs/superpowers/specs/mockups/screenshots/04-league-admin.png)

---

#### 6. Player Market
Central marketplace view with My Team / All Players / Available filter toggle. Search bar + role filter pills (BAT/BOWL/ALL/WK) on gradient header. Team filter chips below. Player cards show: role badge, name, IPL team, mini stats, season points, owner abbreviation (YOUR TEAM / manager name / AVAILABLE), and pricing ($8.2M owned / Base $1M unsold). Tap any player → detail bottom sheet with batting/bowling/fielding stats, line-by-line fantasy points breakdown, GW tabs for historical performance, and trend chart with movement indicator.

![Player Market](https://raw.githubusercontent.com/viiveek83/fal/main/docs/superpowers/specs/mockups/screenshots/05-players.png)

### Role Badge Colors:
- BAT → CSK Yellow (#F9CD05)
- BOWL → MI Blue / Sky (#a0c4ff)
- ALL → GT Teal (#0EB1A2)
- WK → RR Pink (#EA1A85)

## 14. Open Issues & Design Gaps

### Industry Comparison (FAL vs Dream11 vs IPL Official)

FAL now uses Dream11's T20 scoring system as the baseline.

| Category | FAL | Dream11 T20 | IPL Official |
|---|---|---|---|
| Run | +1 | +1 | +1 |
| Boundary bonus (four) | +4 | +4 | +1 |
| Six bonus | +6 | +6 | +2 |
| 25-run bonus | +4 | +4 | — |
| 50-run bonus | +8 | +8 | unconfirmed |
| 75-run bonus | +12 | +12 | — |
| 100-run bonus | +16 (no stacking) | +16 (no stacking) | unconfirmed |
| Wicket (excl. run out) | +30 | +30 | +25 |
| LBW / Bowled bonus | +8 | +8 | — |
| Dot ball | +1 | +1 | — |
| Maiden over | +12 | +12 | +8 |
| 3-wicket bonus | +4 | +4 | unconfirmed |
| 4-wicket bonus | +8 | +8 | unconfirmed |
| 5-wicket bonus | +12 | +12 | unconfirmed |
| SR bonus/penalty | +6 to -6 (min 10 balls, bowlers exempt) | +6 to -6 (min 10 balls, bowlers exempt) | +2 (SR ≥ 120, min 10 balls) |
| ER bonus/penalty | +6 to -6 (min 2 overs) | +6 to -6 (min 2 overs) | +2 to +4 bonus (ER < 8, min 2 overs) |
| Duck | -2 (bowlers exempt) | -2 (bowlers exempt) | -10 (bowlers exempt) |
| Catch | +8 | +8 | +10 |
| 3 Catch Bonus | +4 | +4 | — |
| Runout (direct hit) | +12 | +12 | +12 |
| Runout (not direct hit, each) | +6 | +6 | — |
| Stumping | +12 | +12 | +20 |
| Starting XI bonus | +4 | +4 | unconfirmed |
| Impact Player sub | +4 | +4 | — |
| Captain | 2x | 2x | — |
| Vice Captain | 1.5x | 1.5x | — |

### Scoring Balance

| # | Issue | Detail | Benchmark | Status |
|---|-------|--------|-----------|--------|
| 1 | ~~Bowling points overpowered~~ | Now balanced with ER penalties (+6 to -6 tiered) matching Dream11. | Dream11-aligned | **Resolved** |
| 2 | **Dot ball scoring — retained from Dream11** | Dream11 awards +1 per dot ball. FAL keeps this. Requires ball-by-ball data from SportMonks. | Dream11: +1 per dot ball | **Resolved** |
| 3 | ~~No strike rate / economy rate modifiers~~ | Now included: SR +6 to -6 (min 10 balls, bowlers exempt) and ER +6 to -6 (min 2 overs). | Dream11-aligned | **Resolved** |
| 4 | ~~No penalty for expensive bowling~~ | Now included: ER 10-11: -2, 11.01-12: -4, 12+: -6 (min 2 overs). | Dream11-aligned | **Resolved** |
| 5 | ~~Duck rule should exclude bowlers~~ | Now excludes bowlers. Duck -2 applies to BAT, WK, ALL only. | Dream11-aligned | **Resolved** |

### Game Mechanics

| # | Issue | Detail | Status |
|---|-------|--------|--------|
| 6 | **No role composition constraints** | Managers could field 11 batsmen or 11 bowlers with no restriction. Consider minimum role requirements (e.g., min 1 WK, 3 BAT, 3 BOWL, 1 ALL). | Open |
| 7 | **Impact Sub undefined in spec** | The mockup shows an Impact Sub slot but the spec doesn't define it. Need rules: when can it be used, does it replace a bench slot, does it score differently? | Open |
| 8 | **Chip balance — Powerplay vs Bowling Boost** | Powerplay (2x batting) benefits more players per team than Bowling Boost (2x bowling), since most teams have 5-6 batters vs 4-5 bowlers in XI. Powerplay may be strictly better. | Open |
| 9 | **No transfer/trade mechanism in Phase 1** | If a player gets injured mid-season, the manager is stuck. Consider a simple free-agent pickup (drop one, pick one unclaimed) even in Phase 1. | Open |
| 10 | **Captain/VC didn't play — harsh penalty** | Both absent = no multipliers for anyone. Consider auto-promoting highest scorer to captain in this edge case. | Open |

### Missing Product Features

| # | Issue | Detail | Status |
|---|-------|--------|--------|
| 11 | **No head-to-head matchup mode** | Only cumulative leaderboard exists. Weekly H2H adds engagement (common in FPL, Dream11). Consider as Phase 1 or early Phase 2. | Open |
| 12 | **No notifications system** | No alerts for lineup lock, gameweek results, or scoring updates. Even basic email/push notifications would improve retention. | Open |
| 13 | **No player injury/availability status** | Managers have no in-app info about whether a player is likely to play. Consider surfacing availability data from cricket APIs. | Open |
| 14 | **No gameweek history/recap per team** | Spec mentions leaderboard history but no per-team breakdown of past gameweeks (who scored what, which subs triggered, chip effects). | Open |
| 15 | **No social/community features** | No league chat, no trash talk, no activity feed. These drive engagement in competing platforms. | Open |
| 16 | **Manual auction has no guardrails** | Admin uploads rosters with no validation beyond squad size. No budget enforcement, no draft order, no fairness checks. | Open |

## 15. Technical Architecture

See [Technical Architecture Document](2026-03-15-fal-technical-architecture.md) for full details including:
- Phase 1 monolithic Next.js architecture
- Core services and database entities
- Data ingestion pipeline
- API route design
- Phase 2+ roadmap (auction engine, market system)
