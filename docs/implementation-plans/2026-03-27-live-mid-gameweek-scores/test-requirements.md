# Test Requirements: Live Mid-Gameweek Scores

## Automated Tests

| AC ID | Description | Test Type | Test File | Phase |
|-------|-------------|-----------|-----------|-------|
| AC1.1 | Base fantasy points correctly summed per player across scored matches | unit | `tests/unit/scoring-live.test.ts` | 1 |
| AC1.2 | Players with performances in multiple scored matches have points accumulated | unit | `tests/unit/scoring-live.test.ts` | 1 |
| AC1.3 | Players with 0 fantasy points included with 0, not excluded | unit | `tests/unit/scoring-live.test.ts` | 1 |
| AC2.1 | Captain's points doubled when captain has played in at least one scored match | unit | `tests/unit/scoring-live.test.ts` | 1 |
| AC2.2 | Captain who hasn't played shows 0 points (not doubled) | unit | `tests/unit/scoring-live.test.ts` | 1 |
| AC2.3 | Vice-captain does NOT get 2x in live mode (settlement-only) | unit | `tests/unit/scoring-live.test.ts` | 1 |
| AC3.1 | POWER_PLAY_BAT doubles BAT players' points in running total | unit | `tests/unit/scoring-live.test.ts` | 1 |
| AC3.2 | BOWLING_BOOST doubles BOWL players' points in running total | unit | `tests/unit/scoring-live.test.ts` | 1 |
| AC3.3 | BAT captain with POWER_PLAY_BAT gets captain 2x and chip 2x (4x total) | unit | `tests/unit/scoring-live.test.ts` | 1 |
| AC3.4 | No chip active = no chip bonus, just base + captain multiplier | unit | `tests/unit/scoring-live.test.ts` | 1 |
| AC4.1 | Only XI players contribute to live running total | unit | `tests/unit/scoring-live.test.ts` | 1 |
| AC4.2 | Bench players appear in response but points not counted in totalPoints | unit | `tests/unit/scoring-live.test.ts` | 1 |
| AC5.1 | No GameweekScore record returns `status: 'LIVE'` with computed running total | integration | `tests/integration/scoring-live-api.test.ts` | 2 |
| AC5.2 | GW with 0 scored matches returns `status: 'LIVE'`, `totalPoints: 0`, `matchesScored: 0` | integration | `tests/integration/scoring-live-api.test.ts` | 2 |
| AC5.3 | No lineup for team returns 404 or appropriate error | integration | `tests/integration/scoring-live-api.test.ts` | 2 |
| AC6.1 | GameweekScore exists returns `status: 'FINAL'` with stored totalPoints and PlayerScore breakdown | integration | `tests/integration/scoring-live-api.test.ts` | 2 |
| AC7.1 | LIVE response includes per-player basePoints, chipBonus, multipliedPoints, isCaptain, isVC, slotType | integration | `tests/integration/scoring-live-api.test.ts` | 2 |
| AC7.2 | Active chip type returned in chipActive field, total chip bonus in chipBonusPoints | integration | `tests/integration/scoring-live-api.test.ts` | 2 |
| AC8.1 | Response includes matchesScored and matchesTotal counts | integration | `tests/integration/scoring-live-api.test.ts` | 2 |
| AC9.1 | LIVE mode response includes `Cache-Control: public, s-maxage=60, stale-while-revalidate=300` | integration | `tests/integration/scoring-live-api.test.ts` | 2 |
| AC9.2 | FINAL mode response includes longer cache TTL header | integration | `tests/integration/scoring-live-api.test.ts` | 2 |
| AC10.1 | During active GW, leaderboard shows live running totals (season total + live GW) for each team | integration | `tests/integration/leaderboard-live.test.ts` | 3 |
| AC10.2 | Live GW scores include chip bonuses for teams with active chips | integration | `tests/integration/leaderboard-live.test.ts` | 3 |
| AC10.3 | When GW is finalized, leaderboard shows stored totals as before | integration | `tests/integration/leaderboard-live.test.ts` | 3 |
| AC10.4 | Batch computation uses aggregated queries, not N+1 per-team calls | integration | `tests/integration/scoring-live-api.test.ts` | 3 |
| AC11.1 | Leaderboard scores use locked GW lineup, not in-progress edits for future GWs | integration | `tests/integration/scoring-live-api.test.ts` | 3 |
| AC12.1 | Rank change indicator correct when team overtakes another via live GW points | integration | `tests/integration/leaderboard-live.test.ts` | 3 |

