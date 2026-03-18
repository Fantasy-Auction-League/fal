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

### Base Scoring Rules:

**Batting:**
| Event | Points |
|---|---|
| Run | +1 |
| Four | +1 |
| Six | +2 |
| 30 Runs | +4 |
| 50 Runs | +8 |
| 100 Runs | +16 |
| Duck | -2 (only if faced at least 1 ball) |

**Bowling:**
| Event | Points |
|---|---|
| Wicket | +25 |
| Dot Ball | +1 |
| Maiden Over | +8 |
| 3 Wickets | +8 |
| 5 Wickets | +16 |

**Fielding:**
| Event | Points |
|---|---|
| Catch | +8 |
| Runout | +6 |
| Stumping | +12 |

### Multipliers:
- Captain: 2x
- Vice Captain: 1.5x

### Milestone Bonuses Stack:
A player scoring 50 runs gets: +50 (runs) + +4 (30 bonus) + +8 (50 bonus) = 62 from runs alone (plus fours/sixes).

## 7. Strategy Chips

4 chips, each usable once per season. One chip per gameweek. Selected before lineup lock.

| Chip | Effect |
|---|---|
| **Triple Captain** | Captain earns 3× points |
| **Bench Boost** | Bench player points also count |
| **Powerplay** | Batting points doubled |
| **Bowling Boost** | Bowling points doubled |

### Chip + Captain Stacking:
Multipliers stack **multiplicatively**. Example: Captain who is a bowler + Bowling Boost active = 2x (captain) × 2x (chip) = **4x total**. Triple Captain on a batting captain who hits a 50 = base pts × 3x = **3x total** (note: only one chip per gameweek, so Triple Captain cannot combine with Powerplay or Bowling Boost).

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
- Both captain and VC didn't play → no multipliers applied to anyone
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

### Required Stats from API:
- Runs scored, Fours hit, Sixes hit, Balls faced
- Wickets taken, Maiden overs
- Catches taken, Runouts effected, Stumpings
- Did player bat? (for duck rule)
- Did player play? (for bench substitution)
- **Dot balls:** Not available in either API's bowling summary — requires ball-by-ball data computation (SportMonks) or dropping dot ball scoring (see Issue #2)

### Ingestion Trigger:
Phase 1: Hybrid approach — admin triggers scoring on-demand after each match via an "Import Scores" button, with a daily midnight cron as safety net. Runs on Vercel Hobby (free). See [Technical Architecture](2026-03-15-fal-technical-architecture.md) Section 5 for pipeline details.

## 12. Edge Cases

| Scenario | Handling |
|---|---|
| Player did not play | Bench substitution triggered |
| No bench player played either | Position scores 0 |
| Duck rule | -2 only if batsman faced at least 1 ball and scored 0 runs |
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
5 tabs: Home, Lineup, Board, Players, League — with active tab indicator using CSK→SRH gradient bar.

### Screen Designs:

Interactive mockups are in `docs/superpowers/specs/mockups/` (HTML files).

---

#### 1. Dashboard
Gameweek countdown, lineup status, mini leaderboard, GW recap with top scorers (IPL team color stripes), upcoming matches with team color gradients, chip tracker.

