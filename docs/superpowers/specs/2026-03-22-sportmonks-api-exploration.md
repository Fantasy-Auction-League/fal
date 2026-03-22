# FAL — SportMonks API Exploration

> Validated against 71 completed IPL 2025 matches (season_id=1689) using live API calls, March 2026.
> IPL 2026: season_id=1795, league_id=1, 10 teams, 74 fixtures.

## 1. Provider Comparison

| | SportMonks | CricketData.org | Roanuz | EntitySport |
|---|---|---|---|---|
| **Base URL** | `cricket.sportmonks.com/api/v2.0/` | `api.cricapi.com/v1/` | `sports.roanuz.com/` | `rest.entitysport.com/v2/` |
| **Auth** | API token (query param) | API key (query param) | API key | API key |
| **Pricing** | **€29/mo** (Major, 26 leagues) | Paid (unlisted) | **~$240/season** | **$250/mo** (Pro) |
| **Free tier** | 14-day trial only | 500 req/day (no scorecards) | Unknown | None |
| **IPL coverage** | Yes (confirmed IPL 2026) | Yes | Yes | Yes |
| **Composable includes** | Yes (`batting`, `bowling`, `lineup`, `runs`, `balls`) | No (fixed response) | Yes | Yes |
| **Ball-by-ball** | Yes — production ready | "Testing" status | Yes | Yes |
| **Fielding data** | Yes — in batting include (`catch_stump_player_id`, `runout_by_id`) | Yes (dedicated array) | Yes | Yes |
| **Rate limit** | 3,000 calls/hr | 500 req/day (free) | Unknown | 500K–2M/mo |

**Winner: SportMonks** — cheapest, single-request full scorecard, production ball-by-ball, confirmed IPL 2026.

## 2. Batting Scorecard Fields

| FAL Stat | SportMonks Field | Verified |
|---|---|---|
| Runs scored | `score` | Yes |
| Balls faced | `ball` | Yes |
| Fours hit | `four_x` | Yes |
| Sixes hit | `six_x` | Yes |
| Strike rate | `rate` (pre-computed) | Yes |
| Dismissal type | `wicket_id` (maps to score type ID) | Yes |
| Fielder (catch/stumping) | `catch_stump_player_id` | Yes |
| Fielder (runout thrower) | `runout_by_id` | Yes |
| Bowler who took wicket | `bowling_player_id` | Yes |

## 3. Dismissal Type Mapping

From `/scores` endpoint — `wicket_id` values:

| wicket_id | Name | IPL 2025 Count | Fielding Data |
|---|---|---|---|
| 54 | Catch Out | 601 | `catch_stump_player_id` = catcher |
| 55 | Catch Out (Sub) | 12 | `catch_stump_player_id` = sub fielder |
| 56 | Stump Out | 18 | `catch_stump_player_id` = keeper |
| 63 | Run Out | 37 | `runout_by_id` = thrower, `catch_stump_player_id` = collector |
| 64 | Run Out (Sub) | 1 | Same, substitute involved |
| 79 | Clean Bowled | 133 | No fielder |
| 83 | LBW OUT | 52 | No fielder |
| 84 | Not Out | 257 | N/A |
| 87 | Hit Wicket | 3 | No fielder |
| 138 | Retired Out | 2 | No fielder |

Additional run-out types: `65` (Run Out + 1 Run), `67` (+2 Runs), `22` (1 Wide + Run Out), etc. All follow same `runout_by_id`/`catch_stump_player_id` pattern.

## 4. Bowling Scorecard Fields

| FAL Stat | SportMonks Field | Verified |
|---|---|---|
| Overs bowled | `overs` | Yes |
| Maidens | `medians` (SportMonks typo) | Yes |
| Runs conceded | `runs` | Yes |
| Wickets taken | `wickets` | Yes |
| Economy rate | `rate` (pre-computed) | Yes |
| No balls | `noball` | Yes |
| Wides | `wide` | Yes |
| Dot balls | Not in bowling summary — compute from ball-by-ball | See Section 8 |

## 5. Fielding Data — Direct from Batting Include

**No ball-by-ball parsing needed.** All fielding attribution comes from the batting include:

| FAL Stat | SportMonks Field | Source | Verified |
|---|---|---|---|
| Catches | `catch_stump_player_id` where `wicket_id` = 54/55 | `?include=batting` | Yes (601 in IPL 2025) |
| Stumpings | `catch_stump_player_id` where `wicket_id` = 56 | `?include=batting` | Yes (18) |
| Runout thrower | `runout_by_id` where `wicket_id` = 63/64/65/67/68 | `?include=batting` | Yes (21) |
| Runout collector | `catch_stump_player_id` on same rows | `?include=batting` | Yes |

**Runout attribution:** Always returns 2 player IDs. `runout_by_id ≠ catch_stump_player_id` → assisted (6 pts each). Same → direct hit (12 pts). All 21 IPL 2025 runouts were assisted.

```typescript
// Fielding extraction — from batting include, no ball-by-ball needed
interface FieldingStats {
  playerId: number;
  catches: number;       // wicket_id IN (54, 55) AND catch_stump_player_id = player
  stumpings: number;     // wicket_id = 56 AND catch_stump_player_id = player
  runoutsDirect: number; // runout_by_id === catch_stump_player_id
  runoutsAssisted: number; // runout_by_id !== catch_stump_player_id
}
```