## Human Verification

| AC ID | Description | Why Not Automated | Verification Approach |
|-------|-------------|-------------------|----------------------|
| AC13.1 | During active GW, live GW card appears below hero showing running total, match progress, and chip badge | UI rendering with visual layout, pulsing animation, and card positioning require browser interaction | Load dashboard during an active GW with 4/7 matches scored. Verify: (1) live GW card appears below season total hero, (2) card shows running total matching API response, (3) match progress reads "4/7 matches", (4) active chip badge displays with bonus points |
| AC13.2 | After GW finalization, card shows "FINAL" with settled score | UI badge state change requires visual confirmation | Load dashboard after GW settlement. Verify: (1) card shows static "FINAL" badge, (2) score matches finalized GameweekScore, (3) no match progress or chip estimate shown |
| AC13.3 | No lineup submitted shows "No lineup submitted for GW N" | UI empty state rendering | Load dashboard for a team with no lineup for the current GW. Verify the appropriate empty state message renders |
| AC14.1 | GW detail sheet shows base pts to boosted pts per qualifying player (e.g., "45 -> 90") | Per-player chip progression display requires visual confirmation of formatted text and layout | Open GW detail sheet during active GW with POWER_PLAY_BAT chip. Verify: (1) BAT players show "basePoints -> multipliedPoints" format, (2) non-qualifying players show only multipliedPoints, (3) captain shows correct 2x then chip 2x stacking |
| AC14.2 | Active chip badge shown at top of detail sheet | Visual badge placement and styling | Open GW detail sheet with active chip. Verify chip badge appears at top with correct chip name and bonus point total |
| AC15.1 | LIVE mode shows pulsing green dot badge with "LIVE" text | CSS animation (pulsing dot) cannot be verified via unit/integration tests | Load dashboard during active GW. Verify: (1) green dot pulses with animation, (2) "LIVE" text appears next to dot, (3) pulsing animation is smooth |
| AC15.2 | FINAL mode shows static "FINAL" badge | Visual badge state | Load dashboard after GW settlement. Verify static "FINAL" badge appears without animation |
| AC16.1 | Standings header shows "Live Standings" with pulsing dot during active GW, "Standings" when finalized | Header text and animation state require browser verification | During active GW: verify header reads "Live Standings" with pulsing dot. After settlement: verify header reads "League Standings" with no dot |
| AC16.2 | Each standing row shows rank change indicator (up N, down N, or dash) | Directional arrows and color coding require visual confirmation | Load leaderboard during active GW where rank changes exist. Verify: (1) team that moved up shows green up arrow with correct number, (2) team that moved down shows red down arrow, (3) unchanged team shows grey dash |
| AC16.3 | GW column shows live running total including chip bonus during active GW | Column data rendering in standings table | During active GW: verify GW column shows live totals matching API. Verify team with active chip shows chip indicator |
| AC16.4 | Footer shows "Provisional -- bench subs not yet applied" during live mode | Footer text and conditional rendering | During active GW: verify footer disclaimer appears. After settlement: verify footer is absent or shows default text |

## Notes

- **AC IDs** use the `live-mid-gameweek-scores.ACx.y` naming from the phase files, shortened to `ACx.y` in the tables above for readability.
- **Phase 1** (unit tests) covers pure scoring logic with no DB dependency — fast, deterministic, high coverage of math.
- **Phase 2-3** (integration tests) cover DB-dependent orchestration, API response shape, cache headers, and batch query correctness using real PrismaClient against a test database.
- **Phase 4** (human verification) covers all UI/visual criteria. These require a running browser and cannot be meaningfully tested with unit or integration tests since the project uses inline styles in a single-file client component (`app/page.tsx`).
- **Live-to-Final transition** is covered as an additional integration test in `tests/integration/scoring-live-api.test.ts` (Phase 2, Task 2) — verifying that the same endpoint switches from LIVE to FINAL when a GameweekScore record is created.
- **AC10.4** (N+1 prevention) is verified structurally by testing that `computeLeagueLiveScores()` returns correct results from a single call, confirming the batch path works.