![Dashboard](https://raw.githubusercontent.com/viiveek83/fal/feat/design-spec/docs/superpowers/specs/mockups/screenshots/01-dashboard.png)

---

#### 2. Lineup Management
Playing XI with IPL team color bars, Captain (CSK gold badge) and VC (KKR purple badge), bench section with priority ordering, chip selector, validation checklist, lock countdown.

![Lineup Management](https://raw.githubusercontent.com/viiveek83/fal/feat/design-spec/docs/superpowers/specs/mockups/screenshots/02-lineup.png)

---

#### 3. Leaderboard
Podium for top 3 (gold/blue/teal gradients), full rankings with avatars, position deltas, GW history bar chart.

![Leaderboard](https://raw.githubusercontent.com/viiveek83/fal/feat/design-spec/docs/superpowers/specs/mockups/screenshots/03-leaderboard.png)

---

#### 4. League Admin
League info card, invite code with copy button, manager list with IPL-colored avatars, roster upload (CSV drag-drop), team roster status (complete/incomplete indicators), league settings.

![League Admin](https://raw.githubusercontent.com/viiveek83/fal/feat/design-spec/docs/superpowers/specs/mockups/screenshots/04-league-admin.png)

---

#### 5. Player Registry
Search bar, role filter pills (BAT/BOWL/ALL/WK in role colors), IPL team filter chips, player cards with team accent bars, mini stats, season points, ownership badges.

![Player Registry](https://raw.githubusercontent.com/viiveek83/fal/feat/design-spec/docs/superpowers/specs/mockups/screenshots/05-players.png)

---

#### 6. Match Scores
Match header with team colors, player scoring breakdowns (event-by-event with points), captain/VC multiplier display, bench substitution indicators, match point totals.

![Match Scores](https://raw.githubusercontent.com/viiveek83/fal/feat/design-spec/docs/superpowers/specs/mockups/screenshots/06-match-scores.png)

### Role Badge Colors:
- BAT → CSK Yellow (#F9CD05)
- BOWL → MI Blue / Sky (#a0c4ff)
- ALL → GT Teal (#0EB1A2)
- WK → RR Pink (#EA1A85)

## 14. Open Issues & Design Gaps

### Industry Comparison (FAL vs Dream11 vs IPL Official)

| Category | FAL | Dream11 T20 | IPL Official |
|---|---|---|---|
| Run | +1 | +1 | +1 |
| Four bonus | +1 | +1 | +1 |
| Six bonus | +2 | +2 | +2 |
| 30-run bonus | +4 | — | unconfirmed |
| 50-run bonus | +8 | +8 | unconfirmed |
| 100-run bonus | +16 | +16 | unconfirmed |
| Wicket | +25 | +25 | +25 |
| **Dot ball** | **+1** | **—** | **—** |
| Maiden over | +8 | +8 | +8 |
| 3-wicket bonus | +8 | — (4W: +8) | unconfirmed |
| 5-wicket bonus | +16 | +16 | unconfirmed |
| **SR bonus/penalty** | **—** | **-2 to -6** (SR < 70, min 10 balls) | **+2** (SR ≥ 120, min 10 balls) |
| **ER bonus/penalty** | **—** | **+6 to -6** (tiered, min 2 overs) | **+2 to +4 bonus** (ER < 8, min 2 overs) |
| Duck | -2 (all players) | -2 (excludes bowlers) | -10 (excludes bowlers) |
| Catch | +8 | +8 | +10 |
| Runout | +6 (flat) | +12 direct / +8 thrower / +4 catcher | +12 |
| Stumping | +12 | +12 | +20 |
| Starting XI bonus | — | +4 | unconfirmed |

### Scoring Balance

| # | Issue | Detail | Benchmark | Status |
|---|-------|--------|-----------|--------|
| 1 | **Bowling points overpowered** | 25 pts per wicket is industry standard, but Dream11 balances this with ER penalties (up to -6 for ER > 11). FAL has no such counterweight, making bowling disproportionately rewarding. | Dream11: ER penalties balance wicket value | Open |
| 2 | **Dot ball scoring — unique to FAL** | Neither Dream11 nor IPL Official award dot ball points. FAL's +1 per dot inflates bowling by ~8-15 pts per match (a typical 4-over T20 spell has 10-14 dots). This is the single biggest scoring deviation from industry. Consider removing entirely or reducing to maiden-only rewards. | Dream11: no dot ball pts. IPL Official: no dot ball pts | Open |
| 3 | **No strike rate / economy rate modifiers** | Both Dream11 and IPL Official use SR/ER modifiers. Dream11: SR < 70 gets -2 to -6 penalty (min 10 balls); ER < 4 gets +6, ER > 11 gets -6 (min 2 overs). IPL Official: SR ≥ 120 gets +2; ER < 6 gets +4. FAL missing both is a significant gap. | Dream11: SR penalties + ER bonus/penalty. IPL: SR bonus + ER bonus | Open |
| 4 | **No penalty for expensive bowling** | Dream11 penalizes ER 9-10: -2, 10-11: -4, 11+: -6 (min 2 overs bowled). FAL has zero downside for conceding 12+ RPO. Recommend adopting similar tiered ER penalties. | Dream11: -2 to -6 tiered penalties | Open |
| 5 | **Duck rule should exclude bowlers** | Both Dream11 and IPL Official exempt bowlers from duck penalties. FAL penalizes all players equally. A #11 tailender getting -2 for a duck is unfair. Recommend: exclude players with "BOWL" role from duck penalty. | Dream11: excludes bowlers. IPL: excludes bowlers | Open |

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