## 6. Fixture-Level Fields

| Field | Type | Description |
|---|---|---|
| `id` | number | Unique fixture ID |
| `localteam_id` | number | Home team ID |
| `visitorteam_id` | number | Away team ID |
| `starting_at` | datetime | Match start (UTC) |
| `status` | string | `NS`, `Finished`, etc. |
| `note` | string | "RCB won by 7 wickets (with 22 balls remaining)" |
| `winner_team_id` | number | Winning team |
| `toss_won_team_id` | number | Toss winner |
| `elected` | string | "batting" / "bowling" |
| `man_of_match_id` | number | MoM player ID |
| `super_over` | boolean | Super Over flag |
| `round` | string | "1st Match", etc. |

### Innings Summary (`?include=runs`)

| Field | Type | Description |
|---|---|---|
| `team_id` | number | Batting team |
| `inning` | number | 1 or 2 |
| `score` | number | Team total |
| `wickets` | number | Wickets fallen |
| `overs` | number | Overs bowled (e.g., 16.2) |

## 7. Lineup Include Fields

Each player in `?include=lineup` has a `lineup` sub-object:

| Field | Type | Description |
|---|---|---|
| `team_id` | number | IPL team in this match |
| `captain` | boolean | IPL match captain |
| `wicketkeeper` | boolean | Designated keeper |
| `substitution` | boolean | `false` = Starting XI, `true` = sub |

**Starting XI:** `substitution === false` → +4 pts.

**Impact Player detection:**
```typescript
const isImpactPlayer = (player, battedIds, bowledIds) =>
  player.lineup.substitution === true &&
  (battedIds.has(player.id) || bowledIds.has(player.id));
```
Validated: KKR's Vaibhav Arora (sub who bowled) and RCB's Devdutt Padikkal (sub who batted) correctly identified. Each team: 16 players (11 + 5 subs), 1 Impact Player per team.

## 8. Dot Ball Computation

Not in bowling summary. Computed from `?include=balls`:

**Ball `score` object:**
```json
{ "name": "No Run", "runs": 0, "four": false, "six": false,
  "bye": 0, "leg_bye": 0, "noball": 0, "is_wicket": false,
  "ball": true, "out": false }
```

**Formula:** `score.runs == 0 && score.ball == true && score.noball == 0 && score.bye == 0 && score.leg_bye == 0`

**Validated:** Match 65240 — 218 legal balls, 73 dot balls.

**Recommendation:** If dot balls are dropped (Design Spec Issue #2), no `balls` include needed at all.

## 9. Ball-by-Ball Data Structure

| Field | Type | Description |
|---|---|---|
| `id` | number | Unique ball ID |
| `ball` | number | Over.ball format (0.1 = first ball) |
| `scoreboard` | string | `S1` / `S2` (innings) |
| `batsman_id` | number | Striker |
| `bowler_id` | number | Bowler |
| `batsmanout_id` | number/null | Dismissed batsman |
| `catchstump_id` | number/null | Fielder |
| `runout_by_id` | number/null | Runout thrower |
| `score` | object | Scoring details (see above) |
| `batsman` | object | Full player object |
| `bowler` | object | Full player object |
| `team` | object | Batting team |

No `commentary` text field exists (original design assumed this).

## 10. API Usage Pattern

| Operation | Endpoint | When |
|---|---|---|
| Season init | `GET /seasons/1795?include=fixtures` | Once, pre-season |
| Squad import | `GET /teams/{id}/squad/1795` | Once per team, pre-season |
| Poll completed | `GET /seasons/1795?include=fixtures` → filter `status === 'Finished'` | Each scoring run |
| Full scorecard | `GET /fixtures/{id}?include=batting,bowling,lineup` | Per match |
| With dot balls | `GET /fixtures/{id}?include=batting,bowling,lineup,balls` | Per match (if dot balls kept) |

**Rate:** 3,000 calls/hr. FAL needs ~5 per match day.

Note: `GET /fixtures?filter[...]` times out in practice — use season include instead.

## 11. Design-to-API Gap Analysis

**20 data points fully covered.** No blocking gaps.

**Derived (not directly from API):**
| Data Point | Derivation |
|---|---|
| Impact Player (+4 pts) | Sub in batting/bowling data |
| Player auction price | App-internal (admin CSV) |
| Season/GW stats | Computed from PlayerPerformance |
| Form trends | Historical PlayerScore |
| Opponent display ("vs MI · Tue") | Player team ↔ fixture teams + starting_at |

**Accepted limitations:**
| Limitation | Impact | Mitigation |
|---|---|---|
| Overthrow boundary indistinguishable | ~2-3/season | Accept or admin correct |
| Super Over scoreboard values unvalidated | Rare | Filter S1/S2 only |
| No commentary text on balls | None | Use structured fields |

## Related Documents
- [Architecture](2026-03-15-fal-architecture.md) — System design, entities, API routes
- [Design Spec](2026-03-15-fal-design.md) — Scoring rules, chips, UI designs
- [Implementation Plan](2026-03-22-fal-implementation-plan.md) — Local setup, project structure, deployment
