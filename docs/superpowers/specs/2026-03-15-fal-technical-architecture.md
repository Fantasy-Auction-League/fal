# FAL — Technical Architecture

## 1. Architecture Overview (Phase 1)

### Monolithic Next.js:
- Single Next.js app on Vercel
- API routes for backend logic
- React frontend (mobile-first)
- PostgreSQL (Vercel Postgres or Neon) + Prisma ORM
- Auth.js for authentication (OAuth + credentials)
- Vercel Cron for match data polling

### Tech Stack:
| Layer | Technology |
|---|---|
| Frontend | Next.js + React + TypeScript |
| Styling | Tailwind CSS |
| Backend | Next.js API Routes |
| Database | Neon PostgreSQL (free tier — 0.5GB, 100 compute-hrs/mo) |
| ORM | Prisma |
| Auth | Auth.js (OAuth + credentials) |
| Deployment | Vercel (Hobby — free) |
| Cron | Vercel Cron (daily) + admin-triggered API routes |

### Platform Constraints:
- **Vercel Hobby plan:** Cron jobs limited to once per day, function duration max 60s, non-commercial use only. Sufficient for FAL with hybrid scoring approach (daily cron + admin-triggered imports).
- **Neon free tier:** 0.5GB storage, 100 compute-hrs/mo, 10K pooled connections. Sufficient for Phase 1 (~15 managers, 74 matches). Auto-suspends after 5 min idle.

### System Architecture

```mermaid
graph TB
    User["Manager<br/>(Mobile Browser)"]

    subgraph Vercel["Vercel Hobby - Free"]
        App["Next.js App<br/>React Frontend + API Routes + Auth.js"]
        Cron["Daily Cron<br/>(safety net)"]
        AdminBtn["Admin Import Scores<br/>button on-demand"]
    end

    subgraph NeonDB["Neon - Free tier"]
        DB[("PostgreSQL<br/>0.5GB / 100 CU-hrs")]
    end

    SportMonks["SportMonks<br/>Cricket API"]

    User -->|"HTTPS"| App
    App -->|"Prisma ORM"| DB
    Cron -->|"daily batch<br/>(midnight)"| App
    AdminBtn -->|"on-demand after<br/>each match"| App
    App -->|"fetch scorecards"| SportMonks

    style Vercel fill:#0a0a1a,color:#fff,stroke:#333
    style NeonDB fill:#004BA0,color:#fff
    style App fill:#111128,color:#fff
    style DB fill:#004BA0,color:#fff
    style SportMonks fill:#2d1b69,color:#fff
    style Cron fill:#1a1a3e,color:#fff
    style AdminBtn fill:#1a1a3e,color:#fff
```

**Everything runs free** — Vercel Hobby (frontend, API, daily cron) + Neon free tier (PostgreSQL). Admin triggers score imports on-demand after each match via a button in the admin panel. Daily cron at midnight catches anything missed.

### Scoring Pipeline Flow

```mermaid
flowchart LR
    subgraph Init["Season Init (one-time, admin)"]
        S1["GET /fixtures<br/>by season_id"] --> S2["Pre-load all<br/>Match + Gameweek<br/>rows"]
    end

    subgraph Trigger["Two ways to trigger scoring"]
        T1["Admin taps<br/>Import Scores<br/>after each match"]
        T2["Daily Cron<br/>(midnight, safety net)"]
    end

    subgraph Pipeline["Scoring Pipeline (same code, either trigger)"]
        A["Claim matches:<br/>SET status=scoring<br/>WHERE status=completed"] --> A1{"Rows<br/>claimed?"}
        A1 -->|No| Z["Exit (nothing to do<br/>or already claimed)"]
        A1 -->|Yes| B["GET /fixtures by id<br/>include batting<br/>bowling balls"]
        B --> C["Parse + upsert<br/>PlayerPerformance"]
        C --> D["Set Match<br/>status = 'scored'"]
        D --> E{"GW ended?<br/>(all matches scored)"}
        E -->|No| Z2["Done for now"]
        E -->|Yes| F["Bench subs then<br/>C/VC multipliers then<br/>Chip effects then<br/>Update leaderboard"]
    end

    Init -.->|"Match table<br/>pre-populated"| Trigger
    T1 -->|"POST /api/scoring/import"| Pipeline
    T2 -->|"invokes same endpoint"| Pipeline
```

## 2. Core Services

All services run within the Next.js monolith as modules:

1. **Match Import Service** — Polls cricket API, stores raw match data
2. **Stat Parser** — Extracts player performance stats from raw data
3. **Fantasy Points Engine** — Applies scoring rules, calculates base points
4. **Gameweek Aggregator** — Bench subs, multipliers, chips, team totals
5. **Leaderboard Service** — Rankings, season totals, history
6. **Lineup Validation Service** — Enforces squad size, player uniqueness within league, lineup lock timing

### Service Flow:
See System Architecture and Scoring Pipeline Flow diagrams in Section 1.

## 3. Database Entities

- **User** — Platform user (auth)
- **League** — Fantasy competition container. Stores `adminUserId` (creator/admin), `inviteCode`, settings.
- **Team** — Manager's team within a league
- **TeamPlayer** — Join table: which Player belongs to which Team (enforces uniqueness within a league)
- **Player** — Real IPL player (from API). Stores name, IPL team, role (BAT/BOWL/ALL/WK).
- **Gameweek** — Global weekly scoring period (Mon–Sun). Shared across all leagues, not league-specific.
- **Match** — An IPL match within a gameweek. Stores teams, date, status (scheduled/in_progress/completed), API match ID.
- **Lineup** — Weekly lineup submission per team per gameweek
- **LineupSlot** — Individual slot within a lineup. Stores: `playerId`, `slotType` (XI/BENCH), `benchPriority` (1-4, null for XI), `role` (CAPTAIN/VC/null).
- **PlayerPerformance** — Raw match statistics per player per match. Includes batting (runs, balls, fours, sixes, dismissal), bowling (overs, maidens, runs conceded, wickets, dot balls), and fielding (catches, stumpings, runouts direct, runouts assisted).
- **PlayerScore** — Calculated fantasy points per player per gameweek (aggregated across matches)
- **ChipUsage** — Which chip a team used in which gameweek

### Entity Relationships:
See entity descriptions above for fields. Key relationships: User 1→N Team, League 1→N Team, Team 1→N TeamPlayer, Player 1→N TeamPlayer, Team 1→N Lineup, Lineup 1→N LineupSlot, Gameweek 1→N Match, Match 1→N PlayerPerformance.

### Uniqueness Constraints:
- `TeamPlayer`: unique(`leagueId`, `playerId`) — a player can only be on one team per league
- `Lineup`: unique(`teamId`, `gameweekId`) — one lineup per team per gameweek
- `ChipUsage`: unique(`teamId`, `chipType`) — each chip used once per season
- `LineupSlot`: unique(`lineupId`, `playerId`) — a player appears once per lineup

## 4. Cricket Data API Evaluation

> Scoring rules and pipeline details are defined in the [Design Spec](2026-03-15-fal-design.md) Sections 6, 9, and 11. This section covers implementation-specific concerns only.

### Provider Landscape

No cricket API provides scorecard-level data (batting, bowling, fielding stats) for free. All providers require a paid plan for the data FAL needs.

### API Comparison

| | SportMonks | CricketData.org | Roanuz | EntitySport |
|---|---|---|---|---|
| **Base URL** | `cricket.sportmonks.com/api/v2.0/` | `api.cricapi.com/v1/` | `sports.roanuz.com/` | `rest.entitysport.com/v2/` |
| **Auth** | API token (query param) | API key (query param) | API key | API key |
| **Pricing** | **€29/mo** (Major, 26 leagues) | Paid (price unlisted, contact required) | **~$240/season** | **$250/mo** (Pro) or **$450/mo** (Elite for fantasy) |
| **Free tier** | 14-day trial only | 500 req/day (match lists only, no scorecards) | Unknown | None |
| **IPL coverage** | Yes (confirmed IPL 2026) | Yes | Yes (IPL 2026, 70+ matches) | Yes |
| **Scorecard** | `GET /fixtures/{id}?include=batting,bowling` | `v1/match_scorecard?id={matchId}` | Yes | Yes |
| **Composable includes** | Yes (`batting`, `bowling`, `lineup`, `runs`, `balls`, `venue`, `toss`) | No (fixed response) | Yes | Yes |
| **Ball-by-ball** | Yes (`?include=balls`) — production ready | "Testing" — not production ready | Yes (detailed: fielder, thrower, ball speed) | Yes |
| **Built-in fantasy pts** | No (calculate ourselves) | Yes (`v1/match_points`) | Yes (fantasy API) | Yes (Elite plan only, $450/mo) |
| **Rate limit** | 3,000 calls/hr per entity | 500 req/day (free) | Unknown | 500K–2M calls/mo |
| **Fielding data** | Yes — batting include has `catch_stump_player_id`, `runout_by_id` (validated Mar 2026) | Yes (dedicated catching array) | Yes (per-ball fielder data) | Yes |
| **Dot balls** | Compute from ball-by-ball | Not available | Compute from ball-by-ball | Unknown |

### Batting Scorecard Fields (validated against IPL 2025 data, Mar 2026)

| FAL Stat Needed | CricketData Field | SportMonks Field | Verified |
|---|---|---|---|
| Runs scored | `r` | `score` | Yes |
| Balls faced | `b` | `ball` | Yes |
| Fours hit | `4s` | `four_x` | Yes |
| Sixes hit | `6s` | `six_x` | Yes |
| Strike rate | `sr` | `rate` | Yes |
| Dismissal type | `dismissal` | `wicket_id` (maps to score type ID — see table below) | **Changed** |
| Fielder (catch/stumping) | — | `catch_stump_player_id` | **New** |
| Fielder (runout thrower) | — | `runout_by_id` | **New** |
| Bowler who took wicket | — | `bowling_player_id` | **New** |
| Did player bat? | Present in batting array = yes | Present in batting array = yes | Yes |

**Dismissal type mapping** (`wicket_id` → score name, from `/scores` endpoint):

| wicket_id | Name | IPL 2025 Count | Fielding Data Available |
|---|---|---|---|
| 54 | Catch Out | 601 | `catch_stump_player_id` = catcher |
| 55 | Catch Out (Sub) | 12 | `catch_stump_player_id` = substitute fielder |
| 56 | Stump Out | 18 | `catch_stump_player_id` = wicketkeeper |
| 63 | Run Out | 37 | `runout_by_id` = thrower, `catch_stump_player_id` = collector |
| 64 | Run Out (Sub) | 1 | Same as above, substitute fielder involved |
| 79 | Clean Bowled | 133 | No fielder |
| 83 | LBW OUT | 52 | No fielder |
| 84 | Not Out | 257 | N/A |
| 87 | Hit Wicket | 3 | No fielder |
| 138 | Retired Out | 2 | No fielder |

> Additional run-out score types exist for combinations with extras: `65` (Run Out + 1 Run), `67` (Run Out + 2 Runs), `22` (1 Wide + Run Out), etc. All have `is_wicket: true` and follow the same `runout_by_id` / `catch_stump_player_id` pattern.

### Bowling Scorecard Fields (validated against IPL 2025 data, Mar 2026)

| FAL Stat Needed | CricketData Field | SportMonks Field | Verified |
|---|---|---|---|
| Overs bowled | `o` | `overs` | Yes |
| Maidens | `m` | `medians` (SportMonks typo, confirmed field name) | Yes |
| Runs conceded | `r` | `runs` | Yes |
| Wickets taken | `w` | `wickets` | Yes |
| Economy rate | `eco` | `rate` | Yes |
| No balls | `nb` | `noball` | **Available (was listed as —)** |
| Wides | `wd` | `wide` | **Available (was listed as —)** |
| **Dot balls** | **Not available** | **Not in bowling summary — compute from ball-by-ball** | See below |

### Fielding Scorecard Fields (validated against IPL 2025 data, Mar 2026)

**Fielding data IS available directly in the batting include** — no ball-by-ball parsing required. This is a major simplification from the original design.

| FAL Stat Needed | SportMonks Field | Source | Verified |
|---|---|---|---|
| Catches (per fielder) | `catch_stump_player_id` on batting rows where `wicket_id` = 54 or 55 | `?include=batting` | Yes (601 catches in IPL 2025) |
| Stumpings | `catch_stump_player_id` on batting rows where `wicket_id` = 56 | `?include=batting` | Yes (18 stumpings in IPL 2025) |
| Runout (thrower) | `runout_by_id` on batting rows where `wicket_id` = 63/64/65/67/68 | `?include=batting` | Yes (21 runouts in IPL 2025) |
| Runout (collector) | `catch_stump_player_id` on same runout rows | `?include=batting` | Yes |
| **Runout attribution** | **Always returns 2 player IDs: `runout_by_id` (thrower) + `catch_stump_player_id` (collector)** | `?include=batting` | **Yes — confirmed across all 21 IPL 2025 runouts** |

### Fielding Data Extraction Strategy (SportMonks) — SIMPLIFIED

> **Original design assumed fielding data required ball-by-ball parsing. This was wrong.** The batting include provides all fielding attribution directly via `catch_stump_player_id` and `runout_by_id` fields. Validated against all 71 completed IPL 2025 matches.

**Fielding extraction from batting scorecard (per match):**
```typescript
// All fielding data comes from the batting include — no ball-by-ball needed
interface FieldingStats {
  playerId: number;
  catches: number;       // count batting rows where wicket_id IN (54, 55) AND catch_stump_player_id = this player
  stumpings: number;     // count batting rows where wicket_id = 56 AND catch_stump_player_id = this player
  runoutsAsFielder: number; // count rows where runout_by_id = this player OR catch_stump_player_id = this player (on runout wickets)
}

// Runout attribution:
// Every runout has TWO player IDs: runout_by_id (thrower) and catch_stump_player_id (collector)
// When runout_by_id !== catch_stump_player_id → assisted runout (6 pts each)
// When runout_by_id === catch_stump_player_id → direct hit (12 pts to that player)
// In IPL 2025, all 21 runouts had different IDs (all were assisted)

// Fantasy points calculation:
// catches * 8 + (catches >= 3 ? 4 : 0) + stumpings * 12
// + runoutsDirect * 12 + runoutsAssisted * 6
```

**Pre-season validation checklist — COMPLETED (Mar 2026):**
- [x] Fetch a completed IPL match with `?include=batting,bowling,balls` — confirmed working
- [x] Batting include has `catch_stump_player_id` for catches and stumpings — confirmed
- [x] Batting include has `runout_by_id` for runout thrower attribution — confirmed
- [x] Runouts always return 2 player IDs (thrower + collector) — confirmed across 21 IPL 2025 runouts
- [x] `wicket_id` maps to dismissal type via `/scores` endpoint — full mapping documented above
- [x] Ball-by-ball data has `score.runs`, `score.noball`, `score.ball` for dot ball computation — confirmed
- [x] Dot balls computable as: `score.runs == 0 && score.ball == true && score.noball == 0 && score.bye == 0 && score.leg_bye == 0`

**Ball-by-ball is ONLY needed for dot ball computation.** If dot balls are dropped (Design Spec Issue #2), the `?include=batting,bowling,lineup` call alone provides everything — no `balls` include needed.

### Dot Ball Computation (validated Mar 2026)

**Neither API provides a dot ball count in the bowling scorecard.** However, ball-by-ball data makes this straightforward.

**Validated approach:** Each ball in the `?include=balls` response has a `score` object with:
```json
{
  "name": "No Run",    // human-readable
  "runs": 0,           // runs scored by batsman
  "four": false,       // was it a boundary four
  "six": false,        // was it a boundary six
  "bye": 0,            // bye runs
  "leg_bye": 0,        // leg bye runs
  "noball": 0,         // no-ball extras
  "noball_runs": 0,    // runs off no-ball
  "is_wicket": false,  // dismissal on this ball
  "ball": true,        // counts as a legal delivery
  "out": false         // batsman out
}
```

**Dot ball formula:** `score.runs == 0 && score.ball == true && score.noball == 0 && score.bye == 0 && score.leg_bye == 0`

**IPL 2025 validation:** Match 65240 (KKR vs RCB) — 218 legal balls, 73 dot balls computed. Score type names seen: `No Run`, `1 Run`, `2 Runs`, `FOUR`, `SIX`, `1 Wide`, `1 Leg Bye`, `Catch Out`, `Clean Bowled`.

**Options remain:**
1. **Keep dot ball scoring** — use `?include=balls` (adds ~200 ball objects per match, ~50KB)
2. **Drop dot ball scoring** — aligns with Dream11/IPL Official. Eliminates need for ball-by-ball entirely, reducing API call to `?include=batting,bowling,lineup` only

**Recommendation:** If dot balls are dropped (per Design Spec Issue #2), the entire scoring pipeline simplifies significantly — no ball-by-ball parsing needed at all.

### Ball-by-Ball Data Structure (validated Mar 2026)

Each ball in the `?include=balls` response contains:

| Field | Type | Description |
|---|---|---|
| `id` | number | Unique ball ID |
| `ball` | number | Over.ball format (e.g., `0.1` = first ball of first over) |
| `scoreboard` | string | `S1` (first innings) or `S2` (second innings) |
| `batsman_id` | number | Striker's player ID |
| `bowler_id` | number | Bowler's player ID |
| `batsmanout_id` | number/null | Player ID of batsman dismissed (null if no wicket) |
| `catchstump_id` | number/null | Fielder who caught/stumped/collected at stumps |
| `runout_by_id` | number/null | Fielder who threw for runout |
| `score` | object | Nested score object (see below) |
| `batsman` | object | Full player object for striker |
| `bowler` | object | Full player object for bowler |
| `team` | object | Batting team object |

**Ball `score` object fields:** `name` (string), `runs` (int), `four` (bool), `six` (bool), `bye` (int), `leg_bye` (int), `noball` (int), `noball_runs` (int), `is_wicket` (bool), `ball` (bool = legal delivery), `out` (bool)

> Note: There is no `commentary` text field on balls, contrary to original design assumption. Fielding attribution comes from the structured `catchstump_id` and `runout_by_id` fields instead.

### Recommendation: SportMonks (€29/mo Major Plan)

| Factor | SportMonks | Runner-up |
|---|---|---|
| **Cost** | €29/mo (~$31/mo) | Roanuz ~$240/season (~$30/mo amortized) |
| **Single request = full scorecard** | Yes (composable includes) | CricketData: No (fixed response) |
| **Ball-by-ball production ready** | Yes | CricketData: "Testing" status |
| **IPL 2026 confirmed** | Yes (blog post + demo) | Roanuz: Yes |
| **Rate limit headroom** | 3,000/hr (FAL needs ~5/day) | More than enough on any plan |
| **Fielding data** | Catches/stumpings/runouts available directly in batting include (validated) | CricketData has dedicated catching array |

**Why SportMonks wins:**
1. **Cheapest option** at €29/mo — EntitySport is 8x more ($250/mo), Roanuz is comparable but less documented
2. **One API call gets everything** — `GET /fixtures/{id}?include=batting,bowling,lineup,runs,balls` returns the full scorecard + ball-by-ball in a single request
3. **Ball-by-ball is production-ready** — critical if we keep dot ball scoring (Design Spec Issue #2)
4. **IPL 2026 explicitly supported** — confirmed in their blog with working demos
5. **3,000 calls/hour** — FAL needs ~5 requests per match day, so massive headroom for retries and re-imports

**Trade-offs accepted:**
- No built-in fantasy points (we calculate our own — this is actually better since FAL has custom scoring rules)
- ~~Fielding stats not in standard includes~~ **RESOLVED:** Fielding data (catches, stumpings, runouts with full attribution) IS available directly in the batting include via `catch_stump_player_id` and `runout_by_id` fields. No ball-by-ball parsing needed for fielding.
- Off-season cost: €29/mo even when IPL isn't running. Cancel and resubscribe seasonally to save ~€200/year.

**Fallback:** Admin manual stat entry via CSV upload if API is unavailable for a match. Design spec already supports this.

### Fixture-Level Fields (validated Mar 2026)

Each fixture object contains these fields relevant to FAL:

| Field | Type | Description | Used For |
|---|---|---|---|
| `id` | number | Unique fixture ID | API match reference |
| `localteam_id` | number | Home team ID | Match display |
| `visitorteam_id` | number | Away team ID | Match display |
| `starting_at` | datetime | Match start time (UTC) | Lineup lock, gameweek assignment, "vs MI · Tue" display |
| `status` | string | `NS` (not started), `Finished`, etc. | Scoring trigger |
| `note` | string | Result text (e.g., "RCB won by 7 wickets (with 22 balls remaining)") | Match scores UI |
| `winner_team_id` | number | Winning team ID | Match result display |
| `toss_won_team_id` | number | Toss winner | Optional display |
| `elected` | string | "batting" or "bowling" | Optional display |
| `man_of_match_id` | number | MoM player ID | Optional display |
| `super_over` | boolean | Whether match went to Super Over | Exclude Super Over balls from scoring |
| `round` | string | "1st Match", "2nd Match", etc. | Match display |

**`?include=runs` response** (innings summary):

| Field | Type | Description |
|---|---|---|
| `team_id` | number | Batting team |
| `inning` | number | 1 or 2 |
| `score` | number | Team total runs |
| `wickets` | number | Wickets fallen |
| `overs` | number | Overs bowled (e.g., 16.2) |

### Lineup Include Fields (validated Mar 2026)

Each player in the `?include=lineup` response contains a `lineup` sub-object:

| Field | Type | Description | Used For |
|---|---|---|---|
| `team_id` | number | Player's IPL team in this match | Team identification |
| `captain` | boolean | IPL match captain | Optional display |
| `wicketkeeper` | boolean | Designated keeper | Optional display |
| `substitution` | boolean | `false` = Starting XI, `true` = substitute/bench | Starting XI +4 bonus, Impact Player detection |

**Starting XI detection:** `substitution === false` → player was in the announced Starting XI → +4 pts.

**Impact Player detection (derived):** SportMonks has no explicit Impact Player flag. Detection logic:
```typescript
// A substitute who actually participated = Impact Player
const isImpactPlayer = (player: LineupPlayer, battedIds: Set<number>, bowledIds: Set<number>) =>
  player.lineup.substitution === true &&
  (battedIds.has(player.id) || bowledIds.has(player.id));
```
Validated against IPL 2025 Match 65240: KKR's Vaibhav Arora (sub who bowled) and RCB's Devdutt Padikkal (sub who batted) correctly identified as Impact Players. Each team had 16 players in lineup (11 starters + 5 subs), with exactly 1 sub per team who actually played.

### Design-to-API Gap Analysis (validated Mar 2026)

Cross-referenced all UI mockup data points against SportMonks API responses. **No blocking gaps found.**

**Fully covered (20 data points):** All batting, bowling, fielding stats, SR/ER bonuses, dismissal types, match results, lineup detection, upcoming opponent info — all map directly to validated API fields.

**Derived data (not directly from API but computable):**

| Data Point | Derivation |
|---|---|
| Impact Player (+4 pts) | Sub who appears in batting or bowling data (see above) |
| Player auction price | App-internal — from admin CSV upload, stored in `TeamPlayer.purchasePrice` |
| Season/GW aggregated stats | Computed from `PlayerPerformance` + `PlayerScore` tables |
| Player form trends | Computed from historical `PlayerScore` data |
| "vs MI · Tue" opponent display | Cross-reference player's IPL team with fixture `localteam_id`/`visitorteam_id` + `starting_at` |

**Accepted limitations:**

| Limitation | Impact | Mitigation |
|---|---|---|
| Overthrow boundary vs regular boundary indistinguishable | Very low (~2-3 per season) | Accept inaccuracy, or admin manual correction |
| Super Over ball scoreboard values unvalidated | Very low (rare event) | Filter by `scoreboard` in `S1`/`S2` only; use `super_over` flag on fixture |
| No commentary text on balls | None — original design assumed this existed | Use structured `catchstump_id`/`runout_by_id` instead (better) |

## 5. Data Ingestion Pipeline

### Requests Per Match (SportMonks) — validated Mar 2026

| Step | Endpoint | Requests | Notes |
|---|---|---|---|
| Poll for completed matches | `GET /seasons/{seasonId}?include=fixtures` then filter by `status === 'Finished'` in code | 1 (shared) | `GET /fixtures?filter[...]` times out in practice — use season include instead |
| Fetch full scorecard (without dot balls) | `GET /fixtures/{id}?include=batting,bowling,lineup` | 1 per match | Sufficient for all scoring including fielding |
| Fetch full scorecard + ball-by-ball (with dot balls) | `GET /fixtures/{id}?include=batting,bowling,lineup,balls` | 1 per match | Only needed if dot ball scoring is kept |

**Double-header day total:** 1 poll + 2 scorecard requests = **3 requests** (well within 3,000/hr rate limit).

### Season Initialization (one-time)

At the start of the IPL season, admin triggers a one-time fixture import:
```
1. GET /seasons/{seasonId}?include=fixtures → fetch all ~74 IPL matches
   (IPL 2026 season_id = 1795, league_id = 1)
2. Create Match rows with date, localteam_id, visitorteam_id, apiMatchId
3. Auto-generate Gameweek rows (Mon-Sun windows covering the season)
4. Assign each Match to its Gameweek based on starting_at date
```
This pre-populates the Match table so cron jobs can check locally whether matches are scheduled today — **zero API calls on non-match days.**

### Hybrid Scoring Strategy (Hobby-compatible)

Vercel Hobby limits cron to once per day. Instead of paying for Pro ($20/mo), we use a hybrid approach:

**Primary: Admin-triggered import (on-demand)**
After each IPL match ends, admin taps "Import Scores" in the admin panel → `POST /api/scoring/import`. This runs the full pipeline (import + score + leaderboard) as a single API route handler within Hobby's 60s function limit.

**Safety net: Daily cron (midnight)**
```
# Runs once daily at midnight UTC — catches any matches admin missed
0 0 * * *
```
Same pipeline code, just triggered by cron instead of admin button.

### Scoring Pipeline (single unified flow)

Both triggers invoke the same pipeline:
```
1. Claim unscored matches using optimistic lock:
   UPDATE Match SET scoringStatus = 'scoring'
   WHERE scoringStatus = 'completed' RETURNING id
   → No rows returned → exit (another process claimed them, or nothing to score)
2. For each claimed match:
   a. GET /fixtures/{id}?include=batting,bowling,lineup[,balls]
      (balls include only needed if dot ball scoring is enabled)
   b. Parse batting include → extract batting stats + fielding attribution
      (catches from catch_stump_player_id, runouts from runout_by_id)
   c. Parse bowling include → extract bowling stats (+ dot balls from balls if enabled)
   d. Upsert PlayerPerformance rows (keyed on playerId + matchId)
   e. Set Match.scoringStatus = 'scored'
3. If gameweek has ended (all matches in GW are 'scored'):
   a. Aggregate player points across matches in the gameweek
   b. Apply bench auto-substitutions
   c. Apply captain/VC multipliers
   d. Apply chip effects (multiplicative with captain)
   e. Update leaderboard
```
Steps 2a-2d run in a database transaction per match. Step 3 only runs at gameweek end.

**Concurrency guard:** The `SET scoringStatus = 'scoring' WHERE scoringStatus = 'completed'` is an atomic claim — if admin and cron fire simultaneously, only one gets rows back. The other exits cleanly.

**Idempotency:** All writes use upserts keyed on `(playerId, matchId)`. Re-running the pipeline for the same match overwrites, not duplicates.

**Batch limit:** Pipeline processes at most 2 matches per invocation. If the midnight cron catches 3+ missed matches, it scores 2 and leaves the rest for the next daily run or manual trigger.

Estimated time: ~5-10s per match (well within 60s Hobby limit with 2-match batch cap).

### Match.scoringStatus State Machine
```
scheduled → completed → scoring → scored
                ↑                    |
                └── (re-score) ──────┘
```
`scheduled` = fixture pre-loaded, `completed` = match finished, `scoring` = claimed by pipeline (concurrency lock), `scored` = fantasy points written. Re-score resets to `completed` for reprocessing.

### Admin Controls
- **Import & Score:** `POST /api/scoring/import` — admin taps after each match to import stats and calculate scores (primary trigger)
- **Re-import:** `POST /api/scoring/recalculate/[matchId]` — re-fetch stats and recalculate a specific match (if API data was corrected)
- Both run as API route handlers within Hobby's 60s function limit

## 6. API Routes (Phase 1)

All routes require authentication via Auth.js session unless noted. Routes marked **(admin)** require the calling user to be the league admin (`league.adminUserId === session.userId`) or platform admin. Routes marked **(owner)** require the calling user to own the team (`team.userId === session.userId`).

**Error responses** (standard across all routes):
- `401` — Not authenticated (no valid session)
- `403` — Forbidden (not admin/owner for this resource)
- `404` — Resource not found
- `409` — Conflict (e.g., chip already used this season, player already on another team)
- `422` — Validation failure (e.g., invalid lineup, lock in effect)
- `423` — Locked (lineup lock in effect, no edits allowed)

### Auth:
- `POST /api/auth/[...nextauth]` — Auth.js handler (public)

### Leagues:
- `POST /api/leagues` — Create league (caller becomes admin)
- `GET /api/leagues` — List leagues the current user belongs to
- `GET /api/leagues/[id]` — League detail: settings, invite code, manager list **(member)**
- `GET /api/leagues/[id]/teams` — List all teams in the league with manager names **(member)**
- `POST /api/leagues/[id]/join` — Join via invite code (returns 409 if league full)
- `PUT /api/leagues/[id]/settings` — Update league settings **(admin)**
- `DELETE /api/leagues/[id]/managers/[userId]` — Remove a manager and their team **(admin)**

### Teams:
- `GET /api/teams/[teamId]` — Team detail: name, manager, squad size **(owner or league member)**
- `GET /api/teams/[teamId]/squad` — List players on this team **(owner or league member)**
- `POST /api/leagues/[id]/roster` — Upload roster CSV for all teams **(admin)**

### Lineups:
- `GET /api/teams/[teamId]/lineups/[gameweekId]` — Get lineup (playing XI, bench order, captain, VC, chip) **(owner)**
- `PUT /api/teams/[teamId]/lineups/[gameweekId]` — Submit/update lineup (upsert). Returns 423 if locked **(owner)**
- `POST /api/teams/[teamId]/lineups/[gameweekId]/chip` — Activate chip. Returns 409 if already used this season, 423 if locked **(owner)**
- `DELETE /api/teams/[teamId]/lineups/[gameweekId]/chip` — Deactivate chip before lock **(owner)**

### Scoring:
- `GET /api/leagues/[leagueId]/scores/[gameweekId]` — Gameweek scores for all teams in a league **(member)**
- `GET /api/teams/[teamId]/scores/[gameweekId]` — Detailed score breakdown for a single team (per-player points, subs, multipliers) **(owner or league member)**
- `POST /api/scoring/import` — Trigger match import + scoring pipeline **(admin)**
- `POST /api/scoring/recalculate/[matchId]` — Reset match to `completed` and re-score **(admin)**
- `GET /api/scoring/status` — List matches with their `scoringStatus` (scheduled/completed/scoring/scored) **(admin)**

### Season Admin:
- `POST /api/admin/season/init` — Import IPL fixture list from SportMonks (`GET /seasons/1795?include=fixtures`), create Match + Gameweek rows **(admin, one-time per season)**

### Leaderboard:
- `GET /api/leaderboard/[leagueId]` — Current league standings (total points, rank, GW points) **(member)**
- `GET /api/leaderboard/[leagueId]/history` — Gameweek-by-gameweek points per team **(member)**

### Players:
- `GET /api/players?role=BAT&team=MI&page=1&limit=25` — Search/filter players with pagination **(authenticated)**
- `GET /api/players/[id]` — Player detail: name, role, IPL team, current season stats **(authenticated)**

### Gameweeks:
- `GET /api/gameweeks/current` — Current gameweek info (number, lock time, matches, status) **(authenticated)**
- `GET /api/gameweeks` — List all gameweeks with status and match counts **(authenticated)**

## 7. Local Development Setup

### Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | 20+ | `brew install node` or [nodejs.org](https://nodejs.org) |
| npm | 10+ | Bundled with Node.js |
| PostgreSQL | 16+ (or use Neon) | `brew install postgresql@16` or use Neon free tier |
| Git | 2.40+ | `brew install git` |

### Installation

```bash
# 1. Clone the repo
git clone https://github.com/Fantasy-Auction-League/fal.git
cd fal

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env.local
```

Edit `.env.local` with your values:

```env
# Database (Neon free tier or local PostgreSQL)
DATABASE_URL="postgresql://user:password@host/fal?sslmode=require"

# Auth.js
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="generate-with-openssl-rand-base64-32"

# SportMonks Cricket API (€29/mo Major plan)
SPORTMONKS_API_TOKEN="your-api-token"

# IPL 2026 Season (validated)
SPORTMONKS_SEASON_ID="1795"
SPORTMONKS_LEAGUE_ID="1"
```

```bash
# 4. Initialize the database
npx prisma generate
npx prisma db push

# 5. Seed IPL players (from SportMonks)
# This pulls all 250 players and creates Player rows
npm run seed:players

# 6. Start the dev server
npm run dev
```

App runs at [http://localhost:3000](http://localhost:3000).

### Design Mockup Server

To preview UI mockups without the full app:

```bash
node server.js
```

Opens at [http://localhost:64472](http://localhost:64472). Routes: `/`, `/lineup`, `/leaderboard`, `/admin`, `/players`, `/scores`, `/standings`, `/view-lineup`.

### Environment Setup Notes

**Neon (recommended for dev):**
- Create a free project at [neon.tech](https://neon.tech)
- Copy the connection string from the dashboard into `DATABASE_URL`
- Neon auto-suspends after 5 min idle (~1s cold start on first request)

**Local PostgreSQL (alternative):**
```bash
brew install postgresql@16
brew services start postgresql@16
createdb fal
# DATABASE_URL="postgresql://localhost/fal"
```

**Auth.js:**
- Generate a secret: `openssl rand -base64 32`
- For OAuth providers (Google, GitHub), create OAuth apps and add client ID/secret to `.env.local`
- Credentials-based auth works without OAuth setup

**SportMonks API:**
- Sign up at [sportmonks.com](https://www.sportmonks.com) (14-day free trial, then €29/mo)
- API token from dashboard → Settings → API Tokens
- Rate limit: 3,000 calls/hr (FAL needs ~5 per match day)

### Project Structure (Phase 1)

```
fal/
├── app/                    # Next.js App Router
│   ├── api/                # API routes
│   │   ├── auth/           # Auth.js handlers
│   │   ├── leagues/        # League CRUD + join
│   │   ├── teams/          # Team + lineup management
│   │   ├── scoring/        # Import + recalculate
│   │   ├── admin/          # Season init
│   │   ├── leaderboard/    # Rankings
│   │   ├── players/        # Player search
│   │   └── gameweeks/      # GW info
│   ├── (auth)/             # Auth pages (login, register)
│   ├── dashboard/          # Dashboard page
│   ├── lineup/             # Lineup management page
│   ├── players/            # Player market page
│   ├── league/             # League admin page
│   └── layout.tsx          # Root layout
├── lib/
│   ├── scoring/            # Fantasy points engine
│   │   ├── batting.ts      # Batting points + SR bonus
│   │   ├── bowling.ts      # Bowling points + ER bonus
│   │   ├── fielding.ts     # Catches, stumpings, runouts
│   │   ├── multipliers.ts  # C/VC/chip effects
│   │   └── pipeline.ts     # Orchestrates full scoring flow
│   ├── sportmonks/         # SportMonks API client
│   │   ├── client.ts       # HTTP client with auth
│   │   ├── fixtures.ts     # Fixture + scorecard fetching
│   │   ├── players.ts      # Player/squad fetching
│   │   └── types.ts        # API response types
│   ├── auth.ts             # Auth.js config
│   └── db.ts               # Prisma client singleton
├── prisma/
│   └── schema.prisma       # Database schema
├── docs/                   # Design specs + mockups
├── server.js               # Mockup preview server
├── .env.local              # Local environment (git-ignored)
└── package.json
```

### Common Dev Commands

```bash
npm run dev              # Start Next.js dev server (localhost:3000)
npm run build            # Production build
npm run lint             # ESLint
npx prisma studio        # Visual database browser (localhost:5555)
npx prisma db push       # Push schema changes to database
npx prisma generate      # Regenerate Prisma client after schema changes
npx prisma migrate dev   # Create + apply migration
npm run seed:players     # Import IPL 2026 players from SportMonks
npm run seed:fixtures    # Import IPL 2026 fixtures from SportMonks
node server.js           # Mockup preview server (localhost:64472)
```

## 8. Hosting & Cost Breakdown

### Vercel Hobby Plan Fit

| Requirement | FAL Needs | Hobby (Free) | Fits? |
|---|---|---|---|
| **Cron frequency** | Daily safety net | Once per day | Yes |
| **On-demand scoring** | Admin triggers after each match | API routes (60s limit) | Yes |
| **Function duration** | 15-30s (scoring pipeline) | Max 60s | Yes |
| **Bandwidth** | ~15 managers, low traffic | 100 GB/mo | Yes |
| **Commercial use** | Private league with friends | Non-commercial only | OK (personal/friends use) |

**Hobby works** with the hybrid approach — admin-triggered scoring replaces the need for frequent cron jobs.

### Monthly Cost Estimate (IPL Season — ~2 months)

| Service | Plan | Cost | Notes |
|---|---|---|---|
| **Vercel** | Hobby | **$0** | Free — frontend, API routes, daily cron, `.vercel.app` domain |
| **Neon Postgres** | Free tier | **$0** | 0.5GB storage, 100 compute-hrs/mo, 10K pooled connections |
| **SportMonks** | Major plan | **€29/mo (~$31)** | 26 cricket leagues, 3,000 calls/hr, 14-day free trial |
| **Auth.js** | Open source | **$0** | Self-hosted, no per-user costs |
| **Domain** | Optional | ~$12/yr | Custom domain (Vercel provides free `.vercel.app` subdomain) |
| | | **~$31/mo** | **Total during IPL season** |

### Annual Cost Estimate

| Period | Duration | Monthly Cost | Total |
|---|---|---|---|
| **IPL season** | ~2 months (Mar-May) | $31/mo (SportMonks only) | $62 |
| **Off-season** | 10 months | $0 (cancel SportMonks) | $0 |
| **Domain (optional)** | 12 months | — | $12 |
| | | **Annual total** | **~$62-74/yr** |

### Neon Free Tier Fit Analysis

| Resource | Neon Free Provides | FAL Phase 1 Needs | Fits? |
|---|---|---|---|
| Storage | 0.5 GB | ~74 matches × ~30 players × ~50 bytes ≈ <1 MB match data + players, leagues, lineups | Yes |
| Compute hours | 100 CU-hrs/mo | Daily cron + admin triggers + user API calls (~15 managers) | Yes |
| Connections | 10,000 pooled (pgBouncer) | Serverless function connections (~10 concurrent) | Yes |
| Idle timeout | 5 min auto-suspend | First request after idle has ~1s cold start | OK |

**Neon free tier is sufficient for Phase 1.** Ball-by-ball storage for all 74 matches ≈ 2.2MB — well within 0.5GB.

### Cost Scaling (Phase 2+)

| Trigger | Action | Added Cost |
|---|---|---|
| Need frequent auto-scoring | Vercel Pro (minute-level cron) | $20/mo |
| >0.5GB DB storage | Neon Launch plan | $19/mo |
| Multiple admins/devs | Vercel Pro seats | $20/seat/mo |
| WebSocket auction engine | Vercel or external WS hosting | TBD |
| Heavy traffic (public leagues) | Vercel Pro + bandwidth | $20/mo + $0.06/GB over 1TB |

## 9. Future Architecture (Phase 2+)

### Auction Engine:
- Real-time bidding with WebSockets
- $100M manager budget, $1M starting price, $0.5M bid increment
- 10-second timer (reset on each bid)
- Bid validation: remaining budget must allow filling remaining roster at $1M each
- Anti-sniping, auto-bid, reconnect handling

### Mid-Season Auction:
- After 30 IPL matches
- Managers can sell players back (90% market value) and bid for replacements

### Market System:
- Dynamic player pricing based on performance
- Price history graphs

### Engagement Features:
- Power rankings, player analytics
- Trade analyzer, AI lineup suggestions
